import { createClient } from '@supabase/supabase-js';
import { env } from '../env';
import { AppError } from './appError';
import {
  createLocalObjectStorage,
  signLocalDownload,
  type LocalDownloadMetadata,
} from './localStorage';

export const TASK_FILES_BUCKET = 'taskflow-task-files';

const TASK_FILE_STORAGE_ERROR_CODE = 'TASK_FILE_STORAGE_FAILED';
const SIGNED_URL_EXPIRES_IN_SECONDS = 60;

export type TaskFileStorageAdapter = {
  upload(path: string, data: Buffer, options: { contentType: string }): Promise<void>;
  createSignedUrl(
    path: string,
    expiresInSeconds: number,
    metadata?: LocalDownloadMetadata & { expiresAt: number },
  ): Promise<string>;
  remove(path: string): Promise<void>;
};

export type TaskFileStorage = {
  upload(path: string, data: Buffer, contentType: string): Promise<void>;
  createDownloadUrl(
    path: string,
    metadata?: LocalDownloadMetadata,
  ): Promise<{ url: string; expiresAt: string }>;
  remove(path: string): Promise<void>;
};

function storageError(message: string): AppError {
  return new AppError(502, message, TASK_FILE_STORAGE_ERROR_CODE);
}

function createSupabaseAdapter(): TaskFileStorageAdapter {
  const bucketName =
    env.SUPABASE_TASK_FILES_BUCKET ?? (env.NODE_ENV === 'production' ? null : TASK_FILES_BUCKET);
  if (!bucketName || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw storageError('Task file storage is not configured');
  }

  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const bucket = client.storage.from(bucketName);

  return {
    async upload(path, data, options) {
      const { error } = await bucket.upload(path, data, { ...options, upsert: false });
      if (error) throw storageError('Task file upload failed');
    },
    async createSignedUrl(path, expiresInSeconds) {
      const { data, error } = await bucket.createSignedUrl(path, expiresInSeconds);
      if (error || !data?.signedUrl) throw storageError('Task file download URL failed');
      return data.signedUrl;
    },
    async remove(path) {
      const { error } = await bucket.remove([path]);
      if (error) throw storageError('Task file removal failed');
    },
  };
}

function createLocalAdapter(): TaskFileStorageAdapter {
  const storage = createLocalObjectStorage(env.LOCAL_STORAGE_ROOT ?? '');
  return {
    upload(path, data) {
      return storage.upload('private', path, data);
    },
    async createSignedUrl(path, _expiresInSeconds, metadata) {
      if (!metadata || !env.LOCAL_STORAGE_SIGNING_SECRET || !env.PUBLIC_API_ORIGIN) {
        throw storageError('Task file download URL failed');
      }
      const token = signLocalDownload(
        path,
        metadata,
        env.LOCAL_STORAGE_SIGNING_SECRET,
        metadata.expiresAt,
      );
      const url = new URL('/api/v1/storage/private', env.PUBLIC_API_ORIGIN);
      url.searchParams.set('token', token);
      return url.toString();
    },
    remove(path) {
      return storage.remove('private', path);
    },
  };
}

function createDefaultAdapter(): TaskFileStorageAdapter {
  return env.STORAGE_PROVIDER === 'local' ? createLocalAdapter() : createSupabaseAdapter();
}

function sanitizeStorageError(error: unknown, message: string): AppError {
  if (error instanceof AppError && error.code === TASK_FILE_STORAGE_ERROR_CODE) return error;
  return storageError(message);
}

export function createTaskFileStorage(
  adapter: TaskFileStorageAdapter = createDefaultAdapter(),
): TaskFileStorage {
  return {
    async upload(path, data, contentType) {
      try {
        await adapter.upload(path, data, { contentType });
      } catch (error) {
        throw sanitizeStorageError(error, 'Task file upload failed');
      }
    },
    async createDownloadUrl(path, metadata) {
      const expiry = Date.now() + SIGNED_URL_EXPIRES_IN_SECONDS * 1000;
      const expiresAt = new Date(expiry).toISOString();
      try {
        const url = await adapter.createSignedUrl(
          path,
          SIGNED_URL_EXPIRES_IN_SECONDS,
          metadata ? { ...metadata, expiresAt: expiry } : undefined,
        );
        return { url, expiresAt };
      } catch (error) {
        throw sanitizeStorageError(error, 'Task file download URL failed');
      }
    },
    async remove(path) {
      try {
        await adapter.remove(path);
      } catch (error) {
        throw sanitizeStorageError(error, 'Task file removal failed');
      }
    },
  };
}
