import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../lib/appError';
import { register } from '../services/auth.service';
import { createTeam, addMemberByDisplayId } from '../services/teams.service';
import { createTask } from '../services/tasks.service';
import { withTenantContext } from '../db/withTenant';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';

const storageState = vi.hoisted(() => {
  const uploaded: string[] = [];
  const removed: string[] = [];
  const signed: string[] = [];
  return {
    uploaded,
    removed,
    signed,
    storage: {
      upload: vi.fn(async (path: string) => uploaded.push(path)),
      createDownloadUrl: vi.fn(async (path: string) => {
        signed.push(path);
        return { url: 'https://signed.example/task-file', expiresAt: '2026-09-20T10:01:00.000Z' };
      }),
      remove: vi.fn(async (path: string) => removed.push(path)),
    },
  };
});

vi.mock('../lib/taskFileStorage', () => ({
  createTaskFileStorage: vi.fn(() => storageState.storage),
}));

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

async function makeFixture() {
  const adminRegistration = await register({
    fullName: 'Route File Admin',
    email: 'route-task-files-admin@example.com',
    password: 'hunter22',
    companyName: 'Route Files Co',
  });
  const admin = adminRegistration.user as Actor;
  const memberRegistration = await register({
    fullName: 'Route File Member',
    email: 'route-task-files-member@example.com',
    password: 'hunter22',
  });
  await prisma.user.update({
    where: { id: memberRegistration.user.id },
    data: { tenantId: admin.tenantId, role: 'member' },
  });
  const member = { ...memberRegistration.user, role: 'member' as const, tenantId: admin.tenantId };
  const team = await inTenant(admin, (db) => createTeam(db, { name: 'Route Files' }, admin));
  await inTenant(admin, (db) => addMemberByDisplayId(db, team.id, member.displayId, admin));
  const task = await inTenant(admin, (db) =>
    createTask(
      db,
      { title: 'Route file task', priority: 'medium', assigneeIds: [member.id], teamId: team.id },
      admin,
    ),
  );
  return {
    admin,
    member,
    task,
    adminAccessToken: adminRegistration.accessToken,
    memberAccessToken: memberRegistration.accessToken,
  };
}

