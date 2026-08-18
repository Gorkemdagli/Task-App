import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../lib/appError';
import { AVATAR_MAX_INPUT_BYTES } from '../lib/media';

const acceptedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function createParser(field: string) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: AVATAR_MAX_INPUT_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!acceptedMimeTypes.has(file.mimetype)) {
        callback(new AppError(400, 'Invalid image', 'INVALID_IMAGE'));
        return;
      }
      callback(null, true);
    },
  }).single(field);
}

const avatarParser = createParser('avatar');
const logoParser = createParser('logo');

function handleUpload(
  parser: ReturnType<typeof createParser>,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  parser(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(413, 'File too large', 'FILE_TOO_LARGE'));
      return;
    }
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(new AppError(400, 'Invalid image', 'INVALID_IMAGE'));
  });
}

export function uploadAvatar(req: Request, res: Response, next: NextFunction): void {
  handleUpload(avatarParser, req, res, next);
}

export function uploadCompanyLogo(req: Request, res: Response, next: NextFunction): void {
  handleUpload(logoParser, req, res, next);
}
