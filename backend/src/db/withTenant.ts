import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

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
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // Sıra kritik: ROLE önce, yoksa aşağıdaki SET LOCAL'lar authenticated
      // rolünde olur ama SELECT/INSERT sırasında aktif rol hala app user.
      await tx.$executeRaw`SET LOCAL ROLE authenticated`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    { timeout: 30000 }, // 30s — Prisma Postgres Accelerate latency'yi kaldirir
  );
}

// Re-export Prisma type for consumers
export type { PrismaClient };
