import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/appError';
import type { TenantTransactionOptions } from './withTenant';
import { takeDeferredError } from './deferred-error';

const DEFAULT_OPTIONS: Required<Pick<TenantTransactionOptions, 'maxRetries'>> = {
  maxRetries: 1,
};
export { commitThenThrow } from './deferred-error';

function isSerializationConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}

export async function withUserContext<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TenantTransactionOptions,
): Promise<T> {
  const { maxRetries, isolationLevel } = { ...DEFAULT_OPTIONS, ...options };
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let deferredError: Error | undefined;
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL ROLE authenticated`;
          await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
          try {
            return await fn(tx);
          } catch (error) {
            if (!takeDeferredError(error)) throw error;
            deferredError = error;
            return undefined as T;
          }
        },
        { timeout: 30000, ...(isolationLevel ? { isolationLevel } : {}) },
      );
      if (deferredError) throw deferredError;
      return result;
    } catch (error) {
      if (error === deferredError) throw error;
      if (!isSerializationConflict(error)) throw error;
    }
  }

  throw new AppError(409, 'İşlem çakışması. Lütfen tekrar deneyin.', 'CONCURRENT_MODIFICATION');
}
