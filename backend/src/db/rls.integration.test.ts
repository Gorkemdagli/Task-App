import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { withTenantContext } from './withTenant';
import { withUserContext } from './withUser';
import type { TenantDb } from './types';

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const userAId = randomUUID();
const userBId = randomUUID();
const tenantlessUserId = randomUUID();
const otherTenantlessUserId = randomUUID();
const teamAId = randomUUID();
const teamBId = randomUUID();
const taskAId = randomUUID();
const taskBId = randomUUID();

type TransactionContextState = {
  backendPid: number;
  currentUser: string;
  sessionUser: string;
  userId: string | null;
  tenantId: string | null;
};

async function asTenant<T>(
  tenantId: string,
  userId: string,
  work: (db: TenantDb) => Promise<T>,
): Promise<T> {
  return withTenantContext(userId, tenantId, work);
}

async function setAuthenticatedTenantContext(
  tx: Prisma.TransactionClient,
  userId: string,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SET LOCAL ROLE authenticated`;
  await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true), set_config('app.tenant_id', ${tenantId}, true)`;
}

async function readConnectionState(client: PrismaClient): Promise<TransactionContextState> {
  return client.$transaction(async (tx) => {
    const [state] = await tx.$queryRaw<TransactionContextState[]>`
      SELECT
        pg_backend_pid() AS "backendPid",
        current_user AS "currentUser",
        session_user AS "sessionUser",
        current_setting('app.user_id', true) AS "userId",
        current_setting('app.tenant_id', true) AS "tenantId"
    `;
    return state;
  });
}

