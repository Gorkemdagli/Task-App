import type { Prisma, PrismaClient } from '@prisma/client';
import { performance } from 'node:perf_hooks';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/appError';
import { takeDeferredError } from './deferred-error';

export { commitThenThrow } from './deferred-error';

export type TransactionPhase =
  | 'tx_open_ms'
  | 'role_ms'
  | 'user_context_ms'
  | 'tenant_context_ms'
  | 'context_ms'
  | 'callback_ms'
  | 'tx_finish_ms';

export type TransactionPhaseRecorder = (phase: TransactionPhase, elapsedMs: number) => void;

export type TenantTransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxRetries?: number;
  phaseRecorder?: TransactionPhaseRecorder;
};

export function recordTransactionPhase(
  phaseRecorder: TransactionPhaseRecorder,
  phase: TransactionPhase,
  elapsedMs: number,
): void {
  // Diagnostics must not replace a database result or error.
  try {
    phaseRecorder(phase, elapsedMs);
  } catch {
    // A timing observer must not affect the transaction.
  }
}

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
  const { maxRetries, isolationLevel, phaseRecorder } = { ...DEFAULT_OPTIONS, ...options };
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let deferredError: Error | undefined;
    const transactionStartedAt = phaseRecorder ? performance.now() : undefined;
    let transactionCallbackEntered = false;
    let transactionCallbackExitedAt: number | undefined;
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Sıra kritik: ROLE önce, yoksa aşağıdaki SET LOCAL'lar authenticated
          // rolünde olur ama SELECT/INSERT sırasında aktif rol hala app user.
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
              // The two GUCs are independent; batch them only after activating the restricted role.
              startedAt = performance.now();
              try {
                await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true), set_config('app.tenant_id', ${tenantId}, true)`;
              } finally {
                recordTransactionPhase(
                  phaseRecorder,
                  'context_ms',
                  performance.now() - startedAt,
                );
              }
            } else {
              await tx.$executeRaw`SET LOCAL ROLE authenticated`;
              await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true), set_config('app.tenant_id', ${tenantId}, true)`;
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

// Re-export Prisma type for consumers
export type { PrismaClient };
