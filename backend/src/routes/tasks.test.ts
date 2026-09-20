import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register } from '../services/auth.service';
import {
  createTeam as createTeamService,
  addMemberByDisplayId as addMemberService,
} from '../services/teams.service';
import * as taskServiceImpl from '../services/tasks.service';
import type { Actor } from '../lib/permissions';
import { withTenantContext } from '../db/withTenant';
import type { TenantDb } from '../db/types';

async function inTenant<T>(actor: Actor, work: (db: TenantDb) => Promise<T>): Promise<T> {
  return withTenantContext(actor.id, actor.tenantId!, work);
}

const createTeam = (input: Parameters<typeof createTeamService>[1], actor: Actor) =>
  inTenant(actor, (db) => createTeamService(db, input, actor));
const addMemberByDisplayId = (teamId: string, displayId: string, actor: Actor) =>
  inTenant(actor, (db) => addMemberService(db, teamId, displayId, actor));

const tasksService = {
  createTask: (input: Parameters<typeof taskServiceImpl.createTask>[1], actor: Actor) =>
    inTenant(actor, (db) => taskServiceImpl.createTask(db, input, actor)),
  listTasks: (query: Parameters<typeof taskServiceImpl.listTasks>[1], actor: Actor) =>
    inTenant(actor, (db) => taskServiceImpl.listTasks(db, query, actor)),
  getTask: (taskId: string, actor: Actor) =>
    inTenant(actor, (db) => taskServiceImpl.getTask(db, taskId, actor)),
  updateTaskStatus: (
    taskId: string,
    input: Parameters<typeof taskServiceImpl.updateTaskStatus>[2],
    actor: Actor,
  ) => inTenant(actor, (db) => taskServiceImpl.updateTaskStatus(db, taskId, input, actor)),
  updateTaskPriority: (
    taskId: string,
    input: Parameters<typeof taskServiceImpl.updateTaskPriority>[2],
    actor: Actor,
  ) => inTenant(actor, (db) => taskServiceImpl.updateTaskPriority(db, taskId, input, actor)),
  proposeTaskStatus: (
    taskId: string,
    input: Parameters<typeof taskServiceImpl.proposeTaskStatus>[2],
    actor: Actor,
  ) => inTenant(actor, (db) => taskServiceImpl.proposeTaskStatus(db, taskId, input, actor)),
  ackTaskStatus: (taskId: string, actor: Actor) =>
    inTenant(actor, (db) => taskServiceImpl.ackTaskStatus(db, taskId, actor)),
  cancelTaskStatus: (taskId: string, actor: Actor) =>
    inTenant(actor, (db) => taskServiceImpl.cancelTaskStatus(db, taskId, actor)),
  updateTaskFields: (
    taskId: string,
    input: Parameters<typeof taskServiceImpl.updateTaskFields>[2],
    actor: Actor,
  ) => inTenant(actor, (db) => taskServiceImpl.updateTaskFields(db, taskId, input, actor)),
  restoreTask: (
    taskId: string,
    input: Parameters<typeof taskServiceImpl.restoreTask>[2],
    actor: Actor,
  ) => inTenant(actor, (db) => taskServiceImpl.restoreTask(db, taskId, input, actor)),
  deleteTask: (taskId: string, actor: Actor) =>
    inTenant(actor, (db) => taskServiceImpl.deleteTask(db, taskId, actor)),
};

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

async function makeRouteTaskFixture() {
  const adminRegistration = await register({
    fullName: 'Route Admin',
    email: 'route-admin@example.com',
    password: 'hunter22',
    companyName: 'Route Acme',
  });
  const admin = adminRegistration.user as Actor;
  const memberRegistration = await register({
    fullName: 'Route Member',
    email: 'route-member@example.com',
    password: 'hunter22',
  });
  await prisma.user.update({
    where: { id: memberRegistration.user.id },
    data: { tenantId: admin.tenantId, role: 'member' },
  });
  const member = { ...memberRegistration.user, role: 'member' as const, tenantId: admin.tenantId };
  const team = await createTeam({ name: 'Route Engineering' }, admin);
  await addMemberByDisplayId(team.id, member.displayId, admin);
  const task = await tasksService.createTask(
    { title: 'Structured task', priority: 'medium', assigneeIds: [member.id], teamId: team.id },
    admin,
  );
  return {
    admin,
    adminAccessToken: adminRegistration.accessToken,
    member,
    memberAccessToken: memberRegistration.accessToken,
    team,
    task,
  };
}

