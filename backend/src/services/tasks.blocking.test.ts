import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma';
import { withTenantContext } from '../db/withTenant';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';
import { register } from './auth.service';
import { createTeam as createTeamService, addMemberByDisplayId } from './teams.service';
import * as taskService from './tasks.service';

async function cleanDb() {
  await prisma.taskComment.deleteMany();
  await prisma.taskEvent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
}

async function inTenant<T>(actor: Actor, work: (db: TenantDb) => Promise<T>): Promise<T> {
  return withTenantContext(actor.id, actor.tenantId!, work);
}

async function makeFixture() {
  const adminResult = await register({
    fullName: 'Admin',
    email: 'blocking-admin@example.com',
    password: 'hunter22',
    companyName: 'Blocking Co',
  });
  const memberResult = await register({
    fullName: 'Member',
    email: 'blocking-member@example.com',
    password: 'hunter22',
  });
  await prisma.user.update({
    where: { id: memberResult.user.id },
    data: { tenantId: adminResult.user.tenantId, role: 'member' },
  });
  const admin = adminResult.user as Actor;
  const member = { ...memberResult.user, role: 'member' as const, tenantId: admin.tenantId };
  const team = await inTenant(admin, (db) => createTeamService(db, { name: 'Blocking' }, admin));
  await inTenant(admin, (db) => addMemberByDisplayId(db, team.id, member.displayId, admin));
  const task = await inTenant(admin, (db) =>
    taskService.createTask(
      db,
      { title: 'Blocked task', priority: 'medium', assigneeIds: [member.id], teamId: team.id },
      admin,
    ),
  );
  return { admin, member, team, task };
}

describe('task blocking', () => {
  beforeEach(cleanDb);

  it('atomically records block/unblock transitions and is idempotent', async () => {
    const { member, task } = await makeFixture();

    const blocked = await inTenant(member, (db) =>
      taskService.updateTaskBlocked(
        db,
        task.id,
        { isBlocked: true, blockedReason: 'Waiting for API' },
        member,
      ),
    );
    expect(blocked).toMatchObject({ isBlocked: true, blockedReason: 'Waiting for API' });
    expect((blocked as { blockedSince: Date | null }).blockedSince).toBeInstanceOf(Date);

    const reasonEdited = await inTenant(member, (db) =>
      taskService.updateTaskBlocked(
        db,
        task.id,
        { isBlocked: true, blockedReason: 'Still waiting' },
        member,
      ),
    );
    expect(reasonEdited.blockedSince).toEqual(blocked.blockedSince);
    expect(reasonEdited.blockedReason).toBe('Still waiting');
    expect(await prisma.taskEvent.count({ where: { taskId: task.id, eventType: 'task_blocked' } })).toBe(1);

    const unblocked = await inTenant(member, (db) =>
      taskService.updateTaskBlocked(db, task.id, { isBlocked: false }, member),
    );
    expect(unblocked).toMatchObject({ isBlocked: false, blockedSince: null, blockedReason: null });
    expect(await prisma.taskEvent.count({ where: { taskId: task.id, eventType: 'task_unblocked' } })).toBe(1);

    const events = await prisma.taskEvent.findMany({
      where: { taskId: task.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(events.map((event) => event.eventType)).toEqual([
      'task_created',
      'task_blocked',
      'task_unblocked',
    ]);
    expect(events[1]?.metadata).toEqual({ blockedReason: 'Waiting for API' });
    expect(events[1]?.createdAt).toBeInstanceOf(Date);
    expect(events[2]?.createdAt).toBeInstanceOf(Date);
    expect(events[2]!.createdAt.getTime()).toBeGreaterThanOrEqual(events[1]!.createdAt.getTime());
  });

  it('denies a member who is not assigned to the task', async () => {
    const { admin, task } = await makeFixture();
    const outsiderResult = await register({
      fullName: 'Outsider',
      email: 'blocking-outsider@example.com',
      password: 'hunter22',
    });
    const outsider = { ...outsiderResult.user, role: 'member' as const, tenantId: admin.tenantId };
    await expect(
      inTenant(outsider, (db) =>
        taskService.updateTaskBlocked(
          db,
          task.id,
          { isBlocked: true, blockedReason: 'No access' },
          outsider,
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('denies a cross-tenant block request before loading the task', async () => {
    const { task } = await makeFixture();
    const foreignResult = await register({
      fullName: 'Foreign Admin',
      email: 'blocking-foreign-admin@example.com',
      password: 'hunter22',
      companyName: 'Foreign Blocking Co',
    });
    const foreignAdmin = foreignResult.user as Actor;

    await expect(
      inTenant(foreignAdmin, (db) =>
        taskService.updateTaskBlocked(
          db,
          task.id,
          { isBlocked: true, blockedReason: 'Cross tenant' },
          foreignAdmin,
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      isBlocked: false,
      blockedSince: null,
      blockedReason: null,
    });
    expect(await prisma.taskEvent.count({ where: { taskId: task.id, eventType: 'task_blocked' } })).toBe(0);
  });

  it('rolls back the block state when the block event insert fails', async () => {
    const { member, task } = await makeFixture();
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.raise_task_block_event_test()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$ BEGIN RAISE EXCEPTION 'task block event failure'; END; $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER task_block_event_failure_test
      BEFORE INSERT ON "task_events"
      FOR EACH ROW EXECUTE FUNCTION public.raise_task_block_event_test();
    `);

    try {
      await expect(
        inTenant(member, (db) =>
          taskService.updateTaskBlocked(
            db,
            task.id,
            { isBlocked: true, blockedReason: 'Event unavailable' },
            member,
          ),
        ),
      ).rejects.toBeDefined();
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS task_block_event_failure_test ON "task_events"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS public.raise_task_block_event_test()',
      );
    }

    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      isBlocked: false,
      blockedSince: null,
      blockedReason: null,
    });
    expect(await prisma.taskEvent.count({ where: { taskId: task.id } })).toBe(1);
  });
});
