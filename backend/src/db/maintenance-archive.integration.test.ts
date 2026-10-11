import '../env';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { maintenancePrisma } from '../lib/maintenancePrisma';
import { archiveExpiredTasks } from '../services/tasks.archive';

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const userAId = randomUUID();
const userBId = randomUUID();
const teamAId = randomUUID();
const teamBId = randomUUID();
const eligibleAId = randomUUID();
const futureAId = randomUUID();
const archivedAId = randomUUID();
const eligibleBId = randomUUID();
const archivedAt = new Date('2026-01-01T00:00:00.000Z');
const oldDeadline = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const futureDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const parentRoleName = `maintenance_parent_${randomUUID().replace(/-/g, '')}`;
const untrustedRoleName = `maintenance_untrusted_${randomUUID().replace(/-/g, '')}`;
const queryClient = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  log: [{ emit: 'event', level: 'query' }],
});
let archiveUpdateColumns: string[] = [];
const membershipGuard = readFileSync(
  resolve(
    __dirname,
    '../../prisma/migrations/20261012090000_maintenance_archive_role/migration.sql',
  ),
  'utf8',
).match(/DO \$\$\s*DECLARE\s+maintenance_role oid;[\s\S]*?\$\$;/)?.[0];

queryClient.$on('query', ({ query }) => {
  const setClause = query.match(/UPDATE\s+(?:"[^"]+"\.)?"tasks"\s+SET\s+([\s\S]*?)\s+WHERE/i)?.[1];
  if (setClause) {
    archiveUpdateColumns = [...setClause.matchAll(/"([a-z_]+)"\s*=/g)].map(([, column]) => column);
  }
});

async function withMaintenanceRole<T>(
  tenantId: string | undefined,
  work: (db: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return maintenancePrisma.$transaction(async (db) => {
    await db.$executeRaw`SET LOCAL ROLE taskflow_maintenance`;
    if (tenantId) {
      await db.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    }
    return work(db);
  });
}

describe('maintenance archive role', () => {
  beforeAll(async () => {
    await maintenancePrisma.tenant.createMany({
      data: [
        { id: tenantAId, name: 'Maintenance A', slug: `maintenance-a-${tenantAId}`, nameKey: `maintenance-a-${tenantAId}` },
        { id: tenantBId, name: 'Maintenance B', slug: `maintenance-b-${tenantBId}`, nameKey: `maintenance-b-${tenantBId}` },
      ],
    });
    await maintenancePrisma.user.createMany({
      data: [
        {
          id: userAId,
          tenantId: tenantAId,
          email: `maintenance-a-${userAId}@test.com`,
          fullName: 'Maintenance A',
          passwordHash: 'test',
          displayId: `MA${userAId.slice(0, 8)}`,
          role: 'companyAdmin',
        },
        {
          id: userBId,
          tenantId: tenantBId,
          email: `maintenance-b-${userBId}@test.com`,
          fullName: 'Maintenance B',
          passwordHash: 'test',
          displayId: `MB${userBId.slice(0, 8)}`,
          role: 'companyAdmin',
        },
      ],
    });
    await maintenancePrisma.team.createMany({
      data: [
        { id: teamAId, tenantId: tenantAId, name: 'Maintenance A' },
        { id: teamBId, tenantId: tenantBId, name: 'Maintenance B' },
      ],
    });
    await maintenancePrisma.task.createMany({
      data: [
        { id: eligibleAId, teamId: teamAId, title: 'Eligible A', assignerId: userAId, deadline: oldDeadline },
        { id: futureAId, teamId: teamAId, title: 'Future A', assignerId: userAId, deadline: futureDeadline },
        { id: archivedAId, teamId: teamAId, title: 'Archived A', assignerId: userAId, deadline: oldDeadline, archivedAt },
        { id: eligibleBId, teamId: teamBId, title: 'Eligible B', assignerId: userBId, deadline: oldDeadline },
      ],
    });
  });

  beforeEach(async () => {
    await maintenancePrisma.task.updateMany({
      where: { id: { in: [eligibleAId, eligibleBId] } },
      data: { archivedAt: null },
    });
  });

  afterAll(async () => {
    await maintenancePrisma.task.deleteMany({ where: { id: { in: [eligibleAId, futureAId, archivedAId, eligibleBId] } } });
    await maintenancePrisma.team.deleteMany({ where: { id: { in: [teamAId, teamBId] } } });
    await maintenancePrisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await maintenancePrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await queryClient.$disconnect();
  });

  it('keeps the login role non-login, non-owner, and without RLS bypass', async () => {
    const [role] = await maintenancePrisma.$queryRaw<
      {
        rolcanlogin: boolean;
        rolinherit: boolean;
        rolsuper: boolean;
        rolbypassrls: boolean;
        has_membership: boolean;
        owns_public_objects: boolean;
        can_create_public: boolean;
      }[]
    >`SELECT r.rolcanlogin, r.rolinherit, r.rolsuper, r.rolbypassrls,
        EXISTS (
          SELECT 1 FROM pg_auth_members
          WHERE roleid = r.oid OR member = r.oid
        ) AS has_membership,
        EXISTS (
          SELECT 1 FROM pg_class
          WHERE relowner = r.oid AND relnamespace = 'public'::regnamespace
        ) OR EXISTS (
          SELECT 1 FROM pg_namespace
          WHERE nspowner = r.oid AND nspname = 'public'
        ) AS owns_public_objects,
        has_schema_privilege(r.oid, 'public', 'CREATE') AS can_create_public
      FROM pg_roles r WHERE rolname = 'taskflow_maintenance'`;

    expect(role).toEqual({
      rolcanlogin: false,
      rolinherit: false,
      rolsuper: false,
      rolbypassrls: false,
      has_membership: false,
      owns_public_objects: false,
      can_create_public: false,
    });
  });

  it('allows only provider-admin inverse membership in the migration guard', async () => {
    if (!membershipGuard) throw new Error('maintenance role membership guard was not found');
    await maintenancePrisma.$executeRawUnsafe(`CREATE ROLE ${parentRoleName} NOLOGIN`);
    await maintenancePrisma.$executeRawUnsafe(`CREATE ROLE ${untrustedRoleName} NOLOGIN`);

    try {
      await maintenancePrisma.$executeRawUnsafe(
        'GRANT taskflow_maintenance TO postgres WITH ADMIN OPTION',
      );
      await expect(maintenancePrisma.$executeRawUnsafe(membershipGuard)).resolves.toBeDefined();

      await maintenancePrisma.$executeRawUnsafe(
        `GRANT ${parentRoleName} TO taskflow_maintenance`,
      );
      await expect(maintenancePrisma.$executeRawUnsafe(membershipGuard)).rejects.toThrow(
        'taskflow_maintenance has an unsafe role membership',
      );
      await maintenancePrisma.$executeRawUnsafe(`REVOKE ${parentRoleName} FROM taskflow_maintenance`);

      await maintenancePrisma.$executeRawUnsafe(
        `GRANT taskflow_maintenance TO ${untrustedRoleName} WITH ADMIN OPTION`,
      );
      await expect(maintenancePrisma.$executeRawUnsafe(membershipGuard)).rejects.toThrow(
        'taskflow_maintenance has an unsafe role membership',
      );
    } finally {
      await maintenancePrisma.$executeRawUnsafe(
        `REVOKE taskflow_maintenance FROM ${untrustedRoleName}`,
      );
      await maintenancePrisma.$executeRawUnsafe(
        `REVOKE ${parentRoleName} FROM taskflow_maintenance`,
      );
      await maintenancePrisma.$executeRawUnsafe('REVOKE taskflow_maintenance FROM postgres');
      await maintenancePrisma.$executeRawUnsafe(
        `DROP ROLE ${parentRoleName}, ${untrustedRoleName}`,
      );
    }
  });

  it('enumerates tenant ids only and denies tenant reads without a tenant context', async () => {
    const tenants = await withMaintenanceRole(undefined, (db) => db.tenant.findMany({ select: { id: true } }));
    expect(tenants.map(({ id }) => id)).toEqual(expect.arrayContaining([tenantAId, tenantBId]));
    await expect(
      withMaintenanceRole(undefined, (db) => db.tenant.findMany({ select: { name: true } })),
    ).rejects.toBeDefined();

    await expect(
      withMaintenanceRole(undefined, (db) => db.task.findMany({ where: { id: eligibleAId }, select: { id: true } })),
    ).resolves.toEqual([]);
    await expect(
      withMaintenanceRole(undefined, (db) =>
        db.task.updateMany({ where: { id: eligibleAId }, data: { archivedAt: new Date() } }),
      ),
    ).resolves.toEqual({ count: 0 });
  });

  it('limits task reads and archive updates to the selected tenant and archive columns', async () => {
    const ownTasks = await withMaintenanceRole(tenantAId, (db) =>
      db.task.findMany({
        where: { id: { in: [eligibleAId, futureAId, archivedAId, eligibleBId] } },
        select: { id: true },
      }),
    );
    expect(ownTasks.map(({ id }) => id).sort()).toEqual([archivedAId, eligibleAId, futureAId].sort());
    await expect(
      withMaintenanceRole(tenantAId, (db) =>
        db.task.updateMany({ where: { id: eligibleBId }, data: { archivedAt: new Date() } }),
      ),
    ).resolves.toEqual({ count: 0 });
    await expect(
      withMaintenanceRole(tenantAId, (db) =>
        db.task.updateMany({ where: { id: futureAId }, data: { archivedAt: new Date() } }),
      ),
    ).resolves.toEqual({ count: 0 });
    await expect(
      withMaintenanceRole(tenantAId, (db) => db.task.findMany({ select: { title: true } })),
    ).rejects.toBeDefined();
    await expect(
      withMaintenanceRole(tenantAId, (db) =>
        db.task.updateMany({ where: { id: eligibleAId }, data: { title: 'blocked' } }),
      ),
    ).rejects.toBeDefined();
    await expect(
      withMaintenanceRole(tenantAId, (db) => db.task.deleteMany({ where: { id: eligibleAId } })),
    ).rejects.toBeDefined();
    await expect(
      withMaintenanceRole(tenantAId, (db) =>
        db.task.updateMany({ where: { id: eligibleAId }, data: { updatedAt: new Date() } }),
      ),
    ).rejects.toBeDefined();
    await expect(
      withMaintenanceRole(tenantAId, (db) =>
        db.task.updateMany({ where: { id: archivedAId }, data: { archivedAt: null } }),
      ),
    ).resolves.toEqual({ count: 0 });
  });

  it('archives only eligible tasks and preserves existing archive timestamps', async () => {
    archiveUpdateColumns = [];
    const result = await queryClient.$transaction(async (db) => {
      await db.$executeRaw`SET LOCAL ROLE taskflow_maintenance`;
      await db.$queryRaw`SELECT set_config('app.tenant_id', ${tenantAId}, true)`;
      return archiveExpiredTasks(db, tenantAId);
    });
    expect(result.archivedCount).toBe(1);
    expect(archiveUpdateColumns).toEqual(['archived_at', 'updated_at']);

    const rows = await maintenancePrisma.task.findMany({
      where: { id: { in: [eligibleAId, futureAId, archivedAId] } },
      select: { id: true, archivedAt: true },
    });
    expect(rows.find(({ id }) => id === eligibleAId)?.archivedAt).not.toBeNull();
    expect(rows.find(({ id }) => id === futureAId)?.archivedAt).toBeNull();
    expect(rows.find(({ id }) => id === archivedAId)?.archivedAt).toEqual(archivedAt);
  });

  it('runs the full batch over a direct maintenance login without role memberships', async () => {
    const password = randomBytes(32).toString('hex');
    await maintenancePrisma.$executeRawUnsafe(
      `ALTER ROLE taskflow_maintenance LOGIN PASSWORD '${password}'`,
    );
    const connectionUrl = new URL(process.env.DATABASE_URL!);
    connectionUrl.username = 'taskflow_maintenance';
    connectionUrl.password = password;
    let directMaintenancePrisma: PrismaClient | undefined;

    try {
      vi.resetModules();
      await import('../env');
      vi.stubEnv('MAINTENANCE_DATABASE_URL', connectionUrl.toString());
      const { runArchiveBatch } = await import('../archive-batch');
      directMaintenancePrisma = (await import('../lib/maintenancePrisma')).maintenancePrisma;
      await expect(runArchiveBatch()).resolves.toEqual({ archivedCount: 2 });
    } finally {
      await directMaintenancePrisma?.$disconnect();
      vi.unstubAllEnvs();
      await maintenancePrisma.$executeRaw`ALTER ROLE taskflow_maintenance NOLOGIN PASSWORD NULL`;
      vi.resetModules();
    }

    const rows = await maintenancePrisma.task.findMany({
      where: { id: { in: [eligibleAId, eligibleBId] } },
      select: { id: true, archivedAt: true },
    });
    expect(rows.every(({ archivedAt: value }) => value !== null)).toBe(true);
  });
});
