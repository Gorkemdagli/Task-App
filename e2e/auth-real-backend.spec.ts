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
  const registrationB = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const suffix = crypto.randomUUID();
  const suffixB = crypto.randomUUID();
  const fixture = {
    email: `e2e-${suffix}@taskflow.invalid`,
    fullName: `E2E User ${suffix.slice(0, 8)}`,
    password: `E2E-${suffix}-Password!`,
    companyName: `E2E Company ${suffix}`,
  };
  const fixtureB = {
    email: `e2e-${suffixB}@taskflow.invalid`,
    fullName: `E2E User ${suffixB.slice(0, 8)}`,
    password: `E2E-${suffixB}-Password!`,
    companyName: `E2E Company ${suffixB}`,
  };
  let created: Fixture | undefined;
  let createdB: Fixture | undefined;
  let registrationToken: string | undefined;
  let registrationTokenB: string | undefined;
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

    const registrationResponseB = await registrationB.post('/api/v1/auth/register', { data: fixtureB });
    const registrationBodyB = await registrationResponseB.json();
    if (typeof registrationBodyB.accessToken === 'string') {
      registrationTokenB = registrationBodyB.accessToken;
    }
    const registeredUserB = registrationBodyB.user;
    if (
      typeof registeredUserB?.id === 'string' &&
      /^[0-9a-f-]{36}$/i.test(registeredUserB.id) &&
      registeredUserB.email === fixtureB.email &&
      typeof registeredUserB.tenantId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(registeredUserB.tenantId)
    ) {
      createdB = {
        id: registeredUserB.id,
        email: registeredUserB.email,
        tenantId: registeredUserB.tenantId,
        companyName: fixtureB.companyName,
      };
    }
    expect(registrationResponseB.status()).toBe(201);
    expect(createdB).toBeTruthy();
    expect(registeredUserB.email).toBe(fixtureB.email);
    expect(registeredUserB.tenantId).toBeTruthy();

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

    let releaseRefresh!: () => void;
    let markRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => { markRefreshStarted = resolve; });
    const refreshRelease = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const queuedLoginRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/auth/login')) queuedLoginRequests.push(request.url());
    });
    await page.route('**/api/v1/auth/refresh', async (route) => {
      const response = await route.fetch();
      markRefreshStarted();
      await refreshRelease;
      await route.fulfill({ response });
    });
    await page.goto('/login');
    await refreshStarted;
    await page.locator('#email').fill(fixtureB.email);
    await page.locator('#password').fill(fixtureB.password);
    const secondLoginResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/login'),
    );
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    expect(queuedLoginRequests).toHaveLength(0);

    releaseRefresh();
    const secondLoginResponse = await secondLoginResponsePromise;
    expect(secondLoginResponse.status()).toBe(200);
    const secondLoginBody = await secondLoginResponse.json();
    expect(secondLoginBody.user.id).toBe(createdB.id);
    expect(secondLoginBody.user.email).toBe(createdB.email);
    browserToken = secondLoginBody.accessToken;
    expect(queuedLoginRequests).toHaveLength(1);
    await page.unroute('**/api/v1/auth/refresh');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    const refreshResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/refresh'),
    );
    await page.reload();
    const refreshResponse = await refreshResponsePromise;
    expect(refreshResponse.status()).toBe(200);
    const refreshBody = await refreshResponse.json();
    expect(refreshBody.user.id).toBe(createdB.id);
    expect(refreshBody.user.email).toBe(createdB.email);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    await page.getByRole('button', { name: /kullanıcı menüsünü aç|open user menu/i }).click();
    await expect(page.getByText(createdB.email, { exact: true })).toBeVisible();
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
    await logout(registrationB, registrationTokenB);
    await Promise.all([registration.dispose(), registrationB.dispose()]);
    try {
      if (!created) created = await recoverFixture(database, fixture.email, fixture.companyName);
      if (created) await removeFixture(database, created);
      if (!createdB) createdB = await recoverFixture(database, fixtureB.email, fixtureB.companyName);
      if (createdB) await removeFixture(database, createdB);
    } finally {
      await database.end();
    }
  }
});

