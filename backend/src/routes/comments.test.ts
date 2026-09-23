import { describe, it, expect, beforeEach } from 'vitest';
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

async function makeRouteSetup() {
  const adminRegistration = await register({
    fullName: 'Route Admin',
    email: 'route-admin@comments.test',
    password: 'hunter22',
    companyName: 'Comments Co',
  });
  const admin = adminRegistration.user as Actor;
  const memberRegistration = await register({
    fullName: 'Route Member',
    email: 'route-member@comments.test',
    password: 'hunter22',
  });
  await prisma.user.update({
    where: { id: memberRegistration.user.id },
    data: { tenantId: admin.tenantId, role: 'member' },
  });
  const assignee = {
    ...memberRegistration.user,
    role: 'member' as const,
    tenantId: admin.tenantId,
  };
  const team = await createTeam({ name: 'Comments' }, admin);
  await addMemberByDisplayId(team.id, assignee.displayId, admin);
  const task = await tasksService.createTask(
    { title: 'Comment route task', priority: 'low', assigneeIds: [assignee.id], teamId: team.id },
    admin,
  );
  return { task, memberAccessToken: memberRegistration.accessToken };
}

describe('comment routes', () => {
  beforeEach(cleanDb);

  it('creates and lists comments over HTTP', async () => {
    const { task, memberAccessToken } = await makeRouteSetup();
    const app = createApp();
    const created = await request(app)
      .post(`/api/v1/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .send({ body: ' Hello ' });

    expect(created.status).toBe(201);
    expect(created.body.body).toBe('Hello');

    const listed = await request(app)
      .get(`/api/v1/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${memberAccessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.comments.map((comment: { body: string }) => comment.body)).toEqual(['Hello']);
  });

  it('rejects an empty comment body over HTTP', async () => {
    const { task, memberAccessToken } = await makeRouteSetup();
    const response = await request(createApp())
      .post(`/api/v1/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .send({ body: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Bad Request');
  });

  it('does not reveal comments to a different tenant over HTTP', async () => {
    const { task } = await makeRouteSetup();
    const outsider = await register({
      fullName: 'Foreign Admin',
      email: 'foreign-admin@comments.test',
      password: 'hunter22',
      companyName: 'Other Comments Co',
    });
    const response = await request(createApp())
      .get(`/api/v1/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${outsider.accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('comments');
  });
});

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

  it('does not notify company admins about comments', async () => {
    const { admin, assignee, task } = await makeSetup();
    // Önceki task_assigned bildirimlerini temizle (test izolasyonu)
    await prisma.notification.deleteMany();
    await commentsService.createComment(task.id, { body: 'Hi' }, assignee);
    // Company Admin task assigner olsa da comment notification almaz.
    const adminNotifs = await prisma.notification.findMany({
      where: { userId: admin.id, type: 'task_commented' },
    });
    expect(adminNotifs).toHaveLength(0);
    // Kendine bildirim gitmemeli
    const selfNotifs = await prisma.notification.findMany({
      where: { userId: assignee.id, type: 'task_commented' },
    });
    expect(selfNotifs).toHaveLength(0);
  });

  it('suppresses comment notification when preference is disabled', async () => {
    const { admin, assignee, team, task } = await makeSetup();
    const priorCommenter = await makeMember('prior-commenter@a.com', admin.tenantId!);
    await addMemberByDisplayId(team.id, priorCommenter.displayId, admin);
    await commentsService.createComment(task.id, { body: 'First' }, priorCommenter);
    await prisma.user.update({
      where: { id: priorCommenter.id },
      data: { notifyTaskCommented: false },
    });
    await prisma.notification.deleteMany();

    await commentsService.createComment(task.id, { body: 'Muted' }, assignee);

    expect(
      await prisma.notification.findMany({
        where: { userId: priorCommenter.id, type: 'task_commented' },
      }),
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
    // Company Admin assigner is filtered; only the other member receives the comment.
    const adminNotifs = await prisma.notification.findMany({
      where: { userId: admin.id, type: 'task_commented' },
    });
    const m1Notifs = await prisma.notification.findMany({
      where: { userId: m1.id, type: 'task_commented' },
    });
    expect(adminNotifs).toHaveLength(0);
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
