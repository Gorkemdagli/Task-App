import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type * as AuthServiceModule from './auth.service';
import type * as DisplayIdModule from '../lib/displayId';
import { env } from '../env';
import { prisma as adminPrisma } from '../lib/prisma';

declare module 'vitest' {
  export interface ProvidedContext {
    taskflowAppPassword: string;
  }
}

const generateDisplayIdMock = vi.fn<() => string>();
const userIds: string[] = [];
const tenantIds: string[] = [];
const sessions: Array<{ accessToken: string; refreshToken: string }> = [];
let runtimePrisma: PrismaClient;
let authService: typeof AuthServiceModule;
let generateDisplayIdActual: () => string;

describe('auth bootstrap with the restricted runtime role', () => {
  beforeAll(async () => {
    const appUrl = new URL(env.DATABASE_URL);
    appUrl.username = 'taskflow_app';
    appUrl.password = inject('taskflowAppPassword');
    runtimePrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: appUrl.toString(), max: 1 }),
    });

    const displayIdModule = await vi.importActual<typeof DisplayIdModule>('../lib/displayId');
    generateDisplayIdActual = displayIdModule.generateDisplayId;
    generateDisplayIdMock.mockImplementation(generateDisplayIdActual);
    vi.doMock('../lib/prisma', () => ({ prisma: runtimePrisma }));
    vi.doMock('../lib/displayId', () => ({ generateDisplayId: generateDisplayIdMock }));
    authService = await import('./auth.service');
  });

  afterAll(async () => {
    for (const session of sessions) {
      await authService.logout(session.accessToken, session.refreshToken);
    }
    if (userIds.length) await adminPrisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (tenantIds.length) await adminPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await runtimePrisma?.$disconnect();
  });

  it('registers, logs in, and refreshes personal and company users with scoped reads', async () => {
    const suffix = randomUUID();
    const personal = await authService.register({
      fullName: 'Restricted Member',
      email: `member-${suffix}@example.test`,
      password: 'hunter22',
    });
    userIds.push(personal.user.id);
    sessions.push(personal);
    expect(personal.user.tenantId).toBeNull();

    const companyName = `Restricted Company ${suffix}`;
    const company = await authService.register({
      fullName: 'Restricted Admin',
      email: `admin-${suffix}@example.test`,
      password: 'hunter22',
      companyName,
    });
    userIds.push(company.user.id);
    if (company.user.tenantId) tenantIds.push(company.user.tenantId);
    sessions.push(company);

    const foreignCompany = await authService.register({
      fullName: 'Other Admin',
      email: `other-${suffix}@example.test`,
      password: 'hunter22',
      companyName: `Other Company ${suffix}`,
    });
    userIds.push(foreignCompany.user.id);
    if (foreignCompany.user.tenantId) tenantIds.push(foreignCompany.user.tenantId);
    sessions.push(foreignCompany);

    const personalLogin = await authService.login({
      email: personal.user.email,
      password: 'hunter22',
    });
    sessions.push(personalLogin);
    const companyLogin = await authService.login({
      email: company.user.email,
      password: 'hunter22',
    });
    sessions.push(companyLogin);
    expect(companyLogin.user.tenantName).toBe(companyName);

    const companyRefresh = await authService.refresh(companyLogin.refreshToken);
    sessions.push(companyRefresh);
    expect(companyRefresh.user.tenantName).toBe(companyName);

    const { withUserContext } = await import('../db/withUser');
    const ownUser = await withUserContext(company.user.id, (tx) =>
      tx.user.findUnique({ where: { id: company.user.id } }),
    );
    const foreignUser = await withUserContext(company.user.id, (tx) =>
      tx.user.findUnique({ where: { id: foreignCompany.user.id } }),
    );
    expect(ownUser?.id).toBe(company.user.id);
    expect(foreignUser).toBeNull();

    const exactEmailLookup = await runtimePrisma.$queryRaw<Array<{ id: string | null }>>`
      SELECT private.auth_user_id_by_email(${personal.user.email}) AS id
    `;
    expect(exactEmailLookup).toEqual([{ id: personal.user.id }]);
    const unknownEmailLookup = await runtimePrisma.$queryRaw<Array<{ id: string | null }>>`
      SELECT private.auth_user_id_by_email(${`missing-${suffix}@example.test`}) AS id
    `;
    expect(unknownEmailLookup).toEqual([{ id: null }]);

    const privileges = await adminPrisma.$queryRaw<
      Array<{
        result: string;
        publicExecute: boolean;
        anonExecute: boolean;
        authenticatedExecute: boolean;
        appExecute: boolean;
      }>
    >`
      SELECT pg_get_function_result(p.oid) AS result,
        COALESCE(bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE'), false) AS "publicExecute",
        COALESCE(bool_or(r.rolname = 'anon' AND a.privilege_type = 'EXECUTE'), false) AS "anonExecute",
        COALESCE(bool_or(r.rolname = 'authenticated' AND a.privilege_type = 'EXECUTE'), false) AS "authenticatedExecute",
        COALESCE(bool_or(r.rolname = 'taskflow_app' AND a.privilege_type = 'EXECUTE'), false) AS "appExecute"
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(p.proacl) a
      LEFT JOIN pg_roles r ON r.oid = a.grantee
      WHERE p.oid = 'private.auth_user_id_by_email(text)'::regprocedure
      GROUP BY p.oid
    `;
    expect(privileges).toEqual([
      {
        result: 'uuid',
        publicExecute: false,
        anonExecute: false,
        authenticatedExecute: false,
        appExecute: true,
      },
    ]);

    await expect(runtimePrisma.$queryRaw`SELECT id FROM public.users LIMIT 1`).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      runtimePrisma.$executeRaw`INSERT INTO public.users ("id") VALUES (${randomUUID()}::uuid)`,
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUserContext(company.user.id, (tx) =>
        tx.$queryRaw`SELECT private.auth_user_id_by_email(${company.user.email})`,
      ),
    ).rejects.toThrow(/permission denied/i);

    const leakedContext = await runtimePrisma.$queryRaw<Array<{ userId: string | null }>>`
      SELECT NULLIF(current_setting('app.user_id', true), '') AS "userId"
    `;
    expect(leakedContext[0]?.userId).toBeNull();

    const wrongPassword = await authService
      .login({ email: personal.user.email, password: 'wrong' })
      .catch((error: unknown) => error);
    const unknownEmail = await authService
      .login({ email: `missing-${suffix}@example.test`, password: 'hunter22' })
      .catch((error: unknown) => error);
    expect(wrongPassword).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(unknownEmail).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect((unknownEmail as Error).message).toBe((wrongPassword as Error).message);

    const rollbackCompany = `Rollback Company ${suffix}`;
    await expect(
      authService.register({
        fullName: 'Duplicate Email',
        email: personal.user.email,
        password: 'hunter22',
        companyName: rollbackCompany,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT_EMAIL' });
    expect(await adminPrisma.tenant.count({ where: { name: rollbackCompany } })).toBe(0);

    const duplicateCompanyEmail = `duplicate-company-${suffix}@example.test`;
    await expect(
      authService.register({
        fullName: 'Duplicate Company',
        email: duplicateCompanyEmail,
        password: 'hunter22',
        companyName,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT_SLUG' });
    expect(await adminPrisma.user.findUnique({ where: { email: duplicateCompanyEmail } })).toBeNull();
  });

  it('retries only bounded random display ID collisions', async () => {
    const suffix = randomUUID();
    const existing = await authService.register({
      fullName: 'Display Seed',
      email: `display-seed-${suffix}@example.test`,
      password: 'hunter22',
    });
    userIds.push(existing.user.id);
    sessions.push(existing);

    let availableDisplayId = generateDisplayIdActual();
    while (await adminPrisma.user.findUnique({ where: { displayId: availableDisplayId } })) {
      availableDisplayId = generateDisplayIdActual();
    }
    generateDisplayIdMock.mockReset();
    generateDisplayIdMock
      .mockReturnValueOnce(existing.user.displayId)
      .mockReturnValueOnce(availableDisplayId);
    const retried = await authService.register({
      fullName: 'Display Retry',
      email: `display-retry-${suffix}@example.test`,
      password: 'hunter22',
    });
    userIds.push(retried.user.id);
    sessions.push(retried);
    expect(retried.user.displayId).toBe(availableDisplayId);
    expect(generateDisplayIdMock).toHaveBeenCalledTimes(2);

    generateDisplayIdMock.mockReset().mockReturnValue(existing.user.displayId);
    await expect(
      authService.register({
        fullName: 'Display Exhausted',
        email: `display-exhausted-${suffix}@example.test`,
        password: 'hunter22',
      }),
    ).rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL' });
    expect(generateDisplayIdMock).toHaveBeenCalledTimes(5);
    expect(
      await adminPrisma.user.findUnique({
        where: { email: `display-exhausted-${suffix}@example.test` },
      }),
    ).toBeNull();
    generateDisplayIdMock.mockReset().mockImplementation(generateDisplayIdActual);
  });

  it('rotates tenantless personal refresh sessions through the restricted role', async () => {
    const suffix = randomUUID();
    const registered = await authService.register({
      fullName: 'Personal Refresh',
      email: `personal-refresh-${suffix}@example.test`,
      password: 'hunter22',
    });
    userIds.push(registered.user.id);
    sessions.push(registered);

    const login = await authService.login({
      email: registered.user.email,
      password: 'hunter22',
    });
    sessions.push(login);
    const rotated = await authService.refresh(login.refreshToken);
    sessions.push(rotated);

    expect(rotated.user.id).toBe(registered.user.id);
    expect(rotated.user.tenantId).toBeNull();
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    await expect(authService.refresh(login.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'TOKEN_REVOKED',
    });

    const next = await authService.refresh(rotated.refreshToken);
    sessions.push(next);
    expect(next.user.id).toBe(registered.user.id);
    expect(next.user.tenantId).toBeNull();
    expect(next.refreshToken).not.toBe(rotated.refreshToken);
  });
});
