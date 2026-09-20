import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { withTenantContext } from '../db/withTenant';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';
import { register } from './auth.service';
import { createTeam, addMemberByDisplayId } from './teams.service';
import { createTask, updateTaskFields, updateTaskPriority } from './tasks.service';
import { createComment } from './comments.service';
import { appendTaskEvent, listTaskHistory } from './task-events.service';

async function cleanDb() {
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
  const admin = (
    await register({
      fullName: 'History Admin',
      email: 'history-admin@example.com',
      password: 'hunter22',
      companyName: 'History Co',
    })
  ).user as Actor;
  const memberRegistration = await register({
    fullName: 'History Member',
    email: 'history-member@example.com',
    password: 'hunter22',
  });
  await prisma.user.update({
    where: { id: memberRegistration.user.id },
    data: { tenantId: admin.tenantId, role: 'member' },
  });
  const member = {
    ...memberRegistration.user,
    role: 'member' as const,
    tenantId: admin.tenantId,
  };
  const team = await inTenant(admin, (db) => createTeam(db, { name: 'History' }, admin));
  await inTenant(admin, (db) => addMemberByDisplayId(db, team.id, member.displayId, admin));
  const task = await inTenant(admin, (db) =>
    createTask(
      db,
      { title: 'History task', priority: 'medium', assigneeIds: [member.id], teamId: team.id },
      admin,
    ),
  );
  return { admin, member, team, task };
}

describe('task event history', () => {
  beforeEach(cleanDb);

  it('appends typed metadata and lists equal-timestamp events newest first', async () => {
    const { admin, member, task } = await makeFixture();
    await inTenant(admin, async (db) => {
      for (let index = 0; index < 4; index += 1) {
        await appendTaskEvent(db, {
          taskId: task.id,
          actorId: admin.id,
          eventType: 'priority_changed',
          metadata: { oldPriority: 'low', newPriority: 'medium', index },
        });
      }
    });

    const createdAt = new Date('2026-09-20T10:00:00.000Z');
    await prisma.taskEvent.updateMany({ where: { taskId: task.id }, data: { createdAt } });
    const expected = await prisma.taskEvent.findMany({
      where: { taskId: task.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });

    const first = await inTenant(member, (db) =>
      listTaskHistory(db, task.id, member, { limit: 2 }),
    );
    expect(first.items.map((item) => item.id)).toEqual(expected.slice(0, 2).map((item) => item.id));
    expect(first.items[0]?.actor).toEqual({ id: admin.id, name: 'History Admin' });
    expect(first.items.find((item) => item.eventType === 'priority_changed')?.metadata).toMatchObject({
      oldPriority: 'low',
      newPriority: 'medium',
    });

    const second = await inTenant(member, (db) =>
      listTaskHistory(db, task.id, member, { limit: 2, cursor: first.nextCursor ?? undefined }),
    );
    expect(second.items.map((item) => item.id)).toEqual(expected.slice(2, 4).map((item) => item.id));
    const third = await inTenant(member, (db) =>
      listTaskHistory(db, task.id, member, { limit: 2, cursor: second.nextCursor ?? undefined }),
    );
    expect(third.items.map((item) => item.id)).toEqual(expected.slice(4).map((item) => item.id));
    expect(third.nextCursor).toBeNull();
    expect([...first.items, ...second.items, ...third.items].map((item) => item.id)).toEqual(
      expected.map((item) => item.id),
    );
  });

  it('uses a stable actor fallback when the event user is unavailable', async () => {
    const { admin, member, task } = await makeFixture();
    const deletedUserId = randomUUID();
    await inTenant(admin, (db) =>
      appendTaskEvent(db, {
        taskId: task.id,
        actorId: deletedUserId,
        eventType: 'file_added',
      }),
    );

    const result = await inTenant(member, (db) =>
      listTaskHistory(db, task.id, member, { limit: 50 }),
    );
    expect(result.items.find((item) => item.actor.id === deletedUserId)?.actor).toEqual({
      id: deletedUserId,
      name: 'Deleted user',
    });
  });

  it('records assignment, priority, and deadline changes without recording comments', async () => {
    const { admin, member, team, task } = await makeFixture();
    const secondRegistration = await register({
      fullName: 'Second Member',
      email: 'history-second@example.com',
      password: 'hunter22',
    });
    await prisma.user.update({
      where: { id: secondRegistration.user.id },
      data: { tenantId: admin.tenantId, role: 'member' },
    });
    const second = { ...secondRegistration.user, role: 'member' as const, tenantId: admin.tenantId };
    await inTenant(admin, (db) => addMemberByDisplayId(db, team.id, second.displayId, admin));

    await inTenant(admin, (db) => updateTaskPriority(db, task.id, { priority: 'high' }, admin));
    await inTenant(admin, (db) =>
      updateTaskFields(
        db,
        task.id,
        { assigneeIds: [member.id, second.id], deadline: new Date('2026-09-22T00:00:00.000Z') },
        admin,
      ),
    );
    await inTenant(admin, (db) =>
      updateTaskFields(db, task.id, { assigneeIds: [member.id], deadline: null }, admin),
    );
    const countBeforeComment = await prisma.taskEvent.count({ where: { taskId: task.id } });
    await inTenant(member, (db) => createComment(db, task.id, { body: 'Still working' }, member));

    const events = await prisma.taskEvent.findMany({
      where: { taskId: task.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(events.map((event) => event.eventType)).toEqual([
      'task_created',
      'priority_changed',
      'assignee_added',
      'deadline_changed',
      'assignee_removed',
      'deadline_changed',
    ]);
    expect(events[1]?.metadata).toEqual({ oldPriority: 'medium', newPriority: 'high' });
    expect(events[2]?.metadata).toEqual({
      affectedUserIds: [second.id],
      affectedDisplayNames: ['Second Member'],
    });
    expect(events[3]?.metadata).toEqual({
      oldDeadline: null,
      newDeadline: '2026-09-22T00:00:00.000Z',
    });
    expect(events[4]?.metadata).toEqual({
      affectedUserIds: [second.id],
      affectedDisplayNames: ['Second Member'],
    });
    expect(events[5]?.metadata).toEqual({
      oldDeadline: '2026-09-22T00:00:00.000Z',
      newDeadline: null,
    });
    expect(await prisma.taskEvent.count({ where: { taskId: task.id } })).toBe(countBeforeComment);
  });
});
