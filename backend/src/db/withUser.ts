import type { Prisma } from '@prisma/client';
import { performance } from 'node:perf_hooks';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/appError';
import { recordTransactionPhase, type TenantTransactionOptions } from './withTenant';
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
  const { maxRetries, isolationLevel, phaseRecorder } = { ...DEFAULT_OPTIONS, ...options };
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let deferredError: Error | undefined;
    const transactionStartedAt = phaseRecorder ? performance.now() : undefined;
    let transactionCallbackEntered = false;
    let transactionCallbackExitedAt: number | undefined;
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          try {
            if (phaseRecorder) {
              transactionCallbackEntered = true;
              recordTransactionPhase(
                phaseRecorder,
                'tx_open_ms',
                performance.now() - transactionStartedAt!,
              );

              let startedAt = performance.now();
              try {
                await tx.$executeRaw`SET LOCAL ROLE authenticated`;
              } finally {
                recordTransactionPhase(phaseRecorder, 'role_ms', performance.now() - startedAt);
              }
              startedAt = performance.now();
              try {
                await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
              } finally {
                recordTransactionPhase(
                  phaseRecorder,
                  'user_context_ms',
                  performance.now() - startedAt,
                );
              }
            } else {
              await tx.$executeRaw`SET LOCAL ROLE authenticated`;
              await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
            }

            try {
              if (phaseRecorder) {
                const startedAt = performance.now();
                try {
                  return await fn(tx);
                } finally {
                  recordTransactionPhase(
                    phaseRecorder,
                    'callback_ms',
                    performance.now() - startedAt,
                  );
                }
              }
              return await fn(tx);
            } catch (error) {
              if (!takeDeferredError(error)) throw error;
              deferredError = error;
              return undefined as T;
            }
          } finally {
            if (phaseRecorder) transactionCallbackExitedAt = performance.now();
          }
        },
        { timeout: 30000, ...(isolationLevel ? { isolationLevel } : {}) },
      );
      if (deferredError) throw deferredError;
      return result;
    } catch (error) {
      if (error === deferredError) throw error;
      if (!isSerializationConflict(error)) throw error;
    } finally {
      if (phaseRecorder) {
        if (!transactionCallbackEntered) {
          recordTransactionPhase(
            phaseRecorder,
            'tx_open_ms',
            performance.now() - transactionStartedAt!,
          );
        }
        if (transactionCallbackExitedAt !== undefined) {
          recordTransactionPhase(
            phaseRecorder,
            'tx_finish_ms',
            performance.now() - transactionCallbackExitedAt,
          );
        }
      }
    }
  }

  throw new AppError(409, 'İşlem çakışması. Lütfen tekrar deneyin.', 'CONCURRENT_MODIFICATION');
}
