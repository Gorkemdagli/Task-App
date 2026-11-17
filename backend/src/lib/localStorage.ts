import { constants } from 'node:fs';
import { link, lstat, mkdir, open, unlink } from 'node:fs/promises';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './appError';

export type LocalObjectScope = 'public' | 'private';
export type LocalDownloadMetadata = { mimeType: string; originalName: string };
export type LocalDownloadClaims = LocalDownloadMetadata & {
  path: string;
  expiresAt: number;
};

const TOKEN_LIFETIME_MS = 60_000;
const MIME_TYPE_PATTERN = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;
const KEY_PART_PATTERN = /^[A-Za-z0-9_-]+$/;

function storageError(code: string): AppError {
  return new AppError(404, 'Stored file not found', code);
}

export function isCanonicalObjectKey(scope: LocalObjectScope, key: string): boolean {
  if (key.includes('%') || key.includes('\\')) return false;
  const parts = key.split('/');
  if (scope === 'private') {
    return (
      parts.length === 6 &&
      parts[0] === 'tenants' &&
      parts[2] === 'tasks' &&
      parts[4] === 'files' &&
      parts.every((part) => KEY_PART_PATTERN.test(part))
    );
  }
  const validMediaName = (name: string) => /^[A-Za-z0-9_-]+\.webp$/.test(name);
  if (
    parts.length === 3 &&
    (parts[0] === 'avatars' || parts[0] === 'logos') &&
    KEY_PART_PATTERN.test(parts[1])
  ) {
    return validMediaName(parts[2]);
  }
  return (
    parts.length === 4 &&
    parts[0] === 'teams' &&
    KEY_PART_PATTERN.test(parts[1]) &&
    KEY_PART_PATTERN.test(parts[2]) &&
    validMediaName(parts[3])
  );
}

function assertKey(scope: LocalObjectScope, key: string): string[] {
  if (!isCanonicalObjectKey(scope, key)) throw storageError('LOCAL_STORAGE_INVALID_KEY');
  return key.split('/');
}

async function ensureDirectory(directory: string, create: boolean): Promise<void> {
  const volumeRoot = path.parse(directory).root;
  let current = volumeRoot;
  for (const part of path.relative(volumeRoot, directory).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw storageError('LOCAL_STORAGE_INVALID_PATH');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw error;
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
      }
      const stats = await lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw storageError('LOCAL_STORAGE_INVALID_PATH');
      }
    }
  }
}

function objectPath(root: string, scope: LocalObjectScope, parts: string[]): string {
  return path.join(root, scope, ...parts);
}

export function createLocalObjectStorage(root: string) {
  if (!path.isAbsolute(root)) throw storageError('LOCAL_STORAGE_INVALID_ROOT');
  const resolvedRoot = path.resolve(root);

  async function prepareParent(filePath: string, create: boolean): Promise<void> {
    await ensureDirectory(path.dirname(filePath), create);
  }

  return {
    async upload(scope: LocalObjectScope, key: string, data: Buffer): Promise<void> {
      const target = objectPath(resolvedRoot, scope, assertKey(scope, key));
      await prepareParent(target, true);
      const temporary = path.join(path.dirname(target), `.taskflow-${randomUUID()}.tmp`);
      let file: FileHandle | undefined;
      let ownsTemporary = false;
      try {
        file = await open(temporary, 'wx', 0o600);
        ownsTemporary = true;
        await file.writeFile(data);
        await file.sync();
        await file.close();
        file = undefined;
        await link(temporary, target);
      } finally {
        if (file) await file.close().catch(() => undefined);
        if (ownsTemporary) await unlink(temporary).catch(() => undefined);
      }
    },

    async openRead(scope: LocalObjectScope, key: string): Promise<FileHandle> {
      const target = objectPath(resolvedRoot, scope, assertKey(scope, key));
      await prepareParent(target, false);
      const beforeOpen = await lstat(target);
      if (beforeOpen.isSymbolicLink() || !beforeOpen.isFile()) {
        throw storageError('LOCAL_STORAGE_INVALID_PATH');
      }
      // shortcut: intermediate checks can race hostile local writers; use descriptor-relative I/O if root ownership is not trusted.
      const noFollow = process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0);
      const file = await open(target, constants.O_RDONLY | noFollow);
      const afterOpen = await file.stat();
      if (!afterOpen.isFile() || beforeOpen.dev !== afterOpen.dev || beforeOpen.ino !== afterOpen.ino) {
        await file.close();
        throw storageError('LOCAL_STORAGE_INVALID_PATH');
      }
      return file;
    },

    async remove(scope: LocalObjectScope, key: string): Promise<void> {
      const target = objectPath(resolvedRoot, scope, assertKey(scope, key));
      try {
        await prepareParent(target, false);
        const stats = await lstat(target);
        if (stats.isSymbolicLink() || !stats.isFile()) {
          throw storageError('LOCAL_STORAGE_INVALID_PATH');
        }
        await unlink(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    },
  };
}

function isMetadata(value: unknown): value is LocalDownloadMetadata {
  if (!value || typeof value !== 'object') return false;
  const metadata = value as LocalDownloadMetadata;
  return (
    typeof metadata.mimeType === 'string' &&
    MIME_TYPE_PATTERN.test(metadata.mimeType) &&
    typeof metadata.originalName === 'string' &&
    Buffer.byteLength(metadata.originalName, 'utf8') > 0 &&
    Buffer.byteLength(metadata.originalName, 'utf8') <= 255
  );
}

export function signLocalDownload(
  filePath: string,
  metadata: LocalDownloadMetadata,
  secret: string,
  expiresAt: number,
): string {
  const now = Date.now();
  if (
    !isCanonicalObjectKey('private', filePath) ||
    !isMetadata(metadata) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + TOKEN_LIFETIME_MS
  ) {
    throw storageError('LOCAL_STORAGE_INVALID_KEY');
  }
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      path: filePath,
      mimeType: metadata.mimeType,
      originalName: metadata.originalName,
      expiresAt,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyLocalDownload(
  token: string,
  secret: string,
  now = Date.now(),
): LocalDownloadClaims | null {
  if (token.length > 4096) return null;
  const [payload, signature, ...extra] = token.split('.');
  if (!payload || !signature || extra.length || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
  const suppliedSignature = Buffer.from(signature, 'base64url');
  const expectedSignature = createHmac('sha256', secret).update(payload).digest();
  if (
    suppliedSignature.toString('base64url') !== signature ||
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const bytes = Buffer.from(payload, 'base64url');
    if (bytes.toString('base64url') !== payload) return null;
    const value = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    if (Object.keys(value).sort().join(',') !== 'expiresAt,mimeType,originalName,path,v') return null;
    if (
      value.v !== 1 ||
      typeof value.path !== 'string' ||
      !isCanonicalObjectKey('private', value.path) ||
      !isMetadata({ mimeType: value.mimeType, originalName: value.originalName }) ||
      typeof value.expiresAt !== 'number' ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt > now + TOKEN_LIFETIME_MS
    ) {
      return null;
    }
    return {
      path: value.path,
      mimeType: value.mimeType as string,
      originalName: value.originalName as string,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}
