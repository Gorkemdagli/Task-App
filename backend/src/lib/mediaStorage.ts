import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { env } from '../env';
import { AppError } from './appError';
import { logger } from './logger';

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

export function createMediaStorage(
  adapter: MediaStorageAdapter = createSupabaseAdapter(),
): MediaStorage {
  return {
    async uploadAvatar(userId, data) {
      const path = `avatars/${userId}/${randomUUID()}.webp`;
      try {
        await adapter.upload(path, data, { contentType: 'image/webp', upsert: false });
        return { path, url: adapter.getPublicUrl(path) };
      } catch (error) {
        if (error instanceof AppError && error.code === 'MEDIA_UPLOAD_FAILED') throw error;
        throw new AppError(502, 'Media upload failed', 'MEDIA_UPLOAD_FAILED');
      }
    },
    deletePath(path) {
      return adapter.remove(path);
    },
  };
}

export function parseOwnedAvatarPath(url: string | null, userId: string): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  if (!pathname.startsWith(marker)) return null;
  const path = pathname.slice(marker.length);
  if (!path.startsWith(`avatars/${userId}/`) || !path.endsWith('.webp')) return null;
  if (path.split('/').length !== 3) return null;
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
