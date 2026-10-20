import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';
import { guardedTestDatabaseUrl, resetFixtureRegistrationLimit } from './helpers/test-environment';

type Fixture = { id: string; email: string; tenantId: string; companyName: string };

async function removeFixture(client: Client, fixture: Fixture) {
  await client.query('BEGIN');
  try {
    const user = await client.query(
      'DELETE FROM users WHERE id = $1 AND email = $2 AND tenant_id = $3 RETURNING id',
      [fixture.id, fixture.email, fixture.tenantId],
    );
    if (user.rowCount !== 1) throw new Error('E2E fixture user ownership check failed');
    const tenant = await client.query(
      'DELETE FROM tenants WHERE id = $1 AND name = $2 RETURNING id',
      [fixture.tenantId, fixture.companyName],
    );
    if (tenant.rowCount !== 1) throw new Error('E2E fixture tenant ownership check failed');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function recoverFixture(client: Client, email: string, companyName: string) {
  const result = await client.query(
    `SELECT u.id, u.email, u.tenant_id AS "tenantId"
     FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE u.email = $1 AND t.name = $2`,
    [email, companyName],
  );
  if (result.rowCount === 0) return undefined;
  if (result.rowCount !== 1) throw new Error('E2E fixture recovery was ambiguous');
  const user = result.rows[0] as Omit<Fixture, 'companyName'>;
  if (
    user.email !== email ||
    !/^[0-9a-f-]{36}$/i.test(user.id) ||
    !/^[0-9a-f-]{36}$/i.test(user.tenantId)
  ) {
    throw new Error('E2E fixture recovery ownership check failed');
  }
  return { ...user, companyName };
}

async function logout(context: APIRequestContext, accessToken?: string) {
  await context.post('/api/v1/auth/logout', {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
  }).catch(() => undefined);
}

test('real user login, refresh persistence, and logout protect the dashboard', async ({ page }) => {
  await resetFixtureRegistrationLimit();
  const databaseUrl = guardedTestDatabaseUrl();
  const database = new Client({ connectionString: databaseUrl });
  await database.connect();

  const registration = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const suffix = crypto.randomUUID();
  const fixture = {
    email: `e2e-${suffix}@taskflow.invalid`,
    fullName: `E2E User ${suffix.slice(0, 8)}`,
    password: `E2E-${suffix}-Password!`,
    companyName: `E2E Company ${suffix}`,
  };
  let created: Fixture | undefined;
  let registrationToken: string | undefined;
  let browserToken: string | undefined;

  try {
    const registrationResponse = await registration.post('/api/v1/auth/register', { data: fixture });
    const registrationBody = await registrationResponse.json();
    if (typeof registrationBody.accessToken === 'string') {
      registrationToken = registrationBody.accessToken;
    }
    const registeredUser = registrationBody.user;
    if (
      typeof registeredUser?.id === 'string' &&
      /^[0-9a-f-]{36}$/i.test(registeredUser.id) &&
      registeredUser.email === fixture.email &&
      typeof registeredUser.tenantId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(registeredUser.tenantId)
    ) {
      created = {
        id: registeredUser.id,
        email: registeredUser.email,
        tenantId: registeredUser.tenantId,
        companyName: fixture.companyName,
      };
    }
    expect(registrationResponse.status()).toBe(201);
    expect(created).toBeTruthy();
    expect(registeredUser.email).toBe(fixture.email);
    expect(registeredUser.tenantId).toBeTruthy();

    await page.goto('/login');
    await page.locator('#email').fill(fixture.email);
    await page.locator('#password').fill(fixture.password);
    const loginResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/login'),
    );
    await page.locator('form button[type="submit"]').click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);
    const loginBody = await loginResponse.json();
    expect(loginBody.user.id).toBe(created.id);
    expect(loginBody.user.email).toBe(created.email);
    browserToken = loginBody.accessToken;

    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await page.getByRole('button', { name: /kullanıcı menüsünü aç|open user menu/i }).click();
    await expect(page.getByText(created.email, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    const refreshResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/refresh'),
    );
    await page.reload();
    const refreshResponse = await refreshResponsePromise;
    expect(refreshResponse.status()).toBe(200);
    const refreshBody = await refreshResponse.json();
    expect(refreshBody.user.id).toBe(created.id);
    expect(refreshBody.user.email).toBe(created.email);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    await page.getByRole('button', { name: /kullanıcı menüsünü aç|open user menu/i }).click();
    const logoutResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/logout'),
    );
    await page.getByRole('menuitem', { name: /oturumu kapat|log out|sign out/i }).click();
    expect((await logoutResponsePromise).status()).toBe(204);
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('link', { name: /giriş yap/i }).first()).toBeVisible();

    const revokedRefresh = await page.request.post('/api/v1/auth/refresh');
    expect(revokedRefresh.status()).toBe(204);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Bu sayfaya erişmek için giriş yapın' })).toBeVisible();
    await expect(page.getByTestId('dashboard-page')).toHaveCount(0);
  } finally {
    await logout(page.request, browserToken);
    await logout(registration, registrationToken);
    await registration.dispose();
    try {
      if (!created) created = await recoverFixture(database, fixture.email, fixture.companyName);
      if (created) await removeFixture(database, created);
    } finally {
      await database.end();
    }
  }
});
