import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Tenant context'i aktif ederek callback'i transaction içinde çalıştırır.
 * RLS politikaları `TO authenticated` ile tanımlı — connection role'u
 * SET LOCAL ile authenticated'a çevirmek ZORUNLU, yoksa policy uygulanmaz
 * (app user postgres rolünde kalır, BYPASSRLS olmasa bile authenticated
 * policy'lerine tabi olmaz).
 *
 * NOT: userId/tenantId interpolated SQL — caller (Faz 2 auth middleware)
 * UUID validate etmeli. Aksi halde SQL injection riski var.
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
      await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`);
      await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${userId}'`);
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
      return fn(tx);
    },
    { timeout: 30000 }, // 30s — Prisma Postgres Accelerate latency'yi kaldirir
  );
}

// Re-export Prisma type for consumers
export type { PrismaClient };
