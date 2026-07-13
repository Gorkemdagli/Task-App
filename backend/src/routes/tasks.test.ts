import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register } from '../services/auth.service';
import { createTeam, addMemberByDisplayId } from '../services/teams.service';
import * as tasksService from '../services/tasks.service';
import type { Actor } from '../lib/permissions';

async function cleanDb() {
  await prisma.taskComment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const bk = await redis.keys('blacklist:jti:*');
  if (bk.length) await redis.del(...bk);
  const sk = await redis.keys('session:*');
  if (sk.length) await redis.del(...sk);
}

async function makeAdmin(email: string, tenantName?: string) {
  const r = await register({
    fullName: 'Admin',
    email,
    password: 'hunter22',
    companyName: tenantName,
  });
  return r.user as Actor;
}

async function makeMember(email: string, tenantId: string) {
  const r = await register({ fullName: 'Member', email, password: 'hunter22' });
  await prisma.user.update({ where: { id: r.user.id }, data: { tenantId, role: 'member' } });
  return { ...r.user, role: 'member' as const, tenantId };
}

async function makeTeamWithRegularMember() {
  const admin = await makeAdmin('admin@a.com', 'Acme');
  const member = await makeMember('m@a.com', admin.tenantId!);
  const team = await createTeam({ name: 'Engineering' }, admin);
  await addMemberByDisplayId(team.id, member.displayId, admin);
  return { admin, member, team };
}

async function makeTeamWithTeamAdminMember() {
  const admin = await makeAdmin('admin@a.com', 'Acme');
  const member = await makeMember('m@a.com', admin.tenantId!);
  const team = await createTeam({ name: 'Engineering' }, admin);
  await addMemberByDisplayId(team.id, member.displayId, admin);
  await prisma.teamMember.update({
    where: { teamId_userId: { teamId: team.id, userId: member.id } },
    data: { role: 'teamAdmin' },
  });
  return { admin, member, team };
}