describe('task file routes', () => {
  beforeEach(() => {
    storageState.uploaded.length = 0;
    storageState.removed.length = 0;
    storageState.signed.length = 0;
    storageState.storage.upload.mockClear();
    storageState.storage.createDownloadUrl.mockClear();
    storageState.storage.remove.mockClear();
  });

  beforeEach(cleanDb);

  it('lets a task viewer upload, list, and request a transient signed download URL', async () => {
    const { member, memberAccessToken, task } = await makeFixture();
    const app = createApp();

    const uploadResponse = await request(app)
      .post(`/api/v1/tasks/${task.id}/files`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .attach('file', Buffer.from('%PDF-1.7\n'), { filename: 'route-report.pdf', contentType: 'application/pdf' });

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body).not.toHaveProperty('objectPath');
    expect(storageState.uploaded[0]).toMatch(new RegExp(`^tenants/${member.tenantId}/tasks/${task.id}/files/[^/]+$`));

    const listResponse = await request(app)
      .get(`/api/v1/tasks/${task.id}/files`)
      .set('Authorization', `Bearer ${memberAccessToken}`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.files[0]).toMatchObject({
      originalName: 'route-report.pdf',
      uploader: { id: member.id, name: 'Route File Member' },
      canDelete: true,
    });

    const downloadResponse = await request(app)
      .post(`/api/v1/tasks/${task.id}/files/${uploadResponse.body.id}/download`)
      .set('Authorization', `Bearer ${memberAccessToken}`);
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.body).toEqual({
      url: 'https://signed.example/task-file',
      expiresAt: '2026-09-20T10:01:00.000Z',
    });
    expect(storageState.signed).toEqual(storageState.uploaded);
  });

  it('keeps deletion behind signed URL issuance for the same file row', async () => {
    const { memberAccessToken, task } = await makeFixture();
    const app = createApp();
    const uploadResponse = await request(app)
      .post(`/api/v1/tasks/${task.id}/files`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .attach('file', Buffer.from('%PDF-1.7\n'), { filename: 'race.pdf', contentType: 'application/pdf' });

    let signingStarted!: () => void;
    const signed = new Promise<void>((resolve) => {
      signingStarted = resolve;
    });
    let releaseSigning!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseSigning = resolve;
    });
    storageState.storage.createDownloadUrl.mockImplementationOnce(async (path: string) => {
      signingStarted();
      await release;
      storageState.signed.push(path);
      return { url: 'https://signed.example/task-file', expiresAt: '2026-09-20T10:01:00.000Z' };
    });

    const downloadPromise = request(app)
      .post(`/api/v1/tasks/${task.id}/files/${uploadResponse.body.id}/download`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .then((response) => response);
    let signingStartTimer: ReturnType<typeof setTimeout>;
    await new Promise<void>((resolve, reject) => {
      signingStartTimer = setTimeout(() => reject(new Error('download signing did not start')), 1_000);
      signed.then(() => {
        clearTimeout(signingStartTimer);
        resolve();
      }, reject);
    });

    const deletePromise = request(app)
      .delete(`/api/v1/tasks/${task.id}/files/${uploadResponse.body.id}`)
      .set('Authorization', `Bearer ${memberAccessToken}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(storageState.storage.remove).not.toHaveBeenCalled();

    releaseSigning();
    expect((await downloadPromise).status).toBe(200);
    expect((await deletePromise).status).toBe(204);
  });

  it('denies another member and cross-tenant users, while allowing uploader deletion', async () => {
    const { admin, memberAccessToken, task } = await makeFixture();
    const secondRegistration = await register({
      fullName: 'Route Other Member',
      email: 'route-task-files-other@example.com',
      password: 'hunter22',
    });
    await prisma.user.update({
      where: { id: secondRegistration.user.id },
      data: { tenantId: admin.tenantId, role: 'member' },
    });
    const second = { ...secondRegistration.user, role: 'member' as const, tenantId: admin.tenantId };
    await inTenant(admin, (db) => addMemberByDisplayId(db, task.teamId, second.displayId, admin));
    const app = createApp();
    const uploadResponse = await request(app)
      .post(`/api/v1/tasks/${task.id}/files`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .attach('file', Buffer.from('%PDF-1.7\n'), { filename: 'delete-me.pdf', contentType: 'application/pdf' });

    const anotherMemberDelete = await request(app)
      .delete(`/api/v1/tasks/${task.id}/files/${uploadResponse.body.id}`)
      .set('Authorization', `Bearer ${secondRegistration.accessToken}`);
    expect(anotherMemberDelete.status).toBe(403);

    const outsiderRegistration = await register({
      fullName: 'Route Outsider',
      email: 'route-task-files-outsider@example.com',
      password: 'hunter22',
      companyName: 'Route Other Co',
    });
    const outsiderList = await request(app)
      .get(`/api/v1/tasks/${task.id}/files`)
      .set('Authorization', `Bearer ${outsiderRegistration.accessToken}`);
    expect(outsiderList.status).toBe(404);

    const deleteResponse = await request(app)
      .delete(`/api/v1/tasks/${task.id}/files/${uploadResponse.body.id}`)
      .set('Authorization', `Bearer ${memberAccessToken}`);
    expect(deleteResponse.status).toBe(204);
    expect(storageState.removed).toEqual(storageState.uploaded);

    const hiddenList = await request(app)
      .get(`/api/v1/tasks/${task.id}/files`)
      .set('Authorization', `Bearer ${memberAccessToken}`);
    expect(hiddenList.body.files).toEqual([]);
    const deletedDownload = await request(app)
      .post(`/api/v1/tasks/${task.id}/files/${uploadResponse.body.id}/download`)
      .set('Authorization', `Bearer ${memberAccessToken}`);
    expect(deletedDownload.status).toBe(404);
  });

  it('keeps deleted metadata hidden when post-commit storage removal fails', async () => {
    const { admin, adminAccessToken, memberAccessToken, task } = await makeFixture();
    const app = createApp();
    const uploadResponse = await request(app)
      .post(`/api/v1/tasks/${task.id}/files`)
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .attach('file', Buffer.from('%PDF-1.7\n'), { filename: 'cleanup-fails.pdf', contentType: 'application/pdf' });
    storageState.storage.remove.mockRejectedValueOnce(
      new AppError(502, 'Task file removal failed', 'TASK_FILE_STORAGE_FAILED'),
    );

    const deleteResponse = await request(app)
      .delete(`/api/v1/tasks/${task.id}/files/${uploadResponse.body.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`);
    expect(deleteResponse.status).toBe(502);
    expect(await prisma.taskFile.findUnique({ where: { id: uploadResponse.body.id } })).toMatchObject({
      deletedById: admin.id,
    });
    expect(await prisma.taskEvent.count({ where: { taskId: task.id, eventType: 'file_deleted' } })).toBe(1);

    const outsiderRegistration = await register({
      fullName: 'Cleanup Outsider',
      email: 'route-task-files-cleanup-outsider@example.com',
      password: 'hunter22',
      companyName: 'Cleanup Other Co',
    });
    const outsiderDelete = await request(app)
      .delete(`/api/v1/tasks/${task.id}/files/${uploadResponse.body.id}`)
      .set('Authorization', `Bearer ${outsiderRegistration.accessToken}`);
    expect(outsiderDelete.status).toBe(404);

    const retryResponse = await request(app)
      .delete(`/api/v1/tasks/${task.id}/files/${uploadResponse.body.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`);
    expect(retryResponse.status).toBe(204);
    expect(storageState.storage.remove).toHaveBeenCalledTimes(2);
    expect(storageState.removed).toEqual(storageState.uploaded);
    expect(await prisma.taskEvent.count({ where: { taskId: task.id, eventType: 'file_deleted' } })).toBe(1);
  });
});
