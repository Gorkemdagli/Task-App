import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { register } from './auth.service';
import { createTeam, addMemberByDisplayId } from './teams.service';
import { createTask } from './tasks.service';
import { withTenantContext } from '../db/withTenant';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';
import type { TaskFileStorage } from '../lib/taskFileStorage';
import {
  createTaskFileDownload,
  createTaskFileRecord,
  listTaskFiles,
  markTaskFileDeleted,
} from './task-files.service';

async function inTenant<T>(actor: Actor, work: (db: TenantDb) => Promise<T>): Promise<T> {
  return withTenantContext(actor.id, actor.tenantId!, work);
}

async function cleanDb() {
  await prisma.taskFile.deleteMany();
  await prisma.taskEvent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const keys = await redis.keys('session:*');
  if (keys.length) await redis.del(...keys);
}

async function makeAdmin(email: string, companyName: string): Promise<Actor> {
  return (await register({ fullName: 'File Admin', email, password: 'hunter22', companyName })).user as Actor;
}

async function makeMember(email: string, tenantId: string): Promise<Actor & { displayId: string }> {
  const result = await register({ fullName: 'File Member', email, password: 'hunter22' });
  await prisma.user.update({ where: { id: result.user.id }, data: { tenantId, role: 'member' } });
  return { ...result.user, role: 'member', tenantId };
}

async function makeFixture() {
  const admin = await makeAdmin('task-files-admin@example.com', 'Task Files Co');
  const member = await makeMember('task-files-member@example.com', admin.tenantId!);
  const team = await inTenant(admin, (db) => createTeam(db, { name: 'Files' }, admin));
  await inTenant(admin, (db) => addMemberByDisplayId(db, team.id, member.displayId, admin));
  const task = await inTenant(admin, (db) =>
    createTask(
      db,
      { title: 'File task', priority: 'medium', assigneeIds: [member.id], teamId: team.id },
      admin,
    ),
  );
  return { admin, member, team, task };
}

function makeStorage() {
  const uploaded: string[] = [];
  const removed: string[] = [];
  const signed: string[] = [];
  const storage: TaskFileStorage = {
    upload: vi.fn(async (path) => {
      uploaded.push(path);
    }),
    createDownloadUrl: vi.fn(async (path) => {
      signed.push(path);
      return { url: 'https://signed.example/task-file', expiresAt: '2026-09-20T10:01:00.000Z' };
    }),
    remove: vi.fn(async (path) => {
      removed.push(path);
    }),
  };
  return { storage, uploaded, removed, signed };
}

const upload = {
  originalName: 'report.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 5,
  data: Buffer.from('%PDF-'),
};

describe('task file service', () => {
  beforeEach(cleanDb);

  it('uploads first, records one event, and lists active files with scoped deletion state', async () => {
    const { admin, member, task } = await makeFixture();
    const secondMember = await makeMember('task-files-second@example.com', admin.tenantId!);
    await inTenant(admin, (db) =>
      addMemberByDisplayId(db, task.teamId, secondMember.displayId, admin),
    );
    const fake = makeStorage();

    const created = await inTenant(member, (db) =>
      createTaskFileRecord(db, task.id, upload, member, fake.storage),
    );
    expect(created).toMatchObject({
      originalName: 'report.pdf',
      uploader: { id: member.id, name: 'File Member' },
      canDelete: true,
    });
    expect(fake.uploaded[0]).toMatch(new RegExp(`^tenants/${admin.tenantId}/tasks/${task.id}/files/[^/]+$`));
    expect(fake.uploaded[0]).not.toContain('report.pdf');

    const events = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
    expect(events.filter((event) => event.eventType === 'file_added')).toHaveLength(1);

    const listed = await inTenant(secondMember, (db) => listTaskFiles(db, task.id, secondMember));
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: created.id,
      uploader: { id: member.id, name: 'File Member' },
      canDelete: false,
    });

    const path = await inTenant(secondMember, (db) =>
      createTaskFileDownload(db, task.id, created.id, secondMember),
    );
    expect(path).toBe(fake.uploaded[0]);
  });

  it('compensates storage when metadata/event transaction fails', async () => {
    const { admin, task } = await makeFixture();
    const fake = makeStorage();
    const db = {
      task: {
        findFirst: vi.fn().mockResolvedValue({
          id: task.id,
          teamId: task.teamId,
          assignerId: admin.id,
          pendingStatus: null,
          pendingProposedBy: null,
          team: { tenantId: admin.tenantId },
          assignees: [],
        }),
      },
      taskFile: { create: vi.fn().mockRejectedValue(new Error('metadata write failed')) },
      taskEvent: { create: vi.fn() },
      teamMember: { findUnique: vi.fn() },
    } as unknown as TenantDb;

    await expect(createTaskFileRecord(db, task.id, upload, admin, fake.storage)).rejects.toThrow(
      'metadata write failed',
    );
    expect(fake.storage.remove).toHaveBeenCalledWith(fake.uploaded[0]);
    expect(db.taskEvent.create).not.toHaveBeenCalled();
  });

  it('denies wrong-team and wrong-tenant access and hides deleted files', async () => {
    const { admin, member, task } = await makeFixture();
    const otherTeamAdmin = await makeAdmin('task-files-other-team@example.com', 'Other Team Co');
    const fake = makeStorage();
    const created = await inTenant(member, (db) =>
      createTaskFileRecord(db, task.id, upload, member, fake.storage),
    );

    await expect(inTenant(otherTeamAdmin, (db) => listTaskFiles(db, task.id, otherTeamAdmin))).rejects.toMatchObject({
      statusCode: 404,
    });

    const sameTenantOtherMember = await makeMember('task-files-other-member@example.com', admin.tenantId!);
    await expect(
      inTenant(sameTenantOtherMember, (db) => listTaskFiles(db, task.id, sameTenantOtherMember)),
    ).rejects.toMatchObject({ statusCode: 403 });

    await inTenant(member, (db) => markTaskFileDeleted(db, task.id, created.id, member));
    await expect(
      inTenant(member, (db) => createTaskFileDownload(db, task.id, created.id, member)),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await inTenant(member, (db) => listTaskFiles(db, task.id, member))).toEqual([]);
  });

  it('allows an in-scope admin to delete another uploader file and records deletion before cleanup', async () => {
    const { admin, member, task } = await makeFixture();
    const fake = makeStorage();
    const created = await inTenant(member, (db) =>
      createTaskFileRecord(db, task.id, upload, member, fake.storage),
    );

    const path = await inTenant(admin, (db) => markTaskFileDeleted(db, task.id, created.id, admin));
    await fake.storage.remove(path);
    const row = await prisma.taskFile.findUnique({ where: { id: created.id } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletedById).toBe(admin.id);
    expect(await prisma.taskEvent.count({ where: { taskId: task.id, eventType: 'file_deleted' } })).toBe(1);
    expect(fake.removed).toEqual([path]);
  });
});