describe('createTask', () => {
  beforeEach(cleanDb);

  it('admin creates task and assigns to team member', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const task = await tasksService.createTask(
      { title: 'Login bug', priority: 'high', assigneeId: member.id, teamId: team.id },
      admin,
    );
    expect(task.title).toBe('Login bug');
    expect(task.assignerId).toBe(admin.id);
    expect(task.assigneeId).toBe(member.id);
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('high');
  });

  it('teamAdmin of the team can create task', async () => {
    const { member, team } = await makeTeamWithTeamAdminMember();
    const t = await tasksService.createTask(
      { title: 'T', priority: 'low', assigneeId: member.id, teamId: team.id },
      member,
    );
    expect(t.assignerId).toBe(member.id);
  });

  it('regular member cannot create task (403)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const member = await makeMember('m@a.com', admin.tenantId!);
    const team = await createTeam({ name: 'T' }, admin);
    await addMemberByDisplayId(team.id, member.displayId, admin);
    await expect(
      tasksService.createTask(
        { title: 'Nope', priority: 'low', assigneeId: member.id, teamId: team.id },
        member,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('assignee must be team member (400)', async () => {
    const { admin, team } = await makeTeamWithRegularMember();
    const outsider = await makeAdmin('out@b.com', 'Globex');
    await expect(
      tasksService.createTask(
        { title: 'Bad', priority: 'low', assigneeId: outsider.id, teamId: team.id },
        admin,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ASSIGNEE' });
  });

  it('creates notification for assignee', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    await tasksService.createTask(
      { title: 'Notif test', priority: 'medium', assigneeId: member.id, teamId: team.id },
      admin,
    );
    const notifs = await prisma.notification.findMany({ where: { userId: member.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('task_assigned');
  });

  it('does not notify assignee when self-assigned', async () => {
    const { admin, team } = await makeTeamWithRegularMember();
    // admin henüz team üyesi değil, ekle
    await addMemberByDisplayId(team.id, admin.displayId, admin);
    await tasksService.createTask(
      { title: 'Self', priority: 'low', assigneeId: admin.id, teamId: team.id },
      admin,
    );
    const notifs = await prisma.notification.findMany({
      where: { userId: admin.id, type: 'task_assigned' },
    });
    expect(notifs).toHaveLength(0);
  });
});

describe('listTasks', () => {
  beforeEach(cleanDb);

  it('member sees only their team tasks', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    await tasksService.createTask(
      { title: 'B', priority: 'high', assigneeId: member.id, teamId: team.id },
      admin,
    );
    const list = await tasksService.listTasks({ limit: 50, offset: 0 } as never, member);
    expect(list.tasks).toHaveLength(2);
    expect(list.total).toBe(2);
  });

  it('admin sees all tasks in tenant', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    const t2 = await createTeam({ name: 'Other' }, admin);
    // Admin t2'ye de üye olmalı ki kendine atayabilsin
    await addMemberByDisplayId(t2.id, admin.displayId, admin);
    await tasksService.createTask(
      { title: 'B', priority: 'low', assigneeId: admin.id, teamId: t2.id },
      admin,
    );
    const list = await tasksService.listTasks({ limit: 50, offset: 0 } as never, admin);
    expect(list.tasks).toHaveLength(2);
  });

  it('cross-tenant member sees nothing', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    const outsider = await makeAdmin('out@b.com', 'Globex');
    const list = await tasksService.listTasks({ limit: 50, offset: 0 } as never, outsider);
    expect(list.tasks).toHaveLength(0);
  });

  it('archived tasks hidden by default', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    await prisma.task.update({ where: { id: t.id }, data: { archivedAt: new Date() } });
    const list = await tasksService.listTasks({ limit: 50, offset: 0 } as never, admin);
    expect(list.tasks).toHaveLength(0);
  });

  it('archived tasks visible when includeArchived=true', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    await prisma.task.update({ where: { id: t.id }, data: { archivedAt: new Date() } });
    const list = await tasksService.listTasks(
      { limit: 50, offset: 0, includeArchived: true } as never,
      admin,
    );
    expect(list.tasks).toHaveLength(1);
  });
});

describe('updateTaskStatus', () => {
  beforeEach(cleanDb);

  it('assignee can update own task status', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    const updated = await tasksService.updateTaskStatus(t.id, { status: 'in_progress' }, member);
    expect(updated.status).toBe('in_progress');
  });

  it('teamAdmin of the team can update any task status', async () => {
    const { member, team } = await makeTeamWithTeamAdminMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      member,
    );
    const updated = await tasksService.updateTaskStatus(t.id, { status: 'done' }, member);
    expect(updated.status).toBe('done');
  });

  it('admin can update any task status', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    const updated = await tasksService.updateTaskStatus(t.id, { status: 'done' }, admin);
    expect(updated.status).toBe('done');
  });

  it('other team member cannot update status (403)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const assignee = await makeMember('a@a.com', admin.tenantId!);
    const intruder = await makeMember('i@a.com', admin.tenantId!);
    const team = await createTeam({ name: 'T' }, admin);
    await addMemberByDisplayId(team.id, assignee.displayId, admin);
    await addMemberByDisplayId(team.id, intruder.displayId, admin);
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: assignee.id, teamId: team.id },
      admin,
    );
    await expect(
      tasksService.updateTaskStatus(t.id, { status: 'done' }, intruder),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('updateTaskPriority', () => {
  beforeEach(cleanDb);

  it('assignee cannot change priority (403)', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    await expect(
      tasksService.updateTaskPriority(t.id, { priority: 'high' }, member),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('teamAdmin of the team can change priority', async () => {
    const { member, team } = await makeTeamWithTeamAdminMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      member,
    );
    const updated = await tasksService.updateTaskPriority(t.id, { priority: 'high' }, member);
    expect(updated.priority).toBe('high');
  });

  it('admin can change priority', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    const updated = await tasksService.updateTaskPriority(t.id, { priority: 'high' }, admin);
    expect(updated.priority).toBe('high');
  });
});

describe('deleteTask', () => {
  beforeEach(cleanDb);

  it('admin can delete task', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    await tasksService.deleteTask(t.id, admin);
    const found = await prisma.task.findUnique({ where: { id: t.id } });
    expect(found).toBeNull();
  });

  it('regular member cannot delete task (403)', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const assignee = await makeMember('a@a.com', admin.tenantId!);
    const team = await createTeam({ name: 'T' }, admin);
    await addMemberByDisplayId(team.id, assignee.displayId, admin);
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: assignee.id, teamId: team.id },
      admin,
    );
    await expect(tasksService.deleteTask(t.id, assignee)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('tenant isolation', () => {
  beforeEach(cleanDb);

  it('cross-tenant user cannot access task (404)', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeId: member.id, teamId: team.id },
      admin,
    );
    const outsider = await makeAdmin('out@b.com', 'Globex');
    await expect(tasksService.getTask(t.id, outsider)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('error cases', () => {
  beforeEach(cleanDb);

  it('returns 404 for missing task', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    await expect(
      tasksService.getTask('00000000-0000-0000-0000-000000000000', admin),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
