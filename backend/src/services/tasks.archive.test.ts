import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register } from '../services/auth.service';
import {
  createTeam as createTeamService,
  addMemberByDisplayId as addMemberService,
} from '../services/teams.service';
import * as taskServiceImpl from '../services/tasks.service';
import { archiveExpiredTasks as archiveExpiredTasksService } from './tasks.archive';
import type { Actor } from '../lib/permissions';
import { withTenantContext } from '../db/withTenant';
import type { TenantDb } from '../db/types';

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
const archiveExpiredTasks = (actor: Actor) =>
  inTenant(actor, (db) => archiveExpiredTasksService(db, actor.tenantId!));

async function makeSetup() {
  const admin = (
    await register({
      fullName: 'A',
      email: 'a@a.com',
      password: 'hunter22',
      companyName: 'Acme',
    })
  ).user as Actor;
  const member = await register({ fullName: 'M', email: 'm@a.com', password: 'hunter22' });
  await prisma.user.update({
    where: { id: member.user.id },
    data: { tenantId: admin.tenantId, role: 'member' },
  });
  const team = await createTeam({ name: 'T' }, admin);
  await addMemberByDisplayId(team.id, member.user.displayId, admin);
  return { admin, member: member.user, team };
}

describe('archiveExpiredTasks', () => {
  beforeEach(cleanDb);
  afterEach(() => vi.useRealTimers());

  it('uses the next UTC calendar day as the archive boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'));
    const { admin, member, team } = await makeSetup();
    const dates = [
      new Date('2026-08-12T00:00:00.000Z'),
      new Date('2026-08-13T00:00:00.000Z'),
      new Date('2026-08-14T00:00:00.000Z'),
    ];
    const tasks = await Promise.all(
      dates.map((deadline, index) =>
        tasksService
          .createTask(
            {
              title: `boundary-${index}`,
              priority: 'low',
              assigneeIds: [member.id],
              teamId: team.id,
            },
            admin,
          )
          .then((task) =>
            prisma.task.update({
              where: { id: task.id },
              data: { status: 'done', deadline },
            }),
          ),
      ),
    );

    const result = await archiveExpiredTasks(admin);
    expect(result.archivedCount).toBe(1);
    const archived = await prisma.task.findMany({
      where: { id: { in: tasks.map((task) => task.id) }, archivedAt: { not: null } },
    });
    expect(archived).toHaveLength(1);
    expect(archived[0].deadline?.toISOString()).toBe('2026-08-12T00:00:00.000Z');
  });

  it('archives done tasks with past deadline', async () => {
    const { admin, member, team } = await makeSetup();
    const t = await tasksService.createTask(
      { title: 'done-past', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    await prisma.task.update({
      where: { id: t.id },
      data: { status: 'done', deadline: new Date(Date.now() - 86400000) },
    });

    const result = await archiveExpiredTasks(admin);
    expect(result.archivedCount).toBe(1);

    const found = await prisma.task.findUnique({ where: { id: t.id } });
    expect(found?.archivedAt).not.toBeNull();
  });

  it('skips done tasks with future deadline', async () => {
    const { admin, member, team } = await makeSetup();
    const t = await tasksService.createTask(
      { title: 'done-future', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    await prisma.task.update({
      where: { id: t.id },
      data: { status: 'done', deadline: new Date(Date.now() + 86400000) },
    });

    const result = await archiveExpiredTasks(admin);
    expect(result.archivedCount).toBe(0);

    const found = await prisma.task.findUnique({ where: { id: t.id } });
    expect(found?.archivedAt).toBeNull();
  });

  it('skips already archived tasks', async () => {
    const { admin, member, team } = await makeSetup();
    const t = await tasksService.createTask(
      { title: 'already', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    const archivedAt = new Date();
    await prisma.task.update({
      where: { id: t.id },
      data: { status: 'done', deadline: new Date(Date.now() - 86400000), archivedAt },
    });

    const result = await archiveExpiredTasks(admin);
    expect(result.archivedCount).toBe(0);

    const found = await prisma.task.findUnique({ where: { id: t.id } });
    expect(found?.archivedAt?.getTime()).toBe(archivedAt.getTime());
  });

  it('skips non-done tasks even with past deadline', async () => {
    const { admin, member, team } = await makeSetup();
    const t = await tasksService.createTask(
      { title: 'todo-past', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    await prisma.task.update({
      where: { id: t.id },
      data: { deadline: new Date(Date.now() - 86400000) },
    });

    const result = await archiveExpiredTasks(admin);
    expect(result.archivedCount).toBe(0);
  });

  it('archives multiple matching tasks in one run', async () => {
    const { admin, member, team } = await makeSetup();
    const t1 = await tasksService.createTask(
      { title: 'A', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    const t2 = await tasksService.createTask(
      { title: 'B', priority: 'low', assigneeIds: [member.id], teamId: team.id },
      admin,
    );
    await prisma.task.updateMany({
      where: { id: { in: [t1.id, t2.id] } },
      data: { status: 'done', deadline: new Date(Date.now() - 86400000) },
    });

    const result = await archiveExpiredTasks(admin);
    expect(result.archivedCount).toBe(2);
  });
});
