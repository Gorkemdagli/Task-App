import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export function toRlsError(error: unknown): AppError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;

  const metaCode = typeof error.meta?.code === 'string' ? error.meta.code : '';
  const message = error.message.toLowerCase();
  const isPermissionDenied =
    metaCode === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security policy');

  return isPermissionDenied
    ? new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN')
    : null;
}
