import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { env } from '../env';
import { createLocalObjectStorage } from './localStorage';
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
  beforeEach(() => {
    env.STORAGE_PROVIDER = 'supabase';
    env.SUPABASE_URL = 'https://storage.test';
    env.PUBLIC_API_ORIGIN = 'https://api.test';
  });

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
      parseOwnedAvatarPath(
        'https://foreign.test/storage/v1/object/public/taskflow-media/avatars/u-1/a.webp',
        'u-1',
      ),
    ).toBeNull();
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

  it('parses local media URLs only for the configured API origin and exact owner route', async () => {
    env.STORAGE_PROVIDER = 'local';
    const adapter = {
      upload: vi.fn(),
      getPublicUrl: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const storage = createMediaStorage(adapter);
    const url = 'https://api.test/api/v1/storage/media/avatars/u-1/a.webp';

    expect(parseOwnedAvatarPath(url, 'u-1')).toBe('avatars/u-1/a.webp');
    expect(parseOwnedAvatarPath(url, 'u-2')).toBeNull();
    expect(parseOwnedAvatarPath(url.replace('api.test', 'foreign.test'), 'u-1')).toBeNull();
    expect(
      parseOwnedAvatarPath('https://api.test/api/v1/storage/media/avatars/u-1/%252e%252e.webp', 'u-1'),
    ).toBeNull();

    await deleteOwnedAvatar(storage, url, 'u-1');
    await deleteOwnedAvatar(storage, url.replace('api.test', 'foreign.test'), 'u-1');
    expect(adapter.remove).toHaveBeenCalledTimes(1);
    expect(adapter.remove).toHaveBeenCalledWith('avatars/u-1/a.webp');
  });

  it('stores local WebP media under the separate public root and returns the API URL', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'taskflow-media-storage-'));
    env.STORAGE_PROVIDER = 'local';
    env.LOCAL_STORAGE_ROOT = root;
    try {
      const storage = createMediaStorage();
      const result = await storage.uploadAvatar('user-a', Buffer.from('converted-webp'));
      const file = await createLocalObjectStorage(root).openRead('public', result.path);
      try {
        expect(await file.readFile()).toEqual(Buffer.from('converted-webp'));
      } finally {
        await file.close();
      }
      expect(result.url).toBe(`https://api.test/api/v1/storage/media/${result.path}`);
      await storage.deletePath(result.path);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
