import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Tenant context'i aktif ederek callback'i transaction içinde çalıştırır.
 * RLS politikaları current_setting('app.tenant_id') üzerinden okur.
 *
 * NOT: userId/tenantId interpolated SQL — caller (Faz 2 auth middleware)
 * UUID validate etmeli. Aksi halde SQL injection riski var.
 */
export async function withTenantContext<T>(
  userId: string,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${userId}'`);
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(tx);
  });
}

// Re-export Prisma type for consumers
export type { PrismaClient };