test('real refresh timeout releases a queued login without restoring the old cookie', async ({ page }) => {
  await resetFixtureRegistrationLimit();
  const database = new Client({ connectionString: guardedTestDatabaseUrl() });
  await database.connect();
  const registrationA = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const registrationB = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const createFixture = async (context: APIRequestContext) => {
    const suffix = crypto.randomUUID();
    const fixture = {
      email: `e2e-${suffix}@taskflow.invalid`,
      fullName: `E2E User ${suffix.slice(0, 8)}`,
      password: `E2E-${suffix}-Password!`,
      companyName: `E2E Company ${suffix}`,
    };
    const response = await context.post('/api/v1/auth/register', { data: fixture });
    const body = await response.json();
    const user = body.user;
    const created =
      typeof user?.id === 'string' &&
      /^[0-9a-f-]{36}$/i.test(user.id) &&
      user.email === fixture.email &&
      typeof user.tenantId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(user.tenantId)
        ? {
            id: user.id as string,
            email: user.email as string,
            tenantId: user.tenantId as string,
            companyName: fixture.companyName,
          }
        : undefined;
    return { fixture, response, created, token: body.accessToken as string | undefined };
  };
  let accountA: Awaited<ReturnType<typeof createFixture>> | undefined;
  let accountB: Awaited<ReturnType<typeof createFixture>> | undefined;
  let browserToken: string | undefined;

  try {
    accountA = await createFixture(registrationA);
    accountB = await createFixture(registrationB);
    expect(accountA.response.status()).toBe(201);
    expect(accountA.created).toBeTruthy();
    expect(accountB.response.status()).toBe(201);
    expect(accountB.created).toBeTruthy();

    await page.goto('/login');
    await page.locator('#email').fill(accountA.fixture.email);
    await page.locator('#password').fill(accountA.fixture.password);
    const accountALogin = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/login'),
    );
    await page.locator('form button[type="submit"]').click();
    const accountALoginResponse = await accountALogin;
    const accountALoginBody = await accountALoginResponse.json();
    browserToken = accountALoginBody.accessToken;
    expect(accountALoginBody.user.email).toBe(accountA.created?.email);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    let releaseRefresh!: () => void;
    let markRefreshStarted!: () => void;
    let markRefreshFinished!: () => void;
    let lateRefreshFulfilled = false;
    let lateRefreshFulfillError: unknown;
    const refreshStarted = new Promise<void>((resolve) => { markRefreshStarted = resolve; });
    const refreshRelease = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const refreshFinished = new Promise<void>((resolve) => { markRefreshFinished = resolve; });
    const loginRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/auth/login')) loginRequests.push(request.url());
    });
    await page.route('**/api/v1/auth/refresh', async (route) => {
      const response = await route.fetch();
      markRefreshStarted();
      await refreshRelease;
      try {
        await route.fulfill({ response });
        lateRefreshFulfilled = true;
      } catch (error) {
        lateRefreshFulfillError = error;
      } finally {
        markRefreshFinished();
      }
    });

    await page.goto('/login');
    await refreshStarted;
    await page.locator('#email').fill(accountB.fixture.email);
    await page.locator('#password').fill(accountB.fixture.password);
    const accountBLoginRequest = page.waitForRequest((request) =>
      request.url().endsWith('/api/v1/auth/login'),
    );
    const accountBLogin = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/login'),
    );
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    expect(loginRequests).toHaveLength(0);

    await accountBLoginRequest;
    releaseRefresh();
    await refreshFinished;
    const loginResponse = await accountBLogin;
    expect(loginResponse.status()).toBe(200);
    const loginBody = await loginResponse.json();
    expect(loginBody.user.id).toBe(accountB.created?.id);
    expect(loginBody.user.email).toBe(accountB.created?.email);
    browserToken = loginBody.accessToken;
    expect(loginRequests).toHaveLength(1);
    expect(lateRefreshFulfilled || lateRefreshFulfillError).toBeTruthy();
    if (lateRefreshFulfillError) {
      expect(String(lateRefreshFulfillError)).toMatch(/closed|aborted|handled/i);
    }
    await page.unroute('**/api/v1/auth/refresh');

    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    const refreshResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/refresh'),
    );
    await page.reload();
    const refreshed = await refreshResponse;
    expect(refreshed.status()).toBe(200);
    const refreshedBody = await refreshed.json();
    expect(refreshedBody.user.id).toBe(accountB.created?.id);
    expect(refreshedBody.user.email).toBe(accountB.created?.email);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  } finally {
    await logout(page.request, browserToken);
    await logout(registrationA, accountA?.token);
    await logout(registrationB, accountB?.token);
    await Promise.all([registrationA.dispose(), registrationB.dispose()]);
    try {
      if (accountA && !accountA.created) {
        accountA.created = await recoverFixture(
          database,
          accountA.fixture.email,
          accountA.fixture.companyName,
        );
      }
      if (accountA?.created) await removeFixture(database, accountA.created);
      if (accountB && !accountB.created) {
        accountB.created = await recoverFixture(
          database,
          accountB.fixture.email,
          accountB.fixture.companyName,
        );
      }
      if (accountB?.created) await removeFixture(database, accountB.created);
    } finally {
      await database.end();
    }
  }
});