describe('createTask', () => {
  beforeEach(cleanDb);

  it('admin creates task and assigns to team member', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const task = await tasksService.createTask(
      { title: 'Login bug', priority: 'high', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    expect(task.title).toBe('Login bug');
    expect(task.assignerId).toBe(admin.id);
    expect(task.assignees.map((a) => a.userId)).toContain(member.id);
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('high');

    const events = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: admin.id,
      eventType: 'task_created',
      fromStatus: null,
      toStatus: null,
    });
  });

  it('stores a nullable estimate in minutes', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const task = await tasksService.createTask(
      {
        title: 'Estimated task',
        priority: 'medium',
        estimateMinutes: 90,
        assigneeIds: [member.id],
        teamId: team.id,
      },
      admin,
    );

    expect(task.estimateMinutes).toBe(90);
  });

  it('teamAdmin of the team can create task', async () => {
    const { member, team } = await makeTeamWithTeamAdminMember();
    const t = await tasksService.createTask(
      { title: 'T', priority: 'low', assigneeIds: [member.id], teamId: team.id },
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
        { title: 'Nope', priority: 'low', assigneeIds: [member.id], teamId: team.id },
        member,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('assignee must be team member (400)', async () => {
    const { admin, team } = await makeTeamWithRegularMember();
    const outsider = await makeAdmin('out@b.com', 'Globex');
    await expect(
      tasksService.createTask(
        { title: 'Bad', priority: 'low', assigneeIds: [outsider.id], teamId: team.id },
        admin,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ASSIGNEE' });
  });

  it('creates notification for assignee', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    await tasksService.createTask(
      { title: 'Notif test', priority: 'medium', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    const notifs = await prisma.notification.findMany({ where: { userId: member.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('task_assigned');
  });

  it('suppresses assignment notification when preference is disabled', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    await prisma.user.update({ where: { id: member.id }, data: { notifyTaskAssigned: false } });

    await tasksService.createTask(
      { title: 'Muted assignment', priority: 'medium', assigneeIds: [member.id], teamId: team.id },
      admin,
    );

    const notifs = await prisma.notification.findMany({ where: { userId: member.id } });
    expect(notifs).toHaveLength(0);
  });

  it('does not notify assignee when self-assigned', async () => {
    const { admin, team } = await makeTeamWithRegularMember();
    // admin henüz team üyesi değil, ekle
    await addMemberByDisplayId(team.id, admin.displayId, admin);
    await tasksService.createTask(
      { title: 'Self', priority: 'low', assigneeIds: [admin.id], teamId: team.id },
      admin,
    );
    const notifs = await prisma.notification.findMany({
      where: { userId: admin.id, type: 'task_assigned' },
    });
    expect(notifs).toHaveLength(0);
  });
});

describe('updateTaskFields estimate', () => {
  beforeEach(cleanDb);

  it('updates and clears a nullable estimate without changing assignment scope', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const task = await tasksService.createTask(
      { title: 'Estimate update', priority: 'medium', assigneeIds: [member.id], teamId: team.id },
      admin,
    );

    const estimated = await tasksService.updateTaskFields(
      task.id,
      { estimateMinutes: 120 },
      admin,
    );
    expect(estimated.estimateMinutes).toBe(120);
    expect(estimated.assignees.map((assignee) => assignee.userId)).toEqual([member.id]);

    const cleared = await tasksService.updateTaskFields(task.id, { estimateMinutes: null }, admin);
    expect(cleared.estimateMinutes).toBeNull();
  });
});

describe('listTasks', () => {
  beforeEach(cleanDb);

  it('member sees only their team tasks', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    await tasksService.createTask(
      { title: 'B', priority: 'high', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    const list = await tasksService.listTasks({ limit: 50, offset: 0 } as never, member);
    expect(list.tasks).toHaveLength(2);
    expect(list.total).toBe(2);
  });

  it('admin sees all tasks in tenant', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    const t2 = await createTeam({ name: 'Other' }, admin);
    // Admin t2'ye de üye olmalı ki kendine atayabilsin
    await addMemberByDisplayId(t2.id, admin.displayId, admin);
    await tasksService.createTask(
      { title: 'B', priority: 'low', assigneeIds: [admin.id], teamId: t2.id },
      admin,
    );
    const list = await tasksService.listTasks({ limit: 50, offset: 0 } as never, admin);
    expect(list.tasks).toHaveLength(2);
  });

  it('cross-tenant member sees nothing', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    const outsider = await makeAdmin('out@b.com', 'Globex');
    const list = await tasksService.listTasks({ limit: 50, offset: 0 } as never, outsider);
    expect(list.tasks).toHaveLength(0);
  });

  it('archived tasks hidden by default', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    await prisma.task.update({ where: { id: t.id }, data: { archivedAt: new Date() } });
    const list = await tasksService.listTasks({ limit: 50, offset: 0 } as never, admin);
    expect(list.tasks).toHaveLength(0);
  });

  it('archived tasks visible when includeArchived=true', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
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
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    const updated = await tasksService.updateTaskStatus(t.id, { status: 'in_progress' }, member);
    expect(updated.status).toBe('in_progress');

    const events = await prisma.taskEvent.findMany({
      where: { taskId: t.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      actorId: member.id,
      eventType: 'status_changed',
      fromStatus: 'todo',
      toStatus: 'in_progress',
    });
  });

  it('same-status update creates no duplicate event', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const task = await tasksService.createTask(
      { title: 'No-op', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );

    await tasksService.updateTaskStatus(task.id, { status: 'todo' }, member);

    const events = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
    expect(events).toHaveLength(1);
  });

  it('done to active status creates one reopen event', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const task = await tasksService.createTask(
      { title: 'Reopen', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );

    await tasksService.updateTaskStatus(task.id, { status: 'done' }, member);
    await tasksService.updateTaskStatus(task.id, { status: 'in_progress' }, member);

    const events = await prisma.taskEvent.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events).toHaveLength(3);
    expect(events[2]).toMatchObject({
      actorId: member.id,
      eventType: 'task_reopened',
      fromStatus: 'done',
      toStatus: 'in_progress',
    });
  });

  it('event failure rolls back the status and lifecycle update', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const task = await tasksService.createTask(
      { title: 'Atomic event', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.raise_task_event_test()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$ BEGIN RAISE EXCEPTION 'task event failure'; END; $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER task_event_failure_test
      BEFORE INSERT ON "task_events"
      FOR EACH ROW EXECUTE FUNCTION public.raise_task_event_test();
    `);

    try {
      await expect(
        tasksService.updateTaskStatus(task.id, { status: 'done' }, member),
      ).rejects.toBeDefined();
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS task_event_failure_test ON "task_events"',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS public.raise_task_event_test()');
    }

    const persistedTask = await prisma.task.findUnique({ where: { id: task.id } });
    const events = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
    expect(persistedTask).toMatchObject({ status: 'todo', startedAt: null, completedAt: null });
    expect(events).toHaveLength(1);
  });

  it('teamAdmin of the team can update any task status', async () => {
    const { member, team } = await makeTeamWithTeamAdminMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      member,
    );
    const updated = await tasksService.updateTaskStatus(t.id, { status: 'done' }, member);
    expect(updated.status).toBe('done');
  });

  it('admin can update any task status', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
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
      { title: 'A', priority: 'low', assigneeIds: [assignee.id], teamId: team.id },
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
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    await expect(
      tasksService.updateTaskPriority(t.id, { priority: 'high' }, member),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('teamAdmin of the team can change priority', async () => {
    const { member, team } = await makeTeamWithTeamAdminMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      member,
    );
    const updated = await tasksService.updateTaskPriority(t.id, { priority: 'high' }, member);
    expect(updated.priority).toBe('high');
  });

  it('admin can change priority', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
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
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
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
      { title: 'A', priority: 'low', assigneeIds: [assignee.id], teamId: team.id },
      admin,
    );
    await expect(tasksService.deleteTask(t.id, assignee)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('restoreTask', () => {
  beforeEach(cleanDb);

  it('team admin restores an archived task with today-or-future deadline', async () => {
    const { member, team } = await makeTeamWithTeamAdminMember();
    const task = await tasksService.createTask(
      { title: 'Archived task', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      member,
    );
    await prisma.task.update({
      where: { id: task.id },
      data: { archivedAt: new Date(), deadline: new Date('2020-01-01T00:00:00.000Z') },
    });

    const restored = await tasksService.restoreTask(
      task.id,
      { deadline: new Date('2099-01-01T00:00:00.000Z') },
      member,
    );

    expect(restored.archivedAt).toBeNull();
    expect(restored.deadline?.toISOString()).toBe('2099-01-01T00:00:00.000Z');
  });

  it('company admin restores an archived task', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const task = await tasksService.createTask(
      { title: 'Archived task', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date() } });

    const restored = await tasksService.restoreTask(
      task.id,
      { deadline: new Date('2099-01-01T00:00:00.000Z') },
      admin,
    );

    expect(restored.archivedAt).toBeNull();
  });

  it('rejects restore for non-admin member', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const task = await tasksService.createTask(
      { title: 'Archived task', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date() } });

    await expect(
      tasksService.restoreTask(task.id, { deadline: new Date('2099-01-01T00:00:00.000Z') }, member),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a restore deadline before today', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const task = await tasksService.createTask(
      { title: 'Archived task', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date() } });

    await expect(
      tasksService.restoreTask(task.id, { deadline: new Date('2020-01-01T00:00:00.000Z') }, admin),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_RESTORE_DEADLINE' });
  });
});

describe('tenant isolation', () => {
  beforeEach(cleanDb);

  it('cross-tenant user cannot access task (404)', async () => {
    const { admin, member, team } = await makeTeamWithRegularMember();
    const t = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
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

describe('task block route validation', () => {
  beforeEach(cleanDb);

  it('rejects a malformed task id before calling the block service', async () => {
    const admin = await register({
      fullName: 'Block Route Admin',
      email: 'block-route-admin@example.com',
      password: 'hunter22',
      companyName: 'Block Route Co',
    });
    const updateTaskBlocked = vi.spyOn(taskServiceImpl, 'updateTaskBlocked');

    const response = await request(createApp())
      .patch('/api/v1/tasks/not-a-uuid/block')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isBlocked: true });

    expect(response.status).toBe(400);
    expect(updateTaskBlocked).not.toHaveBeenCalled();
    updateTaskBlocked.mockRestore();
  });
});

describe('structured task field routes', () => {
  beforeEach(cleanDb);

  it('keeps a demoted task assigner able to assign, but denies admin-only fields', async () => {
    const { admin, member, team } = await makeTeamWithTeamAdminMember();
    const second = await makeMember('demoted-assigner-second@example.com', admin.tenantId!);
    await addMemberByDisplayId(team.id, second.displayId, admin);
    const task = await tasksService.createTask(
      { title: 'Demoted assigner task', priority: 'medium', assigneeIds: [member.id], teamId: team.id },
      member,
    );
    await prisma.teamMember.update({
      where: { teamId_userId: { teamId: team.id, userId: member.id } },
      data: { role: 'member' },
    });

    const updated = await tasksService.updateTaskFields(
      task.id,
      { assigneeIds: [member.id, second.id] },
      member,
    );
    expect(updated.assignees.map((assignee) => assignee.userId)).toContain(second.id);
    await expect(
      tasksService.updateTaskFields(task.id, { targetAudience: 'Nope' }, member),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('allows an in-scope Team Admin to update all structured fields', async () => {
    const { admin, member, memberAccessToken, task, team } = await makeRouteTaskFixture();
    await prisma.teamMember.update({
      where: { teamId_userId: { teamId: team.id, userId: member.id } },
      data: { role: 'teamAdmin' },
    });

    const response = await request(createApp())
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .send({
        scopeItems: ['  Senaryo  ', '  Metin  '],
        targetAudience: '  Kullanıcılar  ',
        expectedOutput: '  MP4 video  ',
        tags: ['  Mobil  ', 'MOBİL'],
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      scopeItems: ['Senaryo', 'Metin'],
      targetAudience: 'Kullanıcılar',
      expectedOutput: 'MP4 video',
      tags: ['Mobil'],
    });
    expect(response.body.assignerId).toBe(admin.id);
  });

  it('allows a Company Admin to update structured fields within the tenant', async () => {
    const { adminAccessToken, task } = await makeRouteTaskFixture();

    const response = await request(createApp())
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ targetAudience: 'Şirket', tags: ['plan'] });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      scopeItems: [],
      targetAudience: 'Şirket',
      expectedOutput: null,
      tags: ['plan'],
    });
  });

  it('denies a regular Member from updating structured fields', async () => {
    const { memberAccessToken, task } = await makeRouteTaskFixture();

    const response = await request(createApp())
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .send({ targetAudience: 'Nope' });

    expect(response.status).toBe(403);
  });

  it('denies a Team Admin from another team', async () => {
    const { admin, task } = await makeRouteTaskFixture();
    const outsiderRegistration = await register({
      fullName: 'Other Team Admin',
      email: 'other-team-admin@example.com',
      password: 'hunter22',
    });
    await prisma.user.update({
      where: { id: outsiderRegistration.user.id },
      data: { tenantId: admin.tenantId, role: 'member' },
    });
    const otherTeam = await createTeam({ name: 'Other Engineering' }, admin);
    await addMemberByDisplayId(otherTeam.id, outsiderRegistration.user.displayId, admin);
    await prisma.teamMember.update({
      where: {
        teamId_userId: { teamId: otherTeam.id, userId: outsiderRegistration.user.id },
      },
      data: { role: 'teamAdmin' },
    });

    const response = await request(createApp())
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Authorization', `Bearer ${outsiderRegistration.accessToken}`)
      .send({ targetAudience: 'Nope' });

    expect(response.status).toBe(403);
  });

  it('returns no task data for a wrong-tenant direct request', async () => {
    const { task } = await makeRouteTaskFixture();
    const outsiderRegistration = await register({
      fullName: 'Wrong Tenant Admin',
      email: 'wrong-tenant-admin@example.com',
      password: 'hunter22',
      companyName: 'Route Globex',
    });

    const response = await request(createApp())
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Authorization', `Bearer ${outsiderRegistration.accessToken}`)
      .send({ targetAudience: 'Nope' });

    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('title');
    expect(response.body).not.toHaveProperty('scopeItems');
  });
});

describe('task history route', () => {
  beforeEach(cleanDb);

  it('returns newest task events with cursor pagination', async () => {
    const { task, memberAccessToken } = await makeRouteTaskFixture();
    const status = await request(createApp())
      .patch(`/api/v1/tasks/${task.id}/status`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .send({ status: 'in_progress' });
    expect(status.status).toBe(200);

    const first = await request(createApp())
      .get(`/api/v1/tasks/${task.id}/history?limit=1`)
      .set('Authorization', `Bearer ${memberAccessToken}`);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({
      eventType: 'status_changed',
      actor: { id: task.assignees?.[0]?.userId ?? expect.any(String), name: 'Route Member' },
    });
    expect(typeof first.body.nextCursor).toBe('string');

    const second = await request(createApp())
      .get(`/api/v1/tasks/${task.id}/history?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`)
      .set('Authorization', `Bearer ${memberAccessToken}`);
    expect(second.status).toBe(200);
    expect(second.body.items[0].eventType).toBe('task_created');
    expect(second.body.nextCursor).toBeNull();
  });

  it('does not reveal history across tenants', async () => {
    const { task } = await makeRouteTaskFixture();
    const foreign = await register({
      fullName: 'Foreign Admin',
      email: 'history-foreign@example.com',
      password: 'hunter22',
      companyName: 'Foreign History Co',
    });

    const response = await request(createApp())
      .get(`/api/v1/tasks/${task.id}/history`)
      .set('Authorization', `Bearer ${foreign.accessToken}`);
    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('items');
  });

  it.each(['0', '51', '1.5', 'not-a-number'])('rejects invalid history limit %s', async (limit) => {
    const { task, memberAccessToken } = await makeRouteTaskFixture();
    const response = await request(createApp())
      .get(`/api/v1/tasks/${task.id}/history?limit=${limit}`)
      .set('Authorization', `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Bad Request');
    expect(Array.isArray(response.body.issues)).toBe(true);
  });
});
