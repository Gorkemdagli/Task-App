import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';

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
});
