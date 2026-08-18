import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register } from '../services/auth.service';
import {
  createTeam as createTeamService,
  addMemberByDisplayId as addMemberService,
} from '../services/teams.service';
import * as taskServiceImpl from '../services/tasks.service';
import * as commentServiceImpl from '../services/comments.service';
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
};
const commentsService = {
  createComment: (
    taskId: string,
    input: Parameters<typeof commentServiceImpl.createComment>[2],
    actor: Actor,
  ) => inTenant(actor, (db) => commentServiceImpl.createComment(db, taskId, input, actor)),
  listComments: (taskId: string, actor: Actor) =>
    inTenant(actor, (db) => commentServiceImpl.listComments(db, taskId, actor)),
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

async function makeSetup() {
  const admin = await makeAdmin('admin@a.com', 'Acme');
  const assignee = await makeMember('a@a.com', admin.tenantId!);
  const team = await createTeam({ name: 'T' }, admin);
  await addMemberByDisplayId(team.id, assignee.displayId, admin);
  const task = await tasksService.createTask(
    { title: 'Task', priority: 'low', assigneeIds: [assignee.id], teamId: team.id },
    admin,
  );
  return { admin, assignee, team, task };
}

describe('createComment', () => {
  beforeEach(cleanDb);

  it('team member can comment', async () => {
    const { assignee, task } = await makeSetup();
    const comment = await commentsService.createComment(task.id, { body: 'Hello' }, assignee);
    expect(comment.body).toBe('Hello');
    expect(comment.author.id).toBe(assignee.id);
  });

  it('assigner (admin) can comment', async () => {
    const { admin, task } = await makeSetup();
    const comment = await commentsService.createComment(task.id, { body: 'Check this' }, admin);
    expect(comment.author.id).toBe(admin.id);
  });

  it('cross-tenant user cannot comment (404)', async () => {
    const { task } = await makeSetup();
    const outsider = await makeAdmin('out@b.com', 'Globex');
    await expect(
      commentsService.createComment(task.id, { body: 'X' }, outsider),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('notifies assigner and assignee', async () => {
    const { admin, assignee, task } = await makeSetup();
    // Önceki task_assigned bildirimlerini temizle (test izolasyonu)
    await prisma.notification.deleteMany();
    await commentsService.createComment(task.id, { body: 'Hi' }, assignee);
    // assignee yazdı → assigner (admin) bildirim almalı
    const adminNotifs = await prisma.notification.findMany({
      where: { userId: admin.id, type: 'task_commented' },
    });
    expect(adminNotifs).toHaveLength(1);
    // Kendine bildirim gitmemeli
    const selfNotifs = await prisma.notification.findMany({
      where: { userId: assignee.id, type: 'task_commented' },
    });
    expect(selfNotifs).toHaveLength(0);
  });

  it('suppresses comment notification when preference is disabled', async () => {
    const { admin, assignee, task } = await makeSetup();
    await prisma.user.update({ where: { id: admin.id }, data: { notifyTaskCommented: false } });
    await prisma.notification.deleteMany();

    await commentsService.createComment(task.id, { body: 'Muted' }, assignee);

    expect(
      await prisma.notification.findMany({ where: { userId: admin.id, type: 'task_commented' } }),
    ).toHaveLength(0);
  });

  it('notifies prior commenters', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const m1 = await makeMember('m1@a.com', admin.tenantId!);
    const m2 = await makeMember('m2@a.com', admin.tenantId!);
    const team = await createTeam({ name: 'T' }, admin);
    await addMemberByDisplayId(team.id, m1.displayId, admin);
    await addMemberByDisplayId(team.id, m2.displayId, admin);
    const task = await tasksService.createTask(
      { title: 'T', priority: 'low', assigneeIds: [m1.id], teamId: team.id },
      admin,
    );
    // Sadece bu test'ten gelen bildirimleri say: temizle, 1 yorum yap, kontrol et
    await prisma.notification.deleteMany();
    await commentsService.createComment(task.id, { body: 'only' }, m2);
    // m2 yazdı → assigner=admin + assignee=m1 + önceki yorumcu yok → admin + m1 (dedupe: assignee + önceki yorumcu = m1)
    const adminNotifs = await prisma.notification.findMany({
      where: { userId: admin.id, type: 'task_commented' },
    });
    const m1Notifs = await prisma.notification.findMany({
      where: { userId: m1.id, type: 'task_commented' },
    });
    expect(adminNotifs).toHaveLength(1);
    expect(m1Notifs).toHaveLength(1);
  });
});

describe('listComments', () => {
  beforeEach(cleanDb);

  it('returns comments in chronological order', async () => {
    const { assignee, task } = await makeSetup();
    await commentsService.createComment(task.id, { body: 'one' }, assignee);
    await commentsService.createComment(task.id, { body: 'two' }, assignee);
    const list = await commentsService.listComments(task.id, assignee);
    expect(list.map((c) => c.body)).toEqual(['one', 'two']);
  });

  it('cross-tenant cannot list (404)', async () => {
    const { task } = await makeSetup();
    const outsider = await makeAdmin('out@b.com', 'Globex');
    await expect(commentsService.listComments(task.id, outsider)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
