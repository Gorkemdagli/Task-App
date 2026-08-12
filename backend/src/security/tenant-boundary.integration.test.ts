import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { withTenantContext } from '../db/withTenant';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';
import { register } from '../services/auth.service';
import {
  addMemberByDisplayId as addMemberService,
  createTeam as createTeamService,
  removeMember as removeMemberService,
} from '../services/teams.service';
import * as taskServiceImpl from '../services/tasks.service';

async function inTenant<T>(actor: Actor, work: (db: TenantDb) => Promise<T>): Promise<T> {
  return withTenantContext(actor.id, actor.tenantId!, work);
}

const createTeam = (input: Parameters<typeof createTeamService>[1], actor: Actor) =>
  inTenant(actor, (db) => createTeamService(db, input, actor));
const addMemberByDisplayId = (teamId: string, displayId: string, actor: Actor) =>
  inTenant(actor, (db) => addMemberService(db, teamId, displayId, actor));
const removeMember = (teamId: string, userId: string, actor: Actor) =>
  inTenant(actor, (db) => removeMemberService(db, teamId, userId, actor));

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
  updateTaskFields: (
    taskId: string,
    input: Parameters<typeof taskServiceImpl.updateTaskFields>[2],
    actor: Actor,
  ) => inTenant(actor, (db) => taskServiceImpl.updateTaskFields(db, taskId, input, actor)),
  ackTaskStatus: (taskId: string, actor: Actor) =>
    inTenant(actor, (db) => taskServiceImpl.ackTaskStatus(db, taskId, actor)),
  cancelTaskStatus: (taskId: string, actor: Actor) =>
    inTenant(actor, (db) => taskServiceImpl.cancelTaskStatus(db, taskId, actor)),
  deleteTask: (taskId: string, actor: Actor) =>
    inTenant(actor, (db) => taskServiceImpl.deleteTask(db, taskId, actor)),
};

async function cleanDb() {
  await prisma.taskStatusAck.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const blacklistKeys = await redis.keys('blacklist:jti:*');
  if (blacklistKeys.length) await redis.del(...blacklistKeys);
  const sessionKeys = await redis.keys('session:*');
  if (sessionKeys.length) await redis.del(...sessionKeys);
}

async function makeAdmin(email: string, companyName: string): Promise<Actor> {
  return (await register({ fullName: 'Admin', email, password: 'hunter22', companyName }))
    .user as Actor;
}

type MemberActor = Actor & { displayId: string };

async function makeMember(email: string, tenantId: string): Promise<MemberActor> {
  const result = await register({ fullName: 'Member', email, password: 'hunter22' });
  await prisma.user.update({
    where: { id: result.user.id },
    data: { tenantId, role: 'member' },
  });
  return { ...result.user, role: 'member', tenantId } as MemberActor;
}

async function makeScenario() {
  const tenantAAdmin = await makeAdmin('a-admin@example.com', 'Tenant A');
  const tenantAMember = await makeMember('a-member@example.com', tenantAAdmin.tenantId!);
  const tenantBAdmin = await makeAdmin('b-admin@example.com', 'Tenant B');
  const team = await createTeam({ name: 'A Team' }, tenantAAdmin);
  await addMemberByDisplayId(team.id, tenantAMember.displayId, tenantAAdmin);
  const task = await tasksService.createTask(
    { title: 'A task', priority: 'medium', assigneeIds: [tenantAMember.id], teamId: team.id },
    tenantAAdmin,
  );
  return { tenantAAdmin, tenantAMember, tenantBAdmin, team, task };
}

describe('tenant boundary integration', () => {
  beforeEach(cleanDb);

  it('blocks every task read/write mutation across tenants', async () => {
    const { tenantBAdmin, task } = await makeScenario();
    const notFound = { statusCode: 404, code: 'NOT_FOUND' };

    await expect(
      tasksService.listTasks({ limit: 50, offset: 0 } as never, tenantBAdmin),
    ).resolves.toMatchObject({
      tasks: [],
      total: 0,
    });
    await expect(tasksService.getTask(task.id, tenantBAdmin)).rejects.toMatchObject(notFound);
    await expect(
      tasksService.updateTaskStatus(task.id, { status: 'done' }, tenantBAdmin),
    ).rejects.toMatchObject(notFound);
    await expect(
      tasksService.updateTaskPriority(task.id, { priority: 'high' }, tenantBAdmin),
    ).rejects.toMatchObject(notFound);
    await expect(
      tasksService.updateTaskFields(task.id, { title: 'cross-tenant' }, tenantBAdmin),
    ).rejects.toMatchObject(notFound);
    await expect(tasksService.ackTaskStatus(task.id, tenantBAdmin)).rejects.toMatchObject(notFound);
    await expect(tasksService.cancelTaskStatus(task.id, tenantBAdmin)).rejects.toMatchObject(
      notFound,
    );
    await expect(tasksService.deleteTask(task.id, tenantBAdmin)).rejects.toMatchObject(notFound);
  });

  it('denies same-tenant non-members and removed members', async () => {
    const { tenantAAdmin, tenantAMember, team, task } = await makeScenario();
    const intruder = await makeMember('a-intruder@example.com', tenantAAdmin.tenantId!);
    await addMemberByDisplayId(team.id, intruder.displayId, tenantAAdmin);

    await expect(
      tasksService.updateTaskStatus(task.id, { status: 'done' }, intruder),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    await expect(removeMember(team.id, tenantAMember.id, tenantAAdmin)).rejects.toMatchObject({
      statusCode: 409,
      code: 'MEMBER_HAS_ACTIVE_TASKS',
    });
    await prisma.task.update({ where: { id: task.id }, data: { status: 'done' } });
    await removeMember(team.id, tenantAMember.id, tenantAAdmin);
    await expect(
      tasksService.updateTaskStatus(task.id, { status: 'done' }, tenantAMember),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});