describe('RLS tenant isolation for task relations', () => {
  beforeAll(async () => {
    await prisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          name: 'Tenant A',
          slug: `r1-a-${tenantAId}`,
          nameKey: `r1-a-${tenantAId}`,
        },
        {
          id: tenantBId,
          name: 'Tenant B',
          slug: `r1-b-${tenantBId}`,
          nameKey: `r1-b-${tenantBId}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: userAId,
          tenantId: tenantAId,
          email: `r1-a-${userAId}@test.com`,
          fullName: 'R1 A',
          passwordHash: 'test',
          displayId: `#R1A-${userAId.slice(0, 8)}`,
          role: 'companyAdmin',
        },
        {
          id: userBId,
          tenantId: tenantBId,
          email: `r1-b-${userBId}@test.com`,
          fullName: 'R1 B',
          passwordHash: 'test',
          displayId: `#R1B-${userBId.slice(0, 8)}`,
          role: 'companyAdmin',
        },
        {
          id: tenantlessUserId,
          tenantId: null,
          email: `r1-tenantless-${tenantlessUserId}@test.com`,
          fullName: 'R1 Tenantless',
          passwordHash: 'test',
          displayId: `R1TL${tenantlessUserId.slice(0, 6)}`,
          role: 'member',
        },
        {
          id: otherTenantlessUserId,
          tenantId: null,
          email: `r1-other-tenantless-${otherTenantlessUserId}@test.com`,
          fullName: 'R1 Other Tenantless',
          passwordHash: 'test',
          displayId: `R1OT${otherTenantlessUserId.slice(0, 6)}`,
          role: 'member',
        },
      ],
    });
    await prisma.team.createMany({
      data: [
        { id: teamAId, tenantId: tenantAId, name: 'Team A' },
        { id: teamBId, tenantId: tenantBId, name: 'Team B' },
      ],
    });
    await prisma.task.createMany({
      data: [
        { id: taskAId, teamId: teamAId, title: 'Task A', assignerId: userAId },
        { id: taskBId, teamId: teamBId, title: 'Task B', assignerId: userBId },
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
        { taskId: taskAId, userId: userAId, proposedStatus: 'done', pendingVersion: 0 },
        { taskId: taskBId, userId: userBId, proposedStatus: 'done', pendingVersion: 0 },
      ],
    });
    await prisma.taskEvent.createMany({
      data: [
        { taskId: taskAId, actorId: userAId, eventType: 'task_created' },
        { taskId: taskBId, actorId: userBId, eventType: 'task_created' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [tenantlessUserId, otherTenantlessUserId] } } });
  });

  it('applies RLS as a non-superuser and clears local context after commit and rollback', async () => {
    const adminConnectionString = env.DATABASE_URL ?? env.APP_DATABASE_URL;
    if (!adminConnectionString || env.NODE_ENV === 'production') {
      throw new Error('RLS test role fixture requires a non-production test datasource');
    }
    const adminUrl = new URL(adminConnectionString);
    if (
      adminUrl.pathname !== '/taskflow_test' ||
      adminUrl.port !== '5433' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(adminUrl.hostname)
    ) {
      throw new Error('RLS test role fixture is restricted to local taskflow_test on port 5433');
    }

    const roleName = `taskflow_test_runtime_${randomUUID().replaceAll('-', '')}`;
    const quotedRoleName = `"${roleName}"`;
    const password = randomBytes(32).toString('hex');
    const adminClient = new PrismaClient({
      adapter: new PrismaPg({ connectionString: adminUrl.toString() }),
      log: [],
    });
    let runtimeClient: PrismaClient | undefined;
    let roleCreated = false;

    try {
      try {
        await adminClient.$executeRawUnsafe(
          `CREATE ROLE ${quotedRoleName} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`,
        );
        roleCreated = true;
        await adminClient.$executeRawUnsafe(`GRANT authenticated TO ${quotedRoleName}`);
      } catch {
        throw new Error('could not provision an isolated non-superuser RLS test role');
      }

      const runtimeUrl = new URL(adminUrl);
      runtimeUrl.username = roleName;
      runtimeUrl.password = password;
      runtimeClient = new PrismaClient({
        adapter: new PrismaPg({ connectionString: runtimeUrl.toString() }),
        log: [],
      });

      let runtimeRole: { sessionUser: string; isSuperuser: boolean; bypassesRls: boolean };
      try {
        [runtimeRole] = await runtimeClient.$queryRaw<
          Array<{ sessionUser: string; isSuperuser: boolean; bypassesRls: boolean }>
        >`
          SELECT
            session_user AS "sessionUser",
            db_role.rolsuper AS "isSuperuser",
            db_role.rolbypassrls AS "bypassesRls"
          FROM pg_roles AS db_role
          WHERE db_role.rolname = session_user
        `;
      } catch {
        throw new Error('could not connect with the isolated RLS test role');
      }
      expect(runtimeRole).toEqual({
        sessionUser: roleName,
        isSuperuser: false,
        bypassesRls: false,
      });

      const scoped = await runtimeClient.$transaction(async (tx) => {
        await setAuthenticatedTenantContext(tx, userAId, tenantAId);
        const [context] = await tx.$queryRaw<TransactionContextState[]>`
          SELECT
            pg_backend_pid() AS "backendPid",
            current_user AS "currentUser",
            session_user AS "sessionUser",
            current_setting('app.user_id', true) AS "userId",
            current_setting('app.tenant_id', true) AS "tenantId"
        `;
        const visibleAssignees = await tx.taskAssignee.findMany({
          where: { taskId: { in: [taskAId, taskBId] } },
        });
        const crossTenantUpdate = await tx.taskAssignee.updateMany({
          where: { taskId: taskBId },
          data: { userId: userAId },
        });
        return {
          context,
          visibleTaskIds: visibleAssignees.map((row) => row.taskId),
          crossTenantUpdate,
        };
      });
      expect(scoped.context).toMatchObject({
        currentUser: 'authenticated',
        sessionUser: roleName,
        userId: userAId,
        tenantId: tenantAId,
      });
      expect(scoped.visibleTaskIds).toEqual([taskAId]);
      expect(scoped.crossTenantUpdate.count).toBe(0);

      const expectContextCleared = (state: TransactionContextState) => {
        expect(state.backendPid).toBe(scoped.context.backendPid);
        expect(state.currentUser).toBe(roleName);
        expect(state.sessionUser).toBe(roleName);
        expect(state.userId).not.toBe(userAId);
        expect(state.tenantId).not.toBe(tenantAId);
      };
      expectContextCleared(await readConnectionState(runtimeClient));

      const rollbackUserId = randomUUID();
      const rollbackTenantId = randomUUID();
      const rollbackError = new Error('expected rollback');
      await expect(
        runtimeClient.$transaction(async (tx) => {
          await setAuthenticatedTenantContext(tx, rollbackUserId, rollbackTenantId);
          throw rollbackError;
        }),
      ).rejects.toBe(rollbackError);
      const afterRollback = await readConnectionState(runtimeClient);
      expectContextCleared(afterRollback);
      expect(afterRollback.userId).not.toBe(rollbackUserId);
      expect(afterRollback.tenantId).not.toBe(rollbackTenantId);
    } finally {
      try {
        await runtimeClient?.$disconnect();
      } finally {
        try {
          if (roleCreated) {
            await adminClient.$executeRawUnsafe(`DROP ROLE IF EXISTS ${quotedRoleName}`);
          }
        } finally {
          await adminClient.$disconnect();
        }
      }
    }
  });

  it('tenant A child reads exclude B and cross-tenant writes cannot pass policy', async () => {
    const assignees = await asTenant(tenantAId, userAId, (db) =>
      db.taskAssignee.findMany({ orderBy: { taskId: 'asc' } }),
    );
    const acks = await asTenant(tenantAId, userAId, (db) =>
      db.taskStatusAck.findMany({ orderBy: { taskId: 'asc' } }),
    );
    const events = await asTenant(tenantAId, userAId, (db) =>
      db.taskEvent.findMany({ orderBy: { taskId: 'asc' } }),
    );

    expect(assignees.map((row) => row.taskId)).toEqual([taskAId]);
    expect(acks.map((row) => row.taskId)).toEqual([taskAId]);
    expect(events.map((row) => row.taskId)).toEqual([taskAId]);

    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskAssignee.create({ data: { taskId: taskBId, userId: userAId } }),
      ),
    ).rejects.toBeDefined();
    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskStatusAck.create({
          data: { taskId: taskBId, userId: userAId, proposedStatus: 'done', pendingVersion: 0 },
        }),
      ),
    ).rejects.toBeDefined();
    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskEvent.create({
          data: { taskId: taskBId, actorId: userAId, eventType: 'task_created' },
        }),
      ),
    ).rejects.toBeDefined();

    const updateResult = await asTenant(tenantAId, userAId, (db) =>
      db.taskAssignee.updateMany({ where: { taskId: taskBId }, data: { userId: userAId } }),
    );
    const deleteResult = await asTenant(tenantAId, userAId, (db) =>
      db.taskStatusAck.deleteMany({ where: { taskId: taskBId } }),
    );
    expect(updateResult.count).toBe(0);
    expect(deleteResult.count).toBe(0);
    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskEvent.updateMany({ where: { taskId: taskBId }, data: { actorId: userAId } }),
      ),
    ).rejects.toBeDefined();
    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskEvent.deleteMany({ where: { taskId: taskBId } }),
      ),
    ).rejects.toBeDefined();
  });

  it('task events are append-only and task files remain tenant-scoped', async () => {
    const ownTenantEvent = await asTenant(tenantAId, userAId, (db) =>
      db.taskEvent.findFirstOrThrow({ where: { taskId: taskAId } }),
    );

    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskEvent.update({
          where: { id: ownTenantEvent.id },
          data: { metadata: { tampered: true } },
        }),
      ),
    ).rejects.toBeDefined();
    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskEvent.delete({ where: { id: ownTenantEvent.id } }),
      ),
    ).rejects.toBeDefined();

    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskFile.create({
          data: {
            tenantId: tenantAId,
            taskId: taskAId,
            uploaderId: userBId,
            originalName: 'cross-tenant-uploader.pdf',
            objectPath: `tenants/${tenantAId}/tasks/${taskAId}/cross-tenant-uploader`,
            mimeType: 'application/pdf',
            sizeBytes: 128,
          },
        }),
      ),
    ).rejects.toBeDefined();
    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskFile.create({
          data: {
            tenantId: tenantBId,
            taskId: taskAId,
            uploaderId: userAId,
            originalName: 'wrong-tenant.pdf',
            objectPath: `tenants/${tenantBId}/tasks/${taskAId}/wrong-tenant`,
            mimeType: 'application/pdf',
            sizeBytes: 128,
          },
        }),
      ),
    ).rejects.toBeDefined();
    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskFile.create({
          data: {
            tenantId: tenantAId,
            taskId: taskBId,
            uploaderId: userAId,
            originalName: 'wrong-task.pdf',
            objectPath: `tenants/${tenantAId}/tasks/${taskBId}/wrong-task`,
            mimeType: 'application/pdf',
            sizeBytes: 128,
          },
        }),
      ),
    ).rejects.toBeDefined();

    const ownTenantFile = await asTenant(tenantAId, userAId, (db) =>
      db.taskFile.create({
        data: {
          tenantId: tenantAId,
          taskId: taskAId,
          uploaderId: userAId,
          originalName: 'brief.pdf',
          objectPath: `tenants/${tenantAId}/tasks/${taskAId}/file-a`,
          mimeType: 'application/pdf',
          sizeBytes: 128,
        },
      }),
    );

    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskFile.update({
          where: { id: ownTenantFile.id },
          data: { objectPath: `tenants/${tenantAId}/tasks/${taskAId}/mutated` },
        }),
      ),
    ).rejects.toBeDefined();

    const deletedAt = new Date();
    const softDeletedFile = await asTenant(tenantAId, userAId, (db) =>
      db.taskFile.update({
        where: { id: ownTenantFile.id },
        data: { deletedAt, deletedById: userAId },
      }),
    );

    expect(softDeletedFile).toMatchObject({
      id: ownTenantFile.id,
      objectPath: ownTenantFile.objectPath,
      deletedAt,
      deletedById: userAId,
    });

    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.taskFile.update({
          where: { id: ownTenantFile.id },
          data: { deletedById: userBId },
        }),
      ),
    ).rejects.toBeDefined();

    const tenantBFiles = await asTenant(tenantBId, userBId, (db) =>
      db.taskFile.findMany({ where: { taskId: taskAId } }),
    );

    expect(tenantBFiles).toEqual([]);
  });

  it('allows only tenantless members to update their own profile under user context', async () => {
    const updated = await withUserContext(tenantlessUserId, (db) =>
      db.user.update({
        where: { id: tenantlessUserId },
        data: { fullName: 'Updated Tenantless' },
      }),
    );
    expect(updated.fullName).toBe('Updated Tenantless');

    await expect(
      withUserContext(tenantlessUserId, (db) =>
        db.user.update({
          where: { id: otherTenantlessUserId },
          data: { fullName: 'Changed by another user' },
        }),
      ),
    ).rejects.toBeDefined();
    await expect(
      withUserContext(userAId, (db) =>
        db.user.update({ where: { id: userAId }, data: { fullName: 'Changed without tenant' } }),
      ),
    ).rejects.toBeDefined();

    await expect(
      withUserContext(tenantlessUserId, (db) =>
        db.user.update({ where: { id: tenantlessUserId }, data: { id: randomUUID() } }),
      ),
    ).rejects.toBeDefined();
    await expect(
      withUserContext(tenantlessUserId, (db) =>
        db.user.update({ where: { id: tenantlessUserId }, data: { tenantId: tenantAId } }),
      ),
    ).rejects.toBeDefined();
    await expect(
      withUserContext(tenantlessUserId, (db) =>
        db.user.update({ where: { id: tenantlessUserId }, data: { role: 'companyAdmin' } }),
      ),
    ).rejects.toBeDefined();

    const forbiddenForeignWrite = await asTenant(tenantAId, userAId, (db) =>
      db.user.updateMany({ where: { id: userBId }, data: { fullName: 'Changed cross-tenant' } }),
    );
    expect(forbiddenForeignWrite.count).toBe(0);
    await expect(
      withUserContext(tenantlessUserId, (db) =>
        db.user.findUnique({ where: { id: userBId } }),
      ),
    ).resolves.toBeNull();

    const unchangedOther = await prisma.user.findUniqueOrThrow({ where: { id: otherTenantlessUserId } });
    const unchangedTenantUser = await prisma.user.findUniqueOrThrow({ where: { id: userAId } });
    expect(unchangedOther.fullName).toBe('R1 Other Tenantless');
    expect(unchangedTenantUser.fullName).toBe('R1 A');
    const current = await prisma.user.findUniqueOrThrow({ where: { id: tenantlessUserId } });
    expect(current).toMatchObject({
      id: tenantlessUserId,
      tenantId: null,
      role: 'member',
      fullName: 'Updated Tenantless',
    });
  });

  it('tenantless users can be claimed by the current tenant', async () => {
    await expect(
      asTenant(tenantAId, userAId, (db) =>
        db.user.updateMany({
          where: { id: tenantlessUserId, tenantId: null },
          data: { tenantId: tenantBId, role: 'member' },
        }),
      ),
    ).rejects.toBeDefined();

    const result = await asTenant(tenantAId, userAId, (db) =>
      db.user.updateMany({
        where: { id: tenantlessUserId, tenantId: null },
        data: { tenantId: tenantAId, role: 'member' },
      }),
    );

    expect(result.count).toBe(1);
  });
});
