import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/appError';
import { takeDeferredError } from './deferred-error';

export { commitThenThrow } from './deferred-error';

export type TenantTransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxRetries?: number;
};

const DEFAULT_OPTIONS: Required<Pick<TenantTransactionOptions, 'maxRetries'>> = {
  maxRetries: 1,
};

function isSerializationConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}

/**
 * Tenant context'i aktif ederek callback'i transaction içinde çalıştırır.
 * RLS politikaları `TO authenticated` ile tanımlı — connection role'u
 * SET LOCAL ile authenticated'a çevirmek ZORUNLU, yoksa policy uygulanmaz
 * (app user postgres rolünde kalır, BYPASSRLS olmasa bile authenticated
 * policy'lerine tabi olmaz).
 *
 */
export async function withTenantContext<T>(
  userId: string,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TenantTransactionOptions,
): Promise<T> {
  const { maxRetries, isolationLevel } = { ...DEFAULT_OPTIONS, ...options };
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let deferredError: Error | undefined;
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Sıra kritik: ROLE önce, yoksa aşağıdaki SET LOCAL'lar authenticated
          // rolünde olur ama SELECT/INSERT sırasında aktif rol hala app user.
          await tx.$executeRaw`SET LOCAL ROLE authenticated`;
          await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
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

// Re-export Prisma type for consumers
export type { PrismaClient };
