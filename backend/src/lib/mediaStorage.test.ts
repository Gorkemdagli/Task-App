import { describe, expect, it, vi } from 'vitest';
import { createMediaStorage, deleteOwnedAvatar, parseOwnedAvatarPath } from './mediaStorage';

describe('mediaStorage', () => {
  it('uploads user-scoped WebP and returns public URL', async () => {
    const adapter = {
      upload: vi.fn().mockResolvedValue(undefined),
      getPublicUrl: vi.fn((path: string) => `https://storage.test/public/${path}`),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const storage = createMediaStorage(adapter);

    const result = await storage.uploadAvatar('user-123', Buffer.from('webp'));

    expect(result.path).toMatch(/^avatars\/user-123\/[0-9a-f-]{36}\.webp$/);
    expect(result.url).toBe(`https://storage.test/public/${result.path}`);
    expect(adapter.upload).toHaveBeenCalledWith(result.path, Buffer.from('webp'), {
      contentType: 'image/webp',
      upsert: false,
    });
  });

  it('parses and deletes only avatars owned by user', async () => {
    const adapter = {
      upload: vi.fn(),
      getPublicUrl: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const storage = createMediaStorage(adapter);
    const ownedUrl =
      'https://storage.test/storage/v1/object/public/taskflow-media/avatars/u-1/a.webp';

    expect(parseOwnedAvatarPath(ownedUrl, 'u-1')).toBe('avatars/u-1/a.webp');
    expect(parseOwnedAvatarPath(ownedUrl, 'u-2')).toBeNull();
    expect(
      parseOwnedAvatarPath('https://storage.test/public/avatars/u-1/a.webp', 'u-1'),
    ).toBeNull();

    await deleteOwnedAvatar(storage, ownedUrl, 'u-1');
    await deleteOwnedAvatar(storage, ownedUrl, 'u-2');
    expect(adapter.remove).toHaveBeenCalledTimes(1);
    expect(adapter.remove).toHaveBeenCalledWith('avatars/u-1/a.webp');
  });

  it('wraps storage failures without leaking provider details', async () => {
    const storage = createMediaStorage({
      upload: vi.fn().mockRejectedValue(new Error('service-role-secret-provider-error')),
      getPublicUrl: vi.fn(),
      remove: vi.fn(),
    });

    await expect(storage.uploadAvatar('user-1', Buffer.from('webp'))).rejects.toMatchObject({
      statusCode: 502,
      code: 'MEDIA_UPLOAD_FAILED',
      message: 'Media upload failed',
    });
  });
});
