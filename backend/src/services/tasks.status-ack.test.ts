import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register } from './auth.service';
import { createTeam, addMemberByDisplayId } from './teams.service';
import * as tasksService from './tasks.service';
import { applyExpiredPendingStatuses } from './tasks.archive';
import type { Actor } from '../lib/permissions';

async function cleanDb() {
  await prisma.taskStatusAck.deleteMany();
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

async function makeAdmin(email: string, tenantName?: string): Promise<Actor> {
  const r = await register({
    fullName: 'Admin',
    email,
    password: 'hunter22',
    companyName: tenantName,
  });
  return r.user as Actor;
}

async function makeMember(email: string, tenantId: string): Promise<Actor> {
  const r = await register({ fullName: 'Member', email, password: 'hunter22' });
  await prisma.user.update({ where: { id: r.user.id }, data: { tenantId, role: 'member' } });
  return { ...r.user, role: 'member' as const, tenantId };
}

/** 2 assigneeli takım: admin + iki member (B, C). */
async function makeMultiAssigneeTeam() {
  const admin = await makeAdmin('admin@a.com', 'Acme');
  const b = await makeMember('b@a.com', admin.tenantId!);
  const c = await makeMember('c@a.com', admin.tenantId!);
  const team = await createTeam({ name: 'Eng' }, admin);
  await addMemberByDisplayId(team.id, b.displayId, admin);
  await addMemberByDisplayId(team.id, c.displayId, admin);
  return { admin, b, c, team };
}

async function makeMultiAssigneeTask() {
  const { admin, b, c, team } = await makeMultiAssigneeTeam();
  const task = await tasksService.createTask(
    { title: 'Multi', priority: 'medium', assigneeIds: [b.id, c.id], teamId: team.id },
    admin,
  );
  return { admin, b, c, team, task };
}

describe('proposeTaskStatus (multi-assignee)', () => {
  beforeEach(cleanDb);

  it('assignee propose: pending set, proposer auto-ack row, notify pending', async () => {
    const { b, c, task } = await makeMultiAssigneeTask();

    const updated = await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    expect(updated.status).toBe('todo');
    expect(updated.pendingStatus).toBe('in_progress');
    expect(updated.pendingProposedBy).toBe(b.id);

    // Proposer (assignee) implicit yes → explicit ack row ile kayıt altında.
    const acks = await prisma.taskStatusAck.findMany({ where: { taskId: task.id } });
    expect(acks).toHaveLength(1);
    expect(acks[0].userId).toBe(b.id);

    // Bildirim: C'ye task_status_pending (createTask'tan gelen task_assigned filtrelenir)
    const notifs = await prisma.notification.findMany({
      where: { userId: c.id, type: 'task_status_pending' },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('task_status_pending');
    // B proposer → kendine task_status_pending bildirimi yok
    const bNotifs = await prisma.notification.findMany({
      where: { userId: b.id, type: 'task_status_pending' },
    });
    expect(bNotifs).toHaveLength(0);
  });

  it('admin propose (multi-assignee, admin not assignee): pending set, no acks', async () => {
    const { admin, task } = await makeMultiAssigneeTask();

    const updated = await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, admin);

    // Admin bypass kaldırıldı (2026-07-25): multi-assignee + admin propose →
    // pending. Admin assignee değil → auto-ack row yok.
    expect(updated.status).toBe('todo');
    expect(updated.pendingStatus).toBe('in_progress');
    expect(updated.pendingProposedBy).toBe(admin.id);

    const acks = await prisma.taskStatusAck.findMany({ where: { taskId: task.id } });
    expect(acks).toHaveLength(0);
  });

  it('assignee propose on tek-assignee: direct apply atomik', async () => {
    const admin = await makeAdmin('admin@a.com', 'Acme');
    const b = await makeMember('b@a.com', admin.tenantId!);
    const team = await createTeam({ name: 'T' }, admin);
    await addMemberByDisplayId(team.id, b.displayId, admin);
    const task = await tasksService.createTask(
      { title: 'Single', priority: 'low', assigneeIds: [b.id], teamId: team.id },
      admin,
    );

    const updated = await tasksService.proposeTaskStatus(task.id, { status: 'done' }, b);

    expect(updated.status).toBe('done');
    expect(updated.pendingStatus).toBeNull();
    const acks = await prisma.taskStatusAck.findMany({ where: { taskId: task.id } });
    expect(acks).toHaveLength(0);
  });

  it('non-assignee non-admin propose: 403', async () => {
    const { admin, task } = await makeMultiAssigneeTask();
    const outsider = await makeMember('o@a.com', admin.tenantId!);
    const team = await createTeam({ name: 'Other' }, admin);
    await addMemberByDisplayId(team.id, outsider.displayId, admin);

    await expect(
      tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, outsider),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('cross-tenant propose: 404', async () => {
    const { task } = await makeMultiAssigneeTask();
    const otherTenantAdmin = await makeAdmin('x@x.com', 'Other');

    await expect(
      tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, otherTenantAdmin),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });
});

describe('ackTaskStatus', () => {
  beforeEach(cleanDb);

  it('kısmi ack: 3 assignees, 1 ack → status değişmez', async () => {
    const { b, c, task } = await makeMultiAssigneeSetup3();
    // b propose. ackCount=1 (proposer auto-ack).
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    const result = await tasksService.ackTaskStatus(task.id, c);

    expect(result.applied).toBe(false);
    expect(result.task.status).toBe('todo');
    expect(result.task.pendingStatus).toBe('in_progress');

    const acks = await prisma.taskStatusAck.findMany({ where: { taskId: task.id } });
    expect(acks).toHaveLength(2);
    expect(acks.find((a) => a.userId === b.id)).toBeDefined();
    expect(acks.find((a) => a.userId === c.id)).toBeDefined();
  });

  it('tüm assignees ack → apply + notify + acks cleared', async () => {
    const { b, c, task } = await makeMultiAssigneeTask();
    // b propose. ackCount=0.
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    const result = await tasksService.ackTaskStatus(task.id, c);

    expect(result.applied).toBe(true);
    expect(result.task.status).toBe('in_progress');
    expect(result.task.pendingStatus).toBeNull();
    expect(result.task.pendingProposedBy).toBeNull();

    const acks = await prisma.taskStatusAck.findMany({ where: { taskId: task.id } });
    expect(acks).toHaveLength(0);

    // Bildirim: actor=proposer b, recipients=[b,c]. b hariç → c.
    const notifs = await prisma.notification.findMany({
      where: { type: 'task_status_changed' },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].userId).toBe(c.id);
    expect(notifs[0].payload).toMatchObject({ oldStatus: 'todo', newStatus: 'in_progress' });
  });

  it('no pending: 400 NO_PENDING', async () => {
    const { c, task } = await makeMultiAssigneeTask();

    await expect(tasksService.ackTaskStatus(task.id, c)).rejects.toMatchObject({
      statusCode: 400,
      code: 'NO_PENDING',
    });
  });

  it('non-assignee ack: 403', async () => {
    const { admin, b, task } = await makeMultiAssigneeTask();
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);
    // admin aynı tenant'ta ama assignee değil → 403
    await expect(tasksService.ackTaskStatus(task.id, admin)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('cross-tenant ack: 404', async () => {
    const { b, task } = await makeMultiAssigneeTask();
    const otherTenantAdmin = await makeAdmin('x@x.com', 'Other');

    await expect(
      tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b),
    ).resolves.toBeDefined();

    await expect(tasksService.ackTaskStatus(task.id, otherTenantAdmin)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('proposer ack does not satisfy threshold: 2 assignees, proposer ack → status stays pending', async () => {
    // Bug repro: proposer ack'inin "implicit yes"ı sayması gerekir, ek ack olarak değil.
    // 2 assigneeli task'ta proposer b ack'lerse, c ack'lemeden status apply olmamalı.
    const { b, c, task } = await makeMultiAssigneeTask();
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    const result = await tasksService.ackTaskStatus(task.id, b);

    expect(result.applied).toBe(false);
    expect(result.task.status).toBe('todo');
    expect(result.task.pendingStatus).toBe('in_progress');

    // C ack: assignees-1=1, non-proposer ack count=1 >= 1 → apply.
    const cResult = await tasksService.ackTaskStatus(task.id, c);
    expect(cResult.applied).toBe(true);
    expect(cResult.task.status).toBe('in_progress');
  });

  it('ack idempotent: 3 assignees, aynı kişi iki kez ack → apply tetiklenmez', async () => {
    const { b, c, task } = await makeMultiAssigneeSetup3();
    // b propose. ackCount=0.
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);
    // c ack: ackCount=1, assignees=3. 1 < 2 → not apply.
    await tasksService.ackTaskStatus(task.id, c);
    // c ikinci kez ack: upsert idempotent, ackCount=1 < 2 → hala not apply.
    const result = await tasksService.ackTaskStatus(task.id, c);
    expect(result.applied).toBe(false);
    expect(result.task.status).toBe('todo');
    expect(result.task.pendingStatus).toBe('in_progress');
  });
});

describe('cancelTaskStatus', () => {
  beforeEach(cleanDb);

  it('proposer cancel: pending temizlenir, acks silinir', async () => {
    const { b, task } = await makeMultiAssigneeTask();
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    const updated = await tasksService.cancelTaskStatus(task.id, b);

    expect(updated.status).toBe('todo'); // status değişmedi
    expect(updated.pendingStatus).toBeNull();
    expect(updated.pendingProposedBy).toBeNull();

    const acks = await prisma.taskStatusAck.findMany({ where: { taskId: task.id } });
    expect(acks).toHaveLength(0);
  });

  it('admin cancel: pending temizlenir', async () => {
    const { admin, b, task } = await makeMultiAssigneeTask();
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    const updated = await tasksService.cancelTaskStatus(task.id, admin);

    expect(updated.pendingStatus).toBeNull();
    const acks = await prisma.taskStatusAck.findMany({ where: { taskId: task.id } });
    expect(acks).toHaveLength(0);
  });

  it('non-proposer non-admin cancel: 403', async () => {
    const { b, c, task } = await makeMultiAssigneeTask();
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    // C: assignee ama proposer değil
    await expect(tasksService.cancelTaskStatus(task.id, c)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('no pending cancel: 400 NO_PENDING', async () => {
    const { b, task } = await makeMultiAssigneeTask();

    await expect(tasksService.cancelTaskStatus(task.id, b)).rejects.toMatchObject({
      statusCode: 400,
      code: 'NO_PENDING',
    });
  });
});

describe('updateTaskFields — pending ack sync', () => {
  beforeEach(cleanDb);

  it('assignee add during pending: yeni ack row oluşur', async () => {
    const { admin, b, c, task } = await makeMultiAssigneeTask();
    // b propose. ackCount=1 (proposer auto-ack).
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    // Yeni assignee D ekle
    const d = await makeMember('d@a.com', admin.tenantId!);
    const team = await prisma.team.findFirst({ where: { tenantId: admin.tenantId } });
    await addMemberByDisplayId(team!.id, d.displayId, admin);

    await tasksService.updateTaskFields(task.id, { assigneeIds: [b.id, c.id, d.id] }, admin);

    // Sadece b'nin auto-ack row'u var. D yeni eklendi → ack row yok.
    const beforeApply = await prisma.taskStatusAck.count({ where: { taskId: task.id } });
    expect(beforeApply).toBe(1);

    // c ack: 2 total (b + c), threshold 3-1=2 non-proposer. non-proposer count=1 < 2 → not apply.
    const r1 = await tasksService.ackTaskStatus(task.id, c);
    expect(r1.applied).toBe(false);

    // d ack: non-proposer count=2 >= 2 → apply.
    const result = await tasksService.ackTaskStatus(task.id, d);
    expect(result.applied).toBe(true);
    expect(result.task.status).toBe('in_progress');
  });

  it('assignee remove during pending: ack row silinir, kalan ack tamam → apply', async () => {
    const { admin, b, c, task } = await makeMultiAssigneeTask();
    // b propose. ackCount=0.
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);
    // c ack: ackCount=1, assignees=2. 1 >= 1 → apply. status='in_progress'.
    await tasksService.ackTaskStatus(task.id, c);

    // Pending null zaten. b'yi çıkar: status değişmemeli.
    await tasksService.updateTaskFields(task.id, { assigneeIds: [c.id] }, admin);

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.status).toBe('in_progress');
    expect(updated?.pendingStatus).toBeNull();
  });

  it('assignee remove proposer during pending: pending iptal', async () => {
    const { admin, b, c, task } = await makeMultiAssigneeTask();
    // b propose. ackCount=0.
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    // b'yi çıkar (proposer → pendingCancelledByProposerRemoval=true)
    await tasksService.updateTaskFields(task.id, { assigneeIds: [c.id] }, admin);

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.pendingStatus).toBeNull();
    expect(updated?.status).toBe('todo');
  });

  it('assignee remove (proposer değil) → kalan ack tamam → apply', async () => {
    const { admin, c, d, task } = await makeMultiAssigneeSetup3();
    // c propose. ackCount=0.
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, c);
    // d ack. ackCount=1, assignees=3. 1 < 2 → not apply.
    await tasksService.ackTaskStatus(task.id, d);

    // b'yi çıkar: assignees = {c,d}. ackCount=1, assignees=2. 1 >= 1 → apply.
    await tasksService.updateTaskFields(task.id, { assigneeIds: [c.id, d.id] }, admin);

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.status).toBe('in_progress');
    expect(updated?.pendingStatus).toBeNull();
  });

  it('assignee remove (proposer değil) → kalan ack tamam değil, status değişmez', async () => {
    const { admin, c, d, task } = await makeMultiAssigneeSetup3();
    // c propose. ackCount=0.
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, c);

    // acks: {}. assignees: {b,c,d}. b'yi çıkar: acks = {}. assignees = {c,d}.
    // ackCount=0 < assignees-1=1 → not apply.
    await tasksService.updateTaskFields(task.id, { assigneeIds: [c.id, d.id] }, admin);

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.status).toBe('todo');
    expect(updated?.pendingStatus).toBe('in_progress');
  });
});

async function makeMultiAssigneeSetup3() {
  const admin = await makeAdmin('admin@a.com', 'Acme');
  const b = await makeMember('b@a.com', admin.tenantId!);
  const c = await makeMember('c@a.com', admin.tenantId!);
  const d = await makeMember('d@a.com', admin.tenantId!);
  const team = await createTeam({ name: 'Eng' }, admin);
  await addMemberByDisplayId(team.id, b.displayId, admin);
  await addMemberByDisplayId(team.id, c.displayId, admin);
  await addMemberByDisplayId(team.id, d.displayId, admin);
  const task = await tasksService.createTask(
    { title: 'Multi3', priority: 'medium', assigneeIds: [b.id, c.id, d.id], teamId: team.id },
    admin,
  );
  return { admin, b, c, d, team, task };
}

describe('applyExpiredPendingStatuses (cron)', () => {
  beforeEach(cleanDb);

  it('deadline geçmiş pending → apply + notify + acks cleared', async () => {
    const { b, c, task } = await makeMultiAssigneeTask();
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    // Deadline'ı geçmişe çek
    await prisma.task.update({
      where: { id: task.id },
      data: { deadline: new Date(Date.now() - 86400000) },
    });

    const result = await applyExpiredPendingStatuses();
    expect(result.appliedCount).toBe(1);

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.status).toBe('in_progress');
    expect(updated?.pendingStatus).toBeNull();

    const acks = await prisma.taskStatusAck.findMany({ where: { taskId: task.id } });
    expect(acks).toHaveLength(0);

    // Bildirim: actor=proposer b, recipients=[b,c]. b hariç → sadece c.
    const notifs = await prisma.notification.findMany({
      where: { type: 'task_status_changed' },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].userId).toBe(c.id);
    expect(notifs[0].payload).toMatchObject({ oldStatus: 'todo', newStatus: 'in_progress' });
  });

  it('deadline gelecek pending → uygulanmaz', async () => {
    const { b, task } = await makeMultiAssigneeTask();
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    await prisma.task.update({
      where: { id: task.id },
      data: { deadline: new Date(Date.now() + 86400000) },
    });

    const result = await applyExpiredPendingStatuses();
    expect(result.appliedCount).toBe(0);

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.status).toBe('todo');
    expect(updated?.pendingStatus).toBe('in_progress');
  });

  it('deadline null pending → uygulanmaz', async () => {
    const { b, task } = await makeMultiAssigneeTask();
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);

    // deadline hiç set edilmedi (null)
    const result = await applyExpiredPendingStatuses();
    expect(result.appliedCount).toBe(0);
  });
});

describe('updateTaskStatus (admin direct apply)', () => {
  beforeEach(cleanDb);

  it('admin direct update: pending clear + acks delete', async () => {
    const { admin, b, task } = await makeMultiAssigneeTask();
    await tasksService.proposeTaskStatus(task.id, { status: 'in_progress' }, b);
    // pending + ack row var

    const updated = await tasksService.updateTaskStatus(task.id, { status: 'done' }, admin);

    expect(updated.status).toBe('done');
    expect(updated.pendingStatus).toBeNull();
    const acks = await prisma.taskStatusAck.findMany({ where: { taskId: task.id } });
    expect(acks).toHaveLength(0);
  });

  it('assignee drag on multi → propose rotası (status değişmez)', async () => {
    const { b, task } = await makeMultiAssigneeTask();

    const updated = await tasksService.updateTaskStatus(task.id, { status: 'in_progress' }, b);

    expect(updated.status).toBe('todo');
    expect(updated.pendingStatus).toBe('in_progress');
  });
});
