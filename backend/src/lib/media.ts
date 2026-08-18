import sharp, { type Metadata } from 'sharp';
import { AppError } from './appError';

export const AVATAR_MAX_INPUT_BYTES = 25 * 1024 * 1024;

const declaredFormats = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

function invalidImage(): AppError {
  return new AppError(400, 'Invalid image', 'INVALID_IMAGE');
}

export async function transformAvatar(buffer: Buffer, declaredMime: string): Promise<Buffer> {
  if (buffer.byteLength > AVATAR_MAX_INPUT_BYTES) {
    throw new AppError(413, 'File too large', 'FILE_TOO_LARGE');
  }

  const expectedFormat = declaredFormats[declaredMime as keyof typeof declaredFormats];
  if (!expectedFormat) throw invalidImage();

  const image = sharp(buffer);
  let metadata: Metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw invalidImage();
  }

  if (metadata.format !== expectedFormat) throw invalidImage();

  try {
    return await image
      .rotate()
      .resize({ width: 512, height: 512, fit: 'cover', position: 'centre' })
      .webp()
      .toBuffer();
  } catch {
    throw invalidImage();
  }
}
