import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const tenantAId = randomUUID();
const tenantBId = randomUUID();
const userAId = randomUUID();
const userBId = randomUUID();
const teamAId = randomUUID();
const teamBId = randomUUID();
const taskAId = randomUUID();
const taskBId = randomUUID();

async function setup(): Promise<void> {
  await prisma.tenant.createMany({
    data: [
      {
        id: tenantAId,
        name: 'RLS Verify A',
        slug: `rls-verify-a-${tenantAId}`,
        nameKey: `rls-verify-a-${tenantAId}`,
      },
      {
        id: tenantBId,
        name: 'RLS Verify B',
        slug: `rls-verify-b-${tenantBId}`,
        nameKey: `rls-verify-b-${tenantBId}`,
      },
    ],
  });
  await prisma.user.createMany({
    data: [
      {
        id: userAId,
        tenantId: tenantAId,
        email: `rls-a-${userAId}@test.com`,
        fullName: 'RLS A',
        passwordHash: 'verify-only',
        displayId: `#RLSA-${userAId.slice(0, 8)}`,
        role: 'companyAdmin',
      },
      {
        id: userBId,
        tenantId: tenantBId,
        email: `rls-b-${userBId}@test.com`,
        fullName: 'RLS B',
        passwordHash: 'verify-only',
        displayId: `#RLSB-${userBId.slice(0, 8)}`,
        role: 'companyAdmin',
      },
    ],
  });
  await prisma.team.createMany({
    data: [
      { id: teamAId, tenantId: tenantAId, name: 'RLS Team A' },
      { id: teamBId, tenantId: tenantBId, name: 'RLS Team B' },
    ],
  });
  await prisma.task.createMany({
    data: [
      { id: taskAId, teamId: teamAId, title: 'RLS Task A', assignerId: userAId },
      { id: taskBId, teamId: teamBId, title: 'RLS Task B', assignerId: userBId },
    ],
  });
  await prisma.taskAssignee.createMany({
    data: [
      { taskId: taskAId, userId: userAId },
      { taskId: taskBId, userId: userBId },
    ],
  });
  await prisma.taskStatusAck.createMany({
    data: [
      { taskId: taskAId, userId: userAId, proposedStatus: 'done' },
      { taskId: taskBId, userId: userBId, proposedStatus: 'done' },
    ],
  });
}

async function cleanup(): Promise<void> {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
}

async function inTenant<T>(
  tenantId: string,
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL ROLE authenticated`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return work(tx);
  });
}

async function verifyTenant(
  tenantId: string,
  userId: string,
  expectedTaskId: string,
): Promise<void> {
  const tasks = await inTenant(tenantId, userId, (tx) =>
    tx.task.findMany({ where: { id: { in: [taskAId, taskBId] } } }),
  );
  const assignees = await inTenant(tenantId, userId, (tx) =>
    tx.taskAssignee.findMany({ where: { taskId: { in: [taskAId, taskBId] } } }),
  );
  const acks = await inTenant(tenantId, userId, (tx) =>
    tx.taskStatusAck.findMany({ where: { taskId: { in: [taskAId, taskBId] } } }),
  );

  if (
    tasks
      .map((task) => task.id)
      .sort()
      .join() !== expectedTaskId ||
    assignees
      .map((row) => row.taskId)
      .sort()
      .join() !== expectedTaskId ||
    acks
      .map((row) => row.taskId)
      .sort()
      .join() !== expectedTaskId
  ) {
    throw new Error('tenant isolation mismatch');
  }
}

async function main(): Promise<void> {
  let pass = 0;
  let fail = 0;

  try {
    await setup();
    await verifyTenant(tenantAId, userAId, taskAId);
    pass++;
    await verifyTenant(tenantBId, userBId, taskBId);
    pass++;
    let denied = 0;
    try {
      await inTenant(tenantAId, userAId, (tx) =>
        tx.taskAssignee.create({ data: { taskId: taskBId, userId: userAId } }),
      );
    } catch {
      denied++;
    }
    try {
      await inTenant(tenantAId, userAId, (tx) =>
        tx.taskStatusAck.create({
          data: { taskId: taskBId, userId: userAId, proposedStatus: 'done' },
        }),
      );
    } catch {
      denied++;
    }
    if (denied !== 2) throw new Error('cross-tenant writes were not denied');
    pass++;
    console.log(`RLS verify: ${pass} PASS, ${fail} FAIL`);
  } catch {
    fail++;
    console.log(`RLS verify: ${pass} PASS, ${fail} FAIL`);
    process.exitCode = 1;
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main();
