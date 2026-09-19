import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { AppError } from '../lib/appError';

export const TASK_FILE_MAX_BYTES = 25 * 1024 * 1024;

export const TASK_FILE_POLICY = {
  '.pdf': { mimeType: 'application/pdf', signature: 'pdf' },
  '.jpg': { mimeType: 'image/jpeg', signature: 'jpeg' },
  '.jpeg': { mimeType: 'image/jpeg', signature: 'jpeg' },
  '.png': { mimeType: 'image/png', signature: 'png' },
  '.webp': { mimeType: 'image/webp', signature: 'webp' },
  '.gif': { mimeType: 'image/gif', signature: 'gif' },
  '.doc': { mimeType: 'application/msword', signature: 'ole' },
  '.docx': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    signature: 'zip',
  },
  '.xls': { mimeType: 'application/vnd.ms-excel', signature: 'ole' },
  '.xlsx': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    signature: 'zip',
  },
  '.ppt': { mimeType: 'application/vnd.ms-powerpoint', signature: 'ole' },
  '.pptx': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    signature: 'zip',
  },
  '.zip': { mimeType: 'application/zip', signature: 'zip' },
  '.txt': { mimeType: 'text/plain', signature: 'text' },
  '.csv': { mimeType: 'text/csv', signature: 'text' },
  '.md': { mimeType: 'text/markdown', signature: 'text' },
} as const;

type TaskFileSignature = (typeof TASK_FILE_POLICY)[keyof typeof TASK_FILE_POLICY]['signature'];

function invalidFile(): AppError {
  return new AppError(400, 'Invalid task file', 'INVALID_FILE');
}

function hasPrefix(buffer: Buffer, bytes: number[]): boolean {
  return buffer.length >= bytes.length && buffer.subarray(0, bytes.length).equals(Buffer.from(bytes));
}

function hasZipSignature(buffer: Buffer): boolean {
  return (
    hasPrefix(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    hasPrefix(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    hasPrefix(buffer, [0x50, 0x4b, 0x07, 0x08])
  );
}

function hasTaskFileSignature(buffer: Buffer, signature: TaskFileSignature): boolean {
  switch (signature) {
    case 'pdf':
      return hasPrefix(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case 'jpeg':
      return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
    case 'png':
      return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'webp':
      return hasPrefix(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.subarray(8, 12).equals(Buffer.from('WEBP'));
    case 'gif':
      return hasPrefix(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || hasPrefix(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    case 'ole':
      return hasPrefix(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'zip':
      return hasZipSignature(buffer);
    case 'text':
      return !buffer.toString('utf8').includes('\u0000') && !buffer.toString('utf8').includes('\ufffd');
  }
}

function createParser() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fields: 0, parts: 2, fileSize: TASK_FILE_MAX_BYTES },
    fileFilter: (_req, file, callback) => {
      const extension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
      const policy = TASK_FILE_POLICY[extension as keyof typeof TASK_FILE_POLICY];
      if (!policy || policy.mimeType !== file.mimetype.toLowerCase()) {
        callback(invalidFile());
        return;
      }
      callback(null, true);
    },
  }).single('file');
}

const taskFileParser = createParser();

function handleUpload(req: Request, res: Response, next: NextFunction): void {
  taskFileParser(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(413, 'File too large', 'FILE_TOO_LARGE'));
      return;
    }
    if (error) {
      next(error instanceof AppError ? error : invalidFile());
      return;
    }
    if (!req.file) {
      next(new AppError(400, 'File is required', 'FILE_REQUIRED'));
      return;
    }
    const extension = req.file.originalname.slice(req.file.originalname.lastIndexOf('.')).toLowerCase();
    const policy = TASK_FILE_POLICY[extension as keyof typeof TASK_FILE_POLICY];
    if (!policy || !hasTaskFileSignature(req.file.buffer, policy.signature)) {
      next(invalidFile());
      return;
    }
    next();
  });
}

export const uploadTaskFile: RequestHandler = handleUpload;
