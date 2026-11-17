import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { env } from '../env';
import { AppError } from './appError';
import { logger } from './logger';
import { createLocalObjectStorage, isCanonicalObjectKey } from './localStorage';

export const MEDIA_BUCKET = 'taskflow-media';

export type MediaStorageAdapter = {
  upload(
    path: string,
    data: Buffer,
    options: { contentType: string; upsert: boolean },
  ): Promise<void>;
  getPublicUrl(path: string): string;
  remove(path: string): Promise<void>;
};

export type MediaStorage = {
  uploadAvatar(userId: string, data: Buffer): Promise<{ path: string; url: string }>;
  uploadLogo(tenantId: string, data: Buffer): Promise<{ path: string; url: string }>;
  uploadTeamPhoto(tenantId: string, teamId: string, data: Buffer): Promise<{ path: string; url: string }>;
  deletePath(path: string): Promise<void>;
};

function unavailableStorage(): AppError {
  return new AppError(502, 'Media storage is not configured', 'MEDIA_UPLOAD_FAILED');
}

function createSupabaseAdapter(): MediaStorageAdapter {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw unavailableStorage();
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const bucket = client.storage.from(MEDIA_BUCKET);

  return {
    async upload(path, data, options) {
      const { error } = await bucket.upload(path, data, options);
      if (error) throw unavailableStorage();
    },
    getPublicUrl(path) {
      return bucket.getPublicUrl(path).data.publicUrl;
    },
    async remove(path) {
      const { error } = await bucket.remove([path]);
      if (error) throw unavailableStorage();
    },
  };
}

function createLocalAdapter(): MediaStorageAdapter {
  const storage = createLocalObjectStorage(env.LOCAL_STORAGE_ROOT ?? '');
  return {
    upload(path, data) {
      return storage.upload('public', path, data);
    },
    getPublicUrl(path) {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      return new URL(`/api/v1/storage/media/${encodedPath}`, env.PUBLIC_API_ORIGIN).toString();
    },
    remove(path) {
      return storage.remove('public', path);
    },
  };
}

function createDefaultAdapter(): MediaStorageAdapter {
  return env.STORAGE_PROVIDER === 'local' ? createLocalAdapter() : createSupabaseAdapter();
}

export function createMediaStorage(
  adapter: MediaStorageAdapter = createDefaultAdapter(),
): MediaStorage {
  async function uploadWebp(path: string, data: Buffer): Promise<{ path: string; url: string }> {
    try {
      await adapter.upload(path, data, { contentType: 'image/webp', upsert: false });
      return { path, url: adapter.getPublicUrl(path) };
    } catch (error) {
      if (error instanceof AppError && error.code === 'MEDIA_UPLOAD_FAILED') throw error;
      throw new AppError(502, 'Media upload failed', 'MEDIA_UPLOAD_FAILED');
    }
  }

  return {
    async uploadAvatar(userId, data) {
      return uploadWebp(`avatars/${userId}/${randomUUID()}.webp`, data);
    },
    async uploadLogo(tenantId, data) {
      return uploadWebp(`logos/${tenantId}/${randomUUID()}.webp`, data);
    },
    async uploadTeamPhoto(tenantId, teamId, data) {
      return uploadWebp(`teams/${tenantId}/${teamId}/${randomUUID()}.webp`, data);
    },
    deletePath(path) {
      return adapter.remove(path);
    },
  };
}

function parseOwnedMediaPath(url: string | null, prefix: string, owner: string, depth: number): string | null {
  if (!url) return null;
  const configuredOrigin = env.STORAGE_PROVIDER === 'local' ? env.PUBLIC_API_ORIGIN : env.SUPABASE_URL;
  if (!configuredOrigin) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.origin !== new URL(configuredOrigin).origin ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    const marker =
      env.STORAGE_PROVIDER === 'local'
        ? '/api/v1/storage/media/'
        : `/storage/v1/object/public/${MEDIA_BUCKET}/`;
    const pathname = decodeURIComponent(parsed.pathname);
    if (!pathname.startsWith(marker)) return null;
    const path = pathname.slice(marker.length);
    const parts = path.split('/');
    if (
      parts.length !== depth ||
      parts[0] !== prefix ||
      parts[1] !== owner ||
      !isCanonicalObjectKey('public', path)
    ) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

export function parseOwnedAvatarPath(url: string | null, userId: string): string | null {
  return parseOwnedMediaPath(url, 'avatars', userId, 3);
}

export function parseOwnedLogoPath(url: string | null, tenantId: string): string | null {
  return parseOwnedMediaPath(url, 'logos', tenantId, 3);
}

export function parseOwnedTeamPhotoPath(
  url: string | null,
  tenantId: string,
  teamId: string,
): string | null {
  const path = parseOwnedMediaPath(url, 'teams', tenantId, 4);
  if (!path || path.split('/')[2] !== teamId) return null;
  return path;
}

export async function deleteOwnedAvatar(
  storage: MediaStorage,
  url: string | null,
  userId: string,
): Promise<void> {
  const path = parseOwnedAvatarPath(url, userId);
  if (!path) return;
  try {
    await storage.deletePath(path);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : 'unknown' },
      'avatar cleanup failed',
    );
  }
}

export async function deleteOwnedLogo(
  storage: MediaStorage,
  url: string | null,
  tenantId: string,
): Promise<void> {
  const path = parseOwnedLogoPath(url, tenantId);
  if (!path) return;
  try {
    await storage.deletePath(path);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : 'unknown' },
      'logo cleanup failed',
    );
  }
}

export async function deleteOwnedTeamPhoto(
  storage: MediaStorage,
  url: string | null,
  tenantId: string,
  teamId: string,
): Promise<void> {
  const path = parseOwnedTeamPhotoPath(url, tenantId, teamId);
  if (!path) return;
  try {
    await storage.deletePath(path);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : 'unknown' },
      'team photo cleanup failed',
    );
  }
}
