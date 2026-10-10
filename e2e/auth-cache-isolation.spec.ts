import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { Client } from 'pg';
import { guardedTestDatabaseUrl, resetFixtureRegistrationLimit } from './helpers/test-environment';

const API_BASE = 'http://127.0.0.1:3001';
const UUID = /^[0-9a-f-]{36}$/i;

type FixtureUser = { id: string; email: string; tenantId: string | null; displayId: string };

async function login(page: Page, user: FixtureUser, password: string): Promise<string> {
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(password);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/auth/login'),
  );
  await page.locator('form button[type="submit"]').click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.user).toMatchObject({ id: user.id, email: user.email, tenantId: user.tenantId });
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
  return body.accessToken as string;
}

async function logout(context: APIRequestContext, token?: string) {
  await context.post(`${API_BASE}/api/v1/auth/logout`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
}

test('late task edit from a prior session cannot restore data after same-tenant denial', async ({
  browser,
}) => {
  await resetFixtureRegistrationLimit();
  const database = new Client({ connectionString: guardedTestDatabaseUrl() });
  await database.connect();
  const registration = await playwrightRequest.newContext({ baseURL: API_BASE });
  const suffix = crypto.randomUUID();
  const adminEmail = `e2e-cache-admin-${suffix}@taskflow.invalid`;
  const memberEmail = `e2e-cache-member-${suffix}@taskflow.invalid`;
  const assigneeEmail = `e2e-cache-assignee-${suffix}@taskflow.invalid`;
  const companyName = `E2E Cache Co ${suffix}`;
  const teamName = `E2E Cache Team ${suffix}`;
  const taskTitle = `E2E private cache ${suffix}`;
  const password = `E2E-${suffix}-Password!`;
  let admin: FixtureUser | undefined;
  let member: FixtureUser | undefined;
  let assignee: FixtureUser | undefined;
  let tenantId: string | undefined;
  let adminBrowser: BrowserContext | undefined;
  let adminToken: string | undefined;
  let memberToken: string | undefined;
  let adminRegistrationToken: string | undefined;
  let memberRegistrationToken: string | undefined;
  let assigneeRegistrationToken: string | undefined;
  let releaseMutation!: () => void;

  try {
    const adminResponse = await registration.post('/api/v1/auth/register', {
      data: { fullName: `Cache Admin ${suffix.slice(0, 8)}`, email: adminEmail, password, companyName },
    });
    const adminBody = await adminResponse.json();
    adminRegistrationToken = typeof adminBody.accessToken === 'string' ? adminBody.accessToken : undefined;
    expect(adminResponse.status()).toBe(201);
    expect(UUID.test(adminBody.user?.id)).toBe(true);
    expect(UUID.test(adminBody.user?.tenantId)).toBe(true);
    admin = {
      id: adminBody.user.id,
      email: adminEmail,
      tenantId: adminBody.user.tenantId,
      displayId: adminBody.user.displayId,
    };
    tenantId = admin.tenantId ?? undefined;

    const memberResponse = await registration.post('/api/v1/auth/register', {
      data: { fullName: `Cache Member ${suffix.slice(0, 8)}`, email: memberEmail, password },
    });
    const memberBody = await memberResponse.json();
    memberRegistrationToken = typeof memberBody.accessToken === 'string' ? memberBody.accessToken : undefined;
    expect(memberResponse.status()).toBe(201);
    expect(memberBody.user?.tenantId).toBeNull();
    member = {
      id: memberBody.user.id,
      email: memberEmail,
      tenantId: null,
      displayId: memberBody.user.displayId,
    };

    const attached = await database.query(
      `UPDATE users SET tenant_id = $1
       WHERE id = $2 AND email = $3 AND tenant_id IS NULL AND role = 'member'
       RETURNING id, tenant_id AS "tenantId"`,
      [tenantId, member.id, member.email],
    );
    expect(attached.rowCount).toBe(1);
    expect(attached.rows[0].tenantId).toBe(tenantId);
    member = { ...member, tenantId };

    const assigneeResponse = await registration.post('/api/v1/auth/register', {
      data: { fullName: `Cache Assignee ${suffix.slice(0, 8)}`, email: assigneeEmail, password },
    });
    const assigneeBody = await assigneeResponse.json();
    assigneeRegistrationToken = typeof assigneeBody.accessToken === 'string' ? assigneeBody.accessToken : undefined;
    expect(assigneeResponse.status()).toBe(201);
    assignee = {
      id: assigneeBody.user.id,
      email: assigneeEmail,
      tenantId: null,
      displayId: assigneeBody.user.displayId,
    };
    const attachedAssignee = await database.query(
      `UPDATE users SET tenant_id = $1
       WHERE id = $2 AND email = $3 AND tenant_id IS NULL AND role = 'member'
       RETURNING id, tenant_id AS "tenantId"`,
      [tenantId, assignee.id, assignee.email],
    );
    expect(attachedAssignee.rowCount).toBe(1);
    assignee = { ...assignee, tenantId };

    const teamResponse = await registration.post('/api/v1/teams', {
      headers: { authorization: `Bearer ${adminBody.accessToken}` },
      data: { name: teamName },
    });
    const team = await teamResponse.json();
    expect(teamResponse.status()).toBe(201);
    expect(team.tenantId).toBe(tenantId);

    const addAssignee = await registration.post(`/api/v1/teams/${team.id}/members`, {
      headers: { authorization: `Bearer ${adminBody.accessToken}` },
      data: { displayId: assignee.displayId },
    });
    expect(addAssignee.status()).toBe(201);

    const taskResponse = await registration.post('/api/v1/tasks', {
      headers: { authorization: `Bearer ${adminBody.accessToken}` },
      data: {
        title: taskTitle,
        deadline: new Date().toISOString().slice(0, 10),
        priority: 'medium',
        assigneeIds: [assignee.id],
        teamId: team.id,
      },
    });
    const task = await taskResponse.json();
    expect(taskResponse.status()).toBe(201);
    expect(task).toMatchObject({ title: taskTitle, teamId: team.id, assignerId: admin.id });
    expect(UUID.test(task.id)).toBe(true);

    adminBrowser = await browser.newContext();
    const adminPage = await adminBrowser.newPage();
    await adminPage.goto('/login');
    adminToken = await login(adminPage, admin, password);
    await adminPage.goto(`/tasks/${task.id}`);
    await expect(adminPage.getByRole('heading', { level: 1, name: taskTitle, exact: true })).toBeVisible();

    let sawMutation!: () => void;
    const mutationStarted = new Promise<void>((resolve) => { sawMutation = resolve; });
    const mutationBarrier = new Promise<void>((resolve) => { releaseMutation = resolve; });
    let mutationAttempts = 0;
    const realmMarker = await adminPage.evaluate(() => {
      const testWindow = window as Window & { __taskflowAuthCacheRealm?: string };
      testWindow.__taskflowAuthCacheRealm = crypto.randomUUID();
      return testWindow.__taskflowAuthCacheRealm;
    });
    await adminPage.route(`**/api/v1/tasks/${task.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      mutationAttempts += 1;
      if (mutationAttempts === 1) {
        sawMutation();
        await mutationBarrier;
      }
      const response = await route.fetch();
      await route.fulfill({ response });
    });

    await adminPage.getByRole('button', { name: 'Düzenle' }).click();
    await adminPage.getByLabel('Başlık', { exact: true }).fill('Optimistic private title');
    await adminPage.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Optimistic private title' })).toBeVisible();
    await mutationStarted;

    await adminPage.getByRole('button', { name: /Kullanıcı menüsünü aç|open user menu/i }).click();
    await adminPage.getByRole('menuitem', { name: /Oturumu Kapat|log out/i }).click();
    await expect(adminPage.locator('#email')).toBeVisible();
    memberToken = await login(adminPage, member, password);
    await adminPage.evaluate((path) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/tasks/${task.id}`);
    expect(
      await adminPage.evaluate(
        () => (window as Window & { __taskflowAuthCacheRealm?: string }).__taskflowAuthCacheRealm,
      ),
    ).toBe(realmMarker);
    const deniedResponsePromise = adminPage.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().endsWith(`/api/v1/tasks/${task.id}`),
    );
    const deniedResponse = await deniedResponsePromise;
    expect(deniedResponse.status()).toBe(403);
    await expect(adminPage.getByText(taskTitle, { exact: true })).toHaveCount(0);

    const terminalRetryPromise = adminPage.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().endsWith(`/api/v1/tasks/${task.id}`) &&
        mutationAttempts >= 2,
    );
    releaseMutation();
    const terminalRetry = await terminalRetryPromise;
    await terminalRetry.finished();
    expect(mutationAttempts).toBe(2);
    expect(terminalRetry.status()).toBe(403);
    await adminPage.evaluate(
      () => new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve))),
    );
    expect(
      await adminPage.evaluate(
        () => (window as Window & { __taskflowAuthCacheRealm?: string }).__taskflowAuthCacheRealm,
      ),
    ).toBe(realmMarker);
    await expect(adminPage.getByText(taskTitle, { exact: true })).toHaveCount(0);
    await expect(adminPage.getByText('Optimistic private title', { exact: true })).toHaveCount(0);
  } finally {
    releaseMutation?.();
    if (adminBrowser) await logout(adminBrowser.request, adminToken);
    await logout(registration, adminRegistrationToken);
    await logout(registration, memberRegistrationToken);
    await logout(registration, assigneeRegistrationToken);
    await adminBrowser?.close();
    await registration.dispose();
    try {
      await database.query('BEGIN');
      if (tenantId && admin) {
        const owner = await database.query(
          `SELECT id FROM tenants WHERE id = $1 AND name = $2`,
          [tenantId, companyName],
        );
        const ownerUser = await database.query(
          `SELECT id FROM users WHERE id = $1 AND email = $2 AND tenant_id = $3 AND role = 'companyAdmin'`,
          [admin.id, admin.email, tenantId],
        );
        if (owner.rowCount === 1 && ownerUser.rowCount === 1) {
          await database.query('DELETE FROM tenants WHERE id = $1 AND name = $2', [tenantId, companyName]);
        }
      }
      for (const user of [admin, member, assignee]) {
        if (!user) continue;
        await database.query(
          'DELETE FROM users WHERE id = $1 AND email = $2 AND tenant_id IS NULL',
          [user.id, user.email],
        );
      }
      await database.query('COMMIT');
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    } finally {
      await database.end();
    }
  }
});
