import { expect, request as playwrightRequest, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { Client } from 'pg';
import { guardedTestDatabaseUrl, resetFixtureRegistrationLimit } from './helpers/test-environment';

const UUID = /^[0-9a-f-]{36}$/i;

type FixtureUser = { id: string; email: string; tenantId: string | null; displayId: string };
type FixtureTenant = { id: string; name: string };
type FixtureTeam = { id: string; tenantId: string; name: string };
type FixtureTask = { id: string; teamId: string; assignerId: string; title: string };

async function login(page: import('@playwright/test').Page, user: FixtureUser, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(password);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/auth/login'),
  );
  await page.locator('form button[type="submit"]').click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.user.id).toBe(user.id);
  expect(body.user.email).toBe(user.email);
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
  return body.accessToken as string;
}

async function logout(context: APIRequestContext, accessToken?: string) {
  await context.post('/api/v1/auth/logout', {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
  }).catch(() => undefined);
}

async function attachFixtureMember(
  client: Client,
  admin: FixtureUser,
  member: FixtureUser,
  tenant: FixtureTenant,
) {
  await client.query('BEGIN');
  try {
    const owner = await client.query(
      `SELECT t.id FROM tenants t JOIN users u ON u.tenant_id = t.id
       WHERE t.id = $1 AND t.name = $2 AND u.id = $3 AND u.email = $4 AND u.role = 'companyAdmin'`,
      [tenant.id, tenant.name, admin.id, admin.email],
    );
    if (owner.rowCount !== 1) throw new Error('E2E fixture tenant ownership check failed');
    const attached = await client.query(
      `UPDATE users SET tenant_id = $1
       WHERE id = $2 AND email = $3 AND tenant_id IS NULL AND role = 'member'
       RETURNING id, tenant_id AS "tenantId"`,
      [tenant.id, member.id, member.email],
    );
    if (attached.rowCount !== 1 || attached.rows[0].tenantId !== tenant.id) {
      throw new Error('E2E fixture member attachment ownership check failed');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function findUser(client: Client, email: string): Promise<FixtureUser | undefined> {
  const result = await client.query(
    'SELECT id, email, tenant_id AS "tenantId", display_id AS "displayId" FROM users WHERE email = $1',
    [email],
  );
  if (result.rowCount === 0) return undefined;
  if (result.rowCount !== 1) throw new Error('E2E fixture user recovery was ambiguous');
  const user = result.rows[0] as FixtureUser;
  if (
    !UUID.test(user.id) ||
    user.email !== email ||
    (user.tenantId !== null && !UUID.test(user.tenantId)) ||
    typeof user.displayId !== 'string'
  ) {
    throw new Error('E2E fixture user recovery ownership check failed');
  }
  return user;
}

async function removeFixture(
  client: Client,
  fixture: {
    adminEmail: string;
    memberEmail: string;
    companyName: string;
    teamName: string;
    taskTitle: string;
    admin?: FixtureUser;
    member?: FixtureUser;
    tenant?: FixtureTenant;
    team?: FixtureTeam;
    task?: FixtureTask;
  },
) {
  await client.query('BEGIN');
  try {
    const admin = fixture.admin ?? (await findUser(client, fixture.adminEmail));
    const member = fixture.member ?? (await findUser(client, fixture.memberEmail));
    const tenants = fixture.tenant
      ? { rows: [fixture.tenant], rowCount: 1 }
      : await client.query('SELECT id, name FROM tenants WHERE name = $1', [fixture.companyName]);
    if (tenants.rowCount !== 0 && tenants.rowCount !== 1) {
      throw new Error('E2E fixture tenant recovery was ambiguous');
    }
    const tenant = tenants.rows[0] as FixtureTenant | undefined;
    if (tenant && (!UUID.test(tenant.id) || tenant.name !== fixture.companyName)) {
      throw new Error('E2E fixture tenant recovery ownership check failed');
    }
    if (admin?.tenantId && admin.tenantId !== tenant?.id) {
      throw new Error('E2E admin belongs to an unexpected tenant');
    }
    if (member?.tenantId && member.tenantId !== tenant?.id) {
      throw new Error('E2E member belongs to an unexpected tenant');
    }

    let team = fixture.team;
    if (!team && tenant) {
      const teams = await client.query(
        'SELECT id, tenant_id AS "tenantId", name FROM teams WHERE tenant_id = $1 AND name = $2',
        [tenant.id, fixture.teamName],
      );
      if (teams.rowCount !== 0 && teams.rowCount !== 1) {
        throw new Error('E2E fixture team recovery was ambiguous');
      }
      team = teams.rows[0] as FixtureTeam | undefined;
    }
    if (team && (team.tenantId !== tenant?.id || team.name !== fixture.teamName || !UUID.test(team.id))) {
      throw new Error('E2E fixture team ownership check failed');
    }

    let task = fixture.task;
    if (!task && team && admin) {
      const tasks = await client.query(
        'SELECT id, team_id AS "teamId", assigner_id AS "assignerId", title FROM tasks WHERE team_id = $1 AND assigner_id = $2 AND title = $3',
        [team.id, admin.id, fixture.taskTitle],
      );
      if (tasks.rowCount !== 0 && tasks.rowCount !== 1) {
        throw new Error('E2E fixture task recovery was ambiguous');
      }
      task = tasks.rows[0] as FixtureTask | undefined;
    }
    if (task && (task.teamId !== team?.id || task.assignerId !== admin?.id || task.title !== fixture.taskTitle || !UUID.test(task.id))) {
      throw new Error('E2E fixture task ownership check failed');
    }

    if (tenant) {
      const tenantUsers = await client.query(
        'SELECT id, email FROM users WHERE tenant_id = $1',
        [tenant.id],
      );
      const ownedUsers = new Map(
        [admin, member].filter((user): user is FixtureUser => Boolean(user)).map((user) => [user.id, user.email]),
      );
      if (tenantUsers.rows.some((user) => ownedUsers.get(user.id) !== user.email)) {
        throw new Error('E2E tenant contains an unexpected user');
      }
      const deletedTenant = await client.query(
        'DELETE FROM tenants WHERE id = $1 AND name = $2 RETURNING id',
        [tenant.id, fixture.companyName],
      );
      if (deletedTenant.rowCount !== 1) throw new Error('E2E fixture tenant delete ownership check failed');

      const leftoverTeam = await client.query(
        'SELECT count(*) FROM teams WHERE tenant_id = $1 AND name = $2',
        [tenant.id, fixture.teamName],
      );
      if (leftoverTeam.rows[0].count !== '0') throw new Error('E2E fixture team remains after tenant deletion');
      if (task) {
        const leftoverTask = await client.query('SELECT count(*) FROM tasks WHERE id = $1', [task.id]);
        if (leftoverTask.rows[0].count !== '0') throw new Error('E2E fixture task remains after tenant deletion');
      }
    }

    for (const user of [admin, member]) {
      if (!user) continue;
      const deletedUser = await client.query(
        'DELETE FROM users WHERE id = $1 AND email = $2 AND tenant_id IS NULL RETURNING id',
        [user.id, user.email],
      );
      if (deletedUser.rowCount !== 1) throw new Error('E2E fixture user delete ownership check failed');
    }
    const remainingUsers = await client.query(
      'SELECT count(*) FROM users WHERE email = ANY($1::text[])',
      [[fixture.adminEmail, fixture.memberEmail]],
    );
    const remainingTenant = await client.query('SELECT count(*) FROM tenants WHERE name = $1', [fixture.companyName]);
    if (remainingUsers.rows[0].count !== '0' || remainingTenant.rows[0].count !== '0') {
      throw new Error('E2E fixture rows remain after cleanup');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

test('company admin assigns a task that its member can update', async ({ browser }) => {
  await resetFixtureRegistrationLimit();
  const database = new Client({ connectionString: guardedTestDatabaseUrl() });
  await database.connect();
  const suffix = crypto.randomUUID();
  const adminEmail = `e2e-admin-${suffix}@taskflow.invalid`;
  const memberEmail = `e2e-member-${suffix}@taskflow.invalid`;
  const companyName = `E2E Lifecycle Co ${suffix}`;
  const teamName = `E2E Team ${suffix}`;
  const taskTitle = `E2E lifecycle ${suffix}`;
  const password = `E2E-${suffix}-Password!`;
  let adminRegistration: APIRequestContext | undefined;
  let memberRegistration: APIRequestContext | undefined;
  let adminBrowser: BrowserContext | undefined;
  let memberBrowser: BrowserContext | undefined;
  let admin: FixtureUser | undefined;
  let member: FixtureUser | undefined;
  let tenant: FixtureTenant | undefined;
  let team: FixtureTeam | undefined;
  let task: FixtureTask | undefined;
  let adminRegistrationToken: string | undefined;
  let memberRegistrationToken: string | undefined;
  let adminBrowserToken: string | undefined;
  let memberBrowserToken: string | undefined;

  try {
    adminRegistration = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3001' });
    memberRegistration = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3001' });
    const adminResponse = await adminRegistration.post('/api/v1/auth/register', {
      data: { fullName: `E2E Admin ${suffix.slice(0, 8)}`, email: adminEmail, password, companyName },
    });
    const adminBody = await adminResponse.json();
    adminRegistrationToken = typeof adminBody.accessToken === 'string' ? adminBody.accessToken : undefined;
    if (adminBody.user?.id && UUID.test(adminBody.user.id) && adminBody.user.email === adminEmail && UUID.test(adminBody.user.tenantId)) {
      admin = { id: adminBody.user.id, email: adminEmail, tenantId: adminBody.user.tenantId, displayId: adminBody.user.displayId };
      tenant = { id: adminBody.user.tenantId, name: companyName };
    }
    expect(adminResponse.status()).toBe(201);
    expect(admin).toBeTruthy();

    const memberResponse = await memberRegistration.post('/api/v1/auth/register', {
      data: { fullName: `E2E Member ${suffix.slice(0, 8)}`, email: memberEmail, password },
    });
    const memberBody = await memberResponse.json();
    memberRegistrationToken = typeof memberBody.accessToken === 'string' ? memberBody.accessToken : undefined;
    if (memberBody.user?.id && UUID.test(memberBody.user.id) && memberBody.user.email === memberEmail && memberBody.user.tenantId === null && typeof memberBody.user.displayId === 'string') {
      member = { id: memberBody.user.id, email: memberEmail, tenantId: null, displayId: memberBody.user.displayId };
    }
    expect(memberResponse.status()).toBe(201);
    expect(member).toBeTruthy();
    await attachFixtureMember(database, admin, member, tenant);
    member = { ...member, tenantId: tenant.id };

    const teamResponse = await adminRegistration.post('/api/v1/teams', {
      headers: { authorization: `Bearer ${adminRegistrationToken}` },
      data: { name: teamName },
    });
    const teamBody = await teamResponse.json();
    if (teamBody.id && UUID.test(teamBody.id) && teamBody.tenantId === tenant?.id && teamBody.name === teamName) {
      team = { id: teamBody.id, tenantId: teamBody.tenantId, name: teamName };
    }
    expect(teamResponse.status()).toBe(201);
    expect(team).toBeTruthy();

    const addMemberResponse = await adminRegistration.post(`/api/v1/teams/${team.id}/members`, {
      headers: { authorization: `Bearer ${adminRegistrationToken}` },
      data: { displayId: member.displayId },
    });
    const addedMember = await addMemberResponse.json();
    expect(addMemberResponse.status()).toBe(201);
    expect(addedMember.userId).toBe(member.id);
    expect(addedMember.displayId).toBe(member.displayId);
    expect(addedMember.role).toBe('member');

    adminBrowser = await browser.newContext();
    memberBrowser = await browser.newContext();
    const adminPage = await adminBrowser.newPage();
    const memberPage = await memberBrowser.newPage();
    adminBrowserToken = await login(adminPage, admin, password);

    await adminPage.getByTestId(`team-tab-${team.id}`).click();
    await adminPage.getByTestId('add-task-button').click();
    const dialog = adminPage.getByTestId('create-task-dialog');
    await dialog.locator('input[type="text"]').fill(taskTitle);
    await dialog.locator('input[type="date"]').fill(new Date().toISOString().slice(0, 10));
    await dialog.getByTestId('assignee-picker-trigger').click();
    await adminPage.getByTestId(`assignee-option-${member.id}`).click();
    await expect(dialog.getByTestId(`assignee-chip-${member.id}`)).toBeVisible();
    const createTaskResponsePromise = adminPage.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().endsWith('/api/v1/tasks'),
    );
    await dialog.locator('button[type="submit"]').click();
    const createTaskResponse = await createTaskResponsePromise;
    const taskBody = await createTaskResponse.json();
    if (taskBody.id && UUID.test(taskBody.id) && taskBody.title === taskTitle && taskBody.teamId === team.id && taskBody.assignerId === admin.id) {
      task = { id: taskBody.id, title: taskTitle, teamId: team.id, assignerId: admin.id };
    }
    expect(createTaskResponse.status()).toBe(201);
    expect(task).toBeTruthy();
    expect(taskBody.assignees.map((assignee: { userId: string }) => assignee.userId)).toContain(member.id);
    memberBrowserToken = await login(memberPage, member, password);
    await expect(memberPage.getByTestId(`task-card-${task.id}`)).toBeVisible();
    await expect(memberPage.getByTestId('add-task-button')).toHaveCount(0);
    await memberPage.goto(`/tasks/${task.id}`);
    await expect(memberPage.getByRole('heading', { name: taskTitle, exact: true, level: 1 })).toBeVisible();
    const statusResponsePromise = memberPage.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().endsWith(`/api/v1/tasks/${task.id}/status/propose`),
    );
    await memberPage.getByRole('button', { name: /status:|durum:/i }).click();
    await memberPage.getByRole('menuitem', { name: /in progress|yapılıyor/i }).click();
    const statusResponse = await statusResponsePromise;
    expect(statusResponse.status()).toBe(200);
    expect((await statusResponse.json()).status).toBe('in_progress');

    await adminPage.goto(`/tasks/${task.id}`);
    await expect(
      adminPage.getByRole('heading', { name: taskTitle, exact: true, level: 1 }),
    ).toBeVisible();
    await adminPage.reload();
    await expect(adminPage.getByRole('heading', { name: taskTitle, exact: true, level: 1 })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /status:.*in progress|durum:.*yapılıyor/i })).toBeVisible();
  } finally {
    if (adminBrowser) await logout(adminBrowser.request, adminBrowserToken);
    if (memberBrowser) await logout(memberBrowser.request, memberBrowserToken);
    if (adminRegistration) await logout(adminRegistration, adminRegistrationToken);
    if (memberRegistration) await logout(memberRegistration, memberRegistrationToken);
    await adminBrowser?.close();
    await memberBrowser?.close();
    await adminRegistration?.dispose();
    await memberRegistration?.dispose();
    try {
      await removeFixture(database, {
        adminEmail,
        memberEmail,
        companyName,
        teamName,
        taskTitle,
        admin,
        member,
        tenant,
        team,
        task,
      });
    } finally {
      await database.end();
    }
  }
});
