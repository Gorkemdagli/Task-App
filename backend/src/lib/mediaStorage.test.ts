import { describe, expect, it, vi } from 'vitest';
import {
  createMediaStorage,
  deleteOwnedAvatar,
  deleteOwnedLogo,
  deleteOwnedTeamPhoto,
  parseOwnedAvatarPath,
  parseOwnedLogoPath,
  parseOwnedTeamPhotoPath,
} from './mediaStorage';

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

  it('uploads company logos under tenant-owned paths', async () => {
    const adapter = {
      upload: vi.fn().mockResolvedValue(undefined),
      getPublicUrl: vi.fn((path: string) => `https://storage.test/${path}`),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const storage = createMediaStorage(adapter);

    const result = await storage.uploadLogo('tenant-a', Buffer.from('webp'));

    expect(result.path).toMatch(/^logos\/tenant-a\/.+\.webp$/);
    expect(adapter.upload).toHaveBeenCalledWith(result.path, Buffer.from('webp'), {
      contentType: 'image/webp',
      upsert: false,
    });
  });

  it('uploads team photos under tenant and team scoped paths', async () => {
    const adapter = {
      upload: vi.fn().mockResolvedValue(undefined),
      getPublicUrl: vi.fn((path: string) => `https://storage.test/${path}`),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const storage = createMediaStorage(adapter);
    const result = await storage.uploadTeamPhoto('tenant-a', 'team-1', Buffer.from('webp'));
    expect(result.path).toMatch(/^teams\/tenant-a\/team-1\/[0-9a-f-]{36}\.webp$/);
    expect(adapter.upload).toHaveBeenCalledWith(result.path, Buffer.from('webp'), {
      contentType: 'image/webp',
      upsert: false,
    });
  });

  it('deletes only the photo owned by the matching tenant and team', async () => {
    const adapter = {
      upload: vi.fn(),
      getPublicUrl: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const storage = createMediaStorage(adapter);
    const url = 'https://storage.test/storage/v1/object/public/taskflow-media/teams/tenant-a/team-1/photo.webp';
    expect(parseOwnedTeamPhotoPath(url, 'tenant-a', 'team-1')).toBe(
      'teams/tenant-a/team-1/photo.webp',
    );
    expect(parseOwnedTeamPhotoPath(url, 'tenant-b', 'team-1')).toBeNull();
    expect(parseOwnedTeamPhotoPath(url, 'tenant-a', 'team-2')).toBeNull();
    await deleteOwnedTeamPhoto(storage, url, 'tenant-a', 'team-1');
    await deleteOwnedTeamPhoto(storage, url, 'tenant-a', 'team-2');
    expect(adapter.remove).toHaveBeenCalledTimes(1);
    expect(adapter.remove).toHaveBeenCalledWith('teams/tenant-a/team-1/photo.webp');
  });

  it('parses and removes only tenant-owned logo paths', async () => {
    const adapter = {
      upload: vi.fn(),
      getPublicUrl: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const storage = createMediaStorage(adapter);
    const url =
      'https://storage.test/storage/v1/object/public/taskflow-media/logos/tenant-a/logo.webp';

    expect(parseOwnedLogoPath(url, 'tenant-a')).toBe('logos/tenant-a/logo.webp');
    expect(parseOwnedLogoPath(url, 'tenant-b')).toBeNull();

    await deleteOwnedLogo(storage, url, 'tenant-a');
    expect(adapter.remove).toHaveBeenCalledWith('logos/tenant-a/logo.webp');
  });
});
