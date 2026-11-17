import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalObjectStorage } from './localStorage';

const roots: string[] = [];

async function makeRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'taskflow-local-storage-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local object storage', () => {
  it('keeps public and private objects separate and deletes only the requested object', async () => {
    const storage = createLocalObjectStorage(await makeRoot());
    const key = 'tenants/tenant-a/tasks/task-a/files/file-a';
    await storage.upload('public', 'avatars/user-a/avatar.webp', Buffer.from('public'));
    await storage.upload('private', key, Buffer.from('private'));

    const publicFile = await storage.openRead('public', 'avatars/user-a/avatar.webp');
    const privateFile = await storage.openRead('private', key);
    try {
      expect(await publicFile.readFile()).toEqual(Buffer.from('public'));
      expect(await privateFile.readFile()).toEqual(Buffer.from('private'));
    } finally {
      await Promise.all([publicFile.close(), privateFile.close()]);
    }

    await storage.remove('public', 'avatars/user-a/avatar.webp');
    await expect(storage.openRead('public', 'avatars/user-a/avatar.webp')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const remainingPrivate = await storage.openRead('private', key);
    await remainingPrivate.close();
  });

  it('rejects malformed, traversal, and encoded-separator object keys', async () => {
    const storage = createLocalObjectStorage(await makeRoot());
    for (const key of [
      '../outside',
      'avatars/../outside.webp',
      'avatars%2Fuser-a%2Favatar.webp',
      'avatars/user%2Fa/avatar.webp',
      'avatars\\user-a\\avatar.webp',
      'tenants/tenant-a/tasks/task-a/files/../../outside',
    ]) {
      await expect(storage.upload('public', key, Buffer.from('x'))).rejects.toMatchObject({
        code: 'LOCAL_STORAGE_INVALID_KEY',
      });
    }
  });

  it('does not overwrite concurrent duplicate uploads and removes its temporary file', async () => {
    const root = await makeRoot();
    const storage = createLocalObjectStorage(root);
    const key = 'avatars/user-a/avatar.webp';
    const results = await Promise.allSettled([
      storage.upload('public', key, Buffer.from('first')),
      storage.upload('public', key, Buffer.from('second')),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const finalPath = path.join(root, 'public', 'avatars', 'user-a');
    expect(await readdir(finalPath)).toEqual(['avatar.webp']);
    const stored = await readFile(path.join(finalPath, 'avatar.webp'));
    expect([Buffer.from('first'), Buffer.from('second')].some((value) => value.equals(stored))).toBe(true);
  });

  it('rejects intermediate symlink directories', async () => {
    const root = await makeRoot();
    const outside = await makeRoot();
    const storage = createLocalObjectStorage(root);
    const publicRoot = path.join(root, 'public');
    await mkdir(publicRoot, { recursive: true });
    await symlink(outside, path.join(publicRoot, 'avatars'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(storage.openRead('public', 'avatars/user-a/avatar.webp')).rejects.toMatchObject({
      code: 'LOCAL_STORAGE_INVALID_PATH',
    });
  });

  it('rejects final symlink objects', async (context) => {
    const root = await makeRoot();
    const outside = await makeRoot();
    const storage = createLocalObjectStorage(root);
    const outsideFile = path.join(outside, 'outside.webp');
    await mkdir(path.join(root, 'public', 'avatars', 'user-a'), { recursive: true });
    await writeFile(outsideFile, 'outside');
    try {
      await symlink(outsideFile, path.join(root, 'public', 'avatars', 'user-a', 'avatar.webp'), 'file');
      await expect(storage.openRead('public', 'avatars/user-a/avatar.webp')).rejects.toMatchObject({
        code: 'LOCAL_STORAGE_INVALID_PATH',
      });
      expect(await readFile(outsideFile, 'utf8')).toBe('outside');
    } catch (error) {
      if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') {
        context.skip();
        return;
      }
      throw error;
    }
  });
});
