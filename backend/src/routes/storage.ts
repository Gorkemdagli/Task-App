import { Router, type Request, type Response } from 'express';
import type { FileHandle } from 'node:fs/promises';
import { env } from '../env';
import { createLocalObjectStorage, isCanonicalObjectKey, verifyLocalDownload } from '../lib/localStorage';
import type { LocalObjectScope } from '../lib/localStorage';

export const storageRouter = Router();

function localStorage() {
  if (env.STORAGE_PROVIDER !== 'local' || !env.LOCAL_STORAGE_ROOT) return null;
  return createLocalObjectStorage(env.LOCAL_STORAGE_ROOT);
}

function setPrivateHeaders(res: Response, mimeType: string, originalName: string, size: number): void {
  const name = Array.from(originalName, (character) => {
    const code = character.charCodeAt(0);
    return character === '/' || character === '\\' || code < 0x20 || code === 0x7f ? '_' : character;
  }).join('').slice(0, 255) || 'download';
  const fallback = name.split('').map((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code > 0x7e ? '_' : character;
  }).join('').replace(/["\\]/g, '_').slice(0, 180) || 'download';
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  res.set({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    'Content-Type': mimeType,
    'Content-Length': String(size),
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
}

function parseRange(value: string | undefined, size: number): { start: number; end: number } | null | false {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return false;
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : NaN;
  if (Number.isNaN(start)) {
    const suffixLength = end;
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return false;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    if (!Number.isSafeInteger(start) || start < 0) return false;
    if (Number.isNaN(end)) end = size - 1;
    if (!Number.isSafeInteger(end) || end < start || start >= size) return false;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function streamFile(
  res: Response,
  file: FileHandle,
  range: { start: number; end: number } | null,
  size: number,
) {
  const stream = file.createReadStream({
    autoClose: true,
    ...(range ? { start: range.start, end: range.end } : {}),
  });
  res.on('close', () => {
    if (!res.writableEnded) stream.destroy();
  });
  stream.on('error', () => {
    if (res.headersSent) res.destroy();
    else {
      res.removeHeader('Content-Length');
      res.status(404).end();
    }
  });
  if (range) {
    res.status(206);
    res.set('Content-Length', String(range.end - range.start + 1));
    res.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  }
  stream.pipe(res);
}

async function servePublic(req: Request, res: Response, scope: LocalObjectScope, key: string) {
  const storage = localStorage();
  if (!storage || !isCanonicalObjectKey(scope, key)) return res.status(404).end();
  try {
    const file = await storage.openRead(scope, key);
    const size = (await file.stat()).size;
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(size),
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      await file.close();
      return res.end();
    }
    return streamFile(res, file, null, size);
  } catch {
    return res.status(404).end();
  }
}

async function servePrivate(req: Request, res: Response) {
  const storage = localStorage();
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const secret = env.LOCAL_STORAGE_SIGNING_SECRET;
  if (!storage || !secret) return res.status(404).end();
  const claims = verifyLocalDownload(token, secret);
  if (!claims) return res.status(404).end();

  let file: FileHandle;
  try {
    file = await storage.openRead('private', claims.path);
  } catch {
    return res.status(404).end();
  }
  const size = (await file.stat()).size;
  setPrivateHeaders(res, claims.mimeType, claims.originalName, size);
  const range = parseRange(req.headers.range, size);
  if (range === false) {
    await file.close();
    res.set('Content-Range', `bytes */${size}`);
    res.removeHeader('Content-Length');
    return res.status(416).end();
  }
  if (req.method === 'HEAD') {
    if (range) {
      res.status(206);
      res.set({
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      });
    }
    await file.close();
    return res.end();
  }

  return streamFile(res, file, range, size);
}

storageRouter.head('/media/avatars/:owner/:file', (req, res) =>
  servePublic(req, res, 'public', `avatars/${req.params.owner}/${req.params.file}`),
);
storageRouter.get('/media/avatars/:owner/:file', (req, res) =>
  servePublic(req, res, 'public', `avatars/${req.params.owner}/${req.params.file}`),
);
storageRouter.head('/media/logos/:owner/:file', (req, res) =>
  servePublic(req, res, 'public', `logos/${req.params.owner}/${req.params.file}`),
);
storageRouter.get('/media/logos/:owner/:file', (req, res) =>
  servePublic(req, res, 'public', `logos/${req.params.owner}/${req.params.file}`),
);
storageRouter.head('/media/teams/:tenant/:team/:file', (req, res) =>
  servePublic(req, res, 'public', `teams/${req.params.tenant}/${req.params.team}/${req.params.file}`),
);
storageRouter.get('/media/teams/:tenant/:team/:file', (req, res) =>
  servePublic(req, res, 'public', `teams/${req.params.tenant}/${req.params.team}/${req.params.file}`),
);
storageRouter.head('/private', servePrivate);
storageRouter.get('/private', servePrivate);
