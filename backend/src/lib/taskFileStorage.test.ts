import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { env } from '../env';
import { createLocalObjectStorage } from './localStorage';

const supabase = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ storage: { from: supabase.from } })),
}));

import { createTaskFileStorage, TASK_FILES_BUCKET } from './taskFileStorage';

describe('taskFileStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.SUPABASE_URL = 'https://supabase.example.test';
    env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    env.SUPABASE_TASK_FILES_BUCKET = undefined;
    env.STORAGE_PROVIDER = 'supabase';
    supabase.from.mockReturnValue({
      upload: supabase.upload,
      createSignedUrl: supabase.createSignedUrl,
      remove: supabase.remove,
    });
    supabase.upload.mockResolvedValue({ error: null });
    supabase.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.test/signed/task.pdf?token=opaque' },
      error: null,
    });
    supabase.remove.mockResolvedValue({ error: null });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
  });

  it('uses the private bucket, disables upsert, and returns a 60-second signed expiry', async () => {
    const storage = createTaskFileStorage();
    const data = Buffer.from('%PDF-1.7');

    await storage.upload('tasks/task-1/task.pdf', data, 'application/pdf');
    const result = await storage.createDownloadUrl('tasks/task-1/task.pdf');
    await storage.remove('tasks/task-1/task.pdf');

    expect(supabase.from).toHaveBeenCalledWith(TASK_FILES_BUCKET);
    expect(supabase.upload).toHaveBeenCalledWith('tasks/task-1/task.pdf', data, {
      contentType: 'application/pdf',
      upsert: false,
    });
    expect(supabase.createSignedUrl).toHaveBeenCalledWith('tasks/task-1/task.pdf', 60);
    expect(result).toEqual({
      url: 'https://storage.test/signed/task.pdf?token=opaque',
      expiresAt: '2026-09-20T12:01:00.000Z',
    });
    expect(supabase.remove).toHaveBeenCalledWith(['tasks/task-1/task.pdf']);
  });

  it.each([
    ['upload', (storage: ReturnType<typeof createTaskFileStorage>) => storage.upload('x', Buffer.from('x'), 'text/plain'), 'Task file upload failed'],
    ['sign', (storage: ReturnType<typeof createTaskFileStorage>) => storage.createDownloadUrl('x'), 'Task file download URL failed'],
    ['remove', (storage: ReturnType<typeof createTaskFileStorage>) => storage.remove('x'), 'Task file removal failed'],
  ])('sanitizes provider errors for %s', async (_operation, run, message) => {
    const adapter = {
      upload: vi.fn().mockRejectedValue(new Error('provider secret')),
      createSignedUrl: vi.fn().mockRejectedValue(new Error('provider secret')),
      remove: vi.fn().mockRejectedValue(new Error('provider secret')),
    };

    await expect(run(createTaskFileStorage(adapter))).rejects.toMatchObject({
      statusCode: 502,
      code: 'TASK_FILE_STORAGE_FAILED',
      message,
    });
  });

  it('stores private files locally and signs an absolute 60-second URL with trusted metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'taskflow-task-file-storage-'));
    env.STORAGE_PROVIDER = 'local';
    env.LOCAL_STORAGE_ROOT = root;
    env.LOCAL_STORAGE_SIGNING_SECRET = 'random-local-signing-secret-with-32-bytes';
    env.PUBLIC_API_ORIGIN = 'https://api.example.test';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));

    try {
      const storage = createTaskFileStorage();
      const objectPath = 'tenants/tenant-a/tasks/task-a/files/file-a';
      await storage.upload(objectPath, Buffer.from('%PDF-1.7'), 'application/pdf');
      const result = await storage.createDownloadUrl(objectPath, {
        mimeType: 'application/pdf',
        originalName: 'trusted report.pdf',
      });
      const url = new URL(result.url);
      const local = createLocalObjectStorage(root);
      const object = await local.openRead('private', objectPath);
      try {
        expect(await object.readFile()).toEqual(Buffer.from('%PDF-1.7'));
      } finally {
        await object.close();
      }

      expect(url.origin).toBe('https://api.example.test');
      expect(url.pathname).toBe('/api/v1/storage/private');
      expect(url.searchParams.get('token')).toBeTruthy();
      expect(result.expiresAt).toBe('2026-09-20T12:01:00.000Z');
      expect(supabase.from).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      await rm(root, { recursive: true, force: true });
    }
  });
});
