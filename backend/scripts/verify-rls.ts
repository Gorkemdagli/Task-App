/**
 * RLS izolasyonunu manuel doğrulama script'i.
 *
 * Kullanım:
 *   cd backend && npx tsx scripts/verify-rls.ts
 *
 * Ne yapar:
 *   1. Önce DB'de 2 test tenant + 1'er kullanıcı + 1'er görev oluşturur
 *   2. SET LOCAL ile tenant A context'inde SELECT yapar → sadece A satırı
 *   3. SET LOCAL ile tenant B context'inde SELECT yapar → sadece B satırı
 *   4. SET LOCAL olmadan SELECT yapar → 0 satır (RLS default deny)
 *   5. Test verisini temizler
 *
 * Çıkış: PASS/FAIL özeti. Faz 1 çıkış kriterinin manuel kanıtı.
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const TENANT_A_ID = randomUUID();
const TENANT_B_ID = randomUUID();
const USER_A_ID = randomUUID();
const USER_B_ID = randomUUID();
const TEAM_A_ID = randomUUID();
const TEAM_B_ID = randomUUID();

async function setup() {
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES
     ('${TENANT_A_ID}', 'Test Tenant A', 'test-a-${Date.now()}', now(), now()),
     ('${TENANT_B_ID}', 'Test Tenant B', 'test-b-${Date.now()}', now(), now())`,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO users (id, tenant_id, email, full_name, role, created_at, updated_at) VALUES
     ('${USER_A_ID}', '${TENANT_A_ID}', 'usera-${Date.now()}@test.com', 'User A', 'companyAdmin', now(), now()),
     ('${USER_B_ID}', '${TENANT_B_ID}', 'userb-${Date.now()}@test.com', 'User B', 'companyAdmin', now(), now())`,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO teams (id, tenant_id, name, created_at, updated_at) VALUES
     ('${TEAM_A_ID}', '${TENANT_A_ID}', 'Team A', now(), now()),
     ('${TEAM_B_ID}', '${TENANT_B_ID}', 'Team B', now(), now())`,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO tasks (id, team_id, title, status, priority, assigner_id, assignee_id, created_at, updated_at) VALUES
     ('${randomUUID()}', '${TEAM_A_ID}', 'Task in A', 'todo', 'medium', '${USER_A_ID}', '${USER_A_ID}', now(), now()),
     ('${randomUUID()}', '${TEAM_B_ID}', 'Task in B', 'todo', 'medium', '${USER_B_ID}', '${USER_B_ID}', now(), now())`,
  );
}

async function cleanup() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM tasks WHERE team_id IN ('${TEAM_A_ID}', '${TEAM_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM teams WHERE id IN ('${TEAM_A_ID}', '${TEAM_B_ID}')`);
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id IN ('${USER_A_ID}', '${USER_B_ID}')`);
  await prisma.$executeRawUnsafe(
    `DELETE FROM tenants WHERE id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
}

async function countTasksInContext(tenantId: string | null): Promise<number> {
  return prisma.$transaction(async (tx) => {
    if (tenantId) {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET LOCAL app.user_id = 'test-user'`);
    }
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM tasks WHERE team_id IN ('${TEAM_A_ID}', '${TEAM_B_ID}')`,
    );
    return Number(rows[0]?.count ?? 0);
  });
}

async function main() {
  let pass = 0;
  let fail = 0;

  try {
    console.log('🔧 Test verisi oluşturuluyor...');
    await setup();

    console.log("\n📋 Test 1: Tenant A context'inde sadece A görevleri görünmeli");
    const aCount = await countTasksInContext(TENANT_A_ID);
    if (aCount === 1) {
      console.log('  ✅ PASS: 1 görev (sadece A)');
      pass++;
    } else {
      console.log(`  ❌ FAIL: beklenen 1, gerçek ${aCount}`);
      fail++;
    }

    console.log("\n📋 Test 2: Tenant B context'inde sadece B görevleri görünmeli");
    const bCount = await countTasksInContext(TENANT_B_ID);
    if (bCount === 1) {
      console.log('  ✅ PASS: 1 görev (sadece B)');
      pass++;
    } else {
      console.log(`  ❌ FAIL: beklenen 1, gerçek ${bCount}`);
      fail++;
    }

    console.log('\n📋 Test 3: Context olmadan 0 görev (RLS default deny)');
    const noContextCount = await countTasksInContext(null);
    if (noContextCount === 0) {
      console.log('  ✅ PASS: 0 görev (RLS engelledi)');
      pass++;
    } else {
      console.log(`  ❌ FAIL: beklenen 0, gerçek ${noContextCount}`);
      fail++;
    }
  } finally {
    console.log('\n🧹 Test verisi temizleniyor...');
    await cleanup();
    await prisma.$disconnect();
  }

  console.log(`\n📊 Sonuç: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Script hatası:', err);
  process.exit(1);
});
