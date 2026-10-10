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

const UUID = /^[0-9a-f-]{36}$/i;
const API_BASE = 'http://127.0.0.1:3001';

type FixtureUser = {
  id: string;
  email: string;
  tenantId: string | null;
  displayId: string;
  role: 'companyAdmin' | 'member';
};
type FixtureTenant = { id: string; name: string };
type FixtureInvitation = {
  id: string;
  tenantId: string;
  recipientUserId: string;
  invitedByUserId: string;
  companyName: string;
};
type FixtureTeam = { id: string; tenantId: string; name: string };
type FixtureTask = { id: string; teamId: string; assignerId: string; title: string };

function readUser(value: any, email: string, role: FixtureUser['role']): FixtureUser | undefined {
  const user = value?.user;
  if (
    typeof user?.id !== 'string' ||
    !UUID.test(user.id) ||
    user.email !== email ||
    typeof user.displayId !== 'string' ||
    user.role !== role ||
    (user.tenantId !== null && (typeof user.tenantId !== 'string' || !UUID.test(user.tenantId)))
  ) {
    return undefined;
  }
  return {
    id: user.id,
    email,
    tenantId: user.tenantId,
    displayId: user.displayId,
    role,
  };
}

async function login(page: Page, user: FixtureUser, password: string) {
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
  return { accessToken: body.accessToken as string, user: body.user };
}

async function logout(context: APIRequestContext, accessToken?: string) {
  await context
    .post('/api/v1/auth/logout', {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
    })
    .catch(() => undefined);
}

async function findUser(client: Client, email: string): Promise<FixtureUser | undefined> {
  const result = await client.query(
    'SELECT id, email, tenant_id AS "tenantId", display_id AS "displayId", role FROM users WHERE email = $1',
    [email],
  );
  if (result.rowCount === 0) return undefined;
  if (result.rowCount !== 1) throw new Error('E2E fixture user recovery was ambiguous');
  const user = result.rows[0] as FixtureUser;
  if (
    !UUID.test(user.id) ||
    user.email !== email ||
    typeof user.displayId !== 'string' ||
    !['companyAdmin', 'member'].includes(user.role) ||
    (user.tenantId !== null && !UUID.test(user.tenantId))
  ) {
    throw new Error('E2E fixture user recovery ownership check failed');
  }
  return user;
}

async function removeFixture(
  client: Client,
  fixture: {
    adminEmail: string;
    inviteeEmail: string;
    companyName: string;
    teamName: string;
    taskTitle: string;
    admin?: FixtureUser;
    invitee?: FixtureUser;
    tenant?: FixtureTenant;
    invitation?: FixtureInvitation;
    team?: FixtureTeam;
    task?: FixtureTask;
  },
) {
  await client.query('BEGIN');
  try {
    const admin = fixture.admin ?? (await findUser(client, fixture.adminEmail));
    const invitee = fixture.invitee ?? (await findUser(client, fixture.inviteeEmail));
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
    if (admin && (admin.role !== 'companyAdmin' || admin.tenantId !== tenant?.id)) {
      throw new Error('E2E fixture admin ownership check failed');
    }
    if (
      invitee &&
      (invitee.role !== 'member' || (invitee.tenantId !== null && invitee.tenantId !== tenant?.id))
    ) {
      throw new Error('E2E invitee belongs to an unexpected tenant');
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
    if (
      team &&
      (team.tenantId !== tenant?.id || team.name !== fixture.teamName || !UUID.test(team.id))
    ) {
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
    if (
      task &&
      (task.teamId !== team?.id ||
        task.assignerId !== admin?.id ||
        task.title !== fixture.taskTitle ||
        !UUID.test(task.id))
    ) {
      throw new Error('E2E fixture task ownership check failed');
    }

    let invitation = fixture.invitation;
    if (!invitation && tenant && admin && invitee) {
      const invitations = await client.query(
        `SELECT id, tenant_id AS "tenantId", recipient_user_id AS "recipientUserId",
                invited_by_user_id AS "invitedByUserId", company_name AS "companyName"
         FROM company_invitations
         WHERE tenant_id = $1 AND recipient_user_id = $2 AND invited_by_user_id = $3 AND company_name = $4`,
        [tenant.id, invitee.id, admin.id, fixture.companyName],
      );
      if (invitations.rowCount !== 0 && invitations.rowCount !== 1) {
        throw new Error('E2E fixture invitation recovery was ambiguous');
      }
      invitation = invitations.rows[0] as FixtureInvitation | undefined;
    }
    if (
      invitation &&
      (invitation.tenantId !== tenant?.id ||
        invitation.recipientUserId !== invitee?.id ||
        invitation.invitedByUserId !== admin?.id ||
        invitation.companyName !== fixture.companyName ||
        !UUID.test(invitation.id))
    ) {
      throw new Error('E2E fixture invitation ownership check failed');
    }

    if (tenant) {
      const tenantUsers = await client.query('SELECT id, email FROM users WHERE tenant_id = $1', [
        tenant.id,
      ]);
      const ownedUsers = new Map(
        [admin, invitee]
          .filter((user): user is FixtureUser => Boolean(user))
          .map((user) => [user.id, user.email]),
      );
      if (tenantUsers.rows.some((user) => ownedUsers.get(user.id) !== user.email)) {
        throw new Error('E2E tenant contains an unexpected user');
      }
      const tenantInvitations = await client.query(
        `SELECT recipient_user_id AS "recipientUserId", invited_by_user_id AS "invitedByUserId",
                company_name AS "companyName"
         FROM company_invitations WHERE tenant_id = $1`,
        [tenant.id],
      );
      if (
        tenantInvitations.rows.some(
          (row) =>
            row.recipientUserId !== invitee?.id ||
            row.invitedByUserId !== admin?.id ||
            row.companyName !== fixture.companyName,
        )
      ) {
        throw new Error('E2E tenant contains an unexpected invitation');
      }
      const deletedTenant = await client.query(
        'DELETE FROM tenants WHERE id = $1 AND name = $2 RETURNING id',
        [tenant.id, fixture.companyName],
      );
      if (deletedTenant.rowCount !== 1)
        throw new Error('E2E fixture tenant delete ownership check failed');

      const remainingInvitations = await client.query(
        'SELECT count(*) FROM company_invitations WHERE tenant_id = $1',
        [tenant.id],
      );
      const remainingTeam = await client.query(
        'SELECT count(*) FROM teams WHERE tenant_id = $1 AND name = $2',
        [tenant.id, fixture.teamName],
      );
      if (remainingInvitations.rows[0].count !== '0' || remainingTeam.rows[0].count !== '0') {
        throw new Error('E2E invitation or team remains after tenant deletion');
      }
      if (task) {
        const remainingTask = await client.query('SELECT count(*) FROM tasks WHERE id = $1', [
          task.id,
        ]);
        if (remainingTask.rows[0].count !== '0')
          throw new Error('E2E fixture task remains after tenant deletion');
      }
    }

    for (const user of [admin, invitee]) {
      if (!user) continue;
      const deletedUser = await client.query(
        'DELETE FROM users WHERE id = $1 AND email = $2 AND role = $3 AND tenant_id IS NULL RETURNING id',
        [user.id, user.email, user.role],
      );
      if (deletedUser.rowCount !== 1)
        throw new Error('E2E fixture user delete ownership check failed');
    }
    const userIds = [admin?.id, invitee?.id].filter((id): id is string => Boolean(id));
    const remainingUsers = await client.query(
      'SELECT count(*) FROM users WHERE email = ANY($1::text[])',
      [[fixture.adminEmail, fixture.inviteeEmail]],
    );
    const remainingTenant = await client.query('SELECT count(*) FROM tenants WHERE name = $1', [
      fixture.companyName,
    ]);
    if (remainingUsers.rows[0].count !== '0' || remainingTenant.rows[0].count !== '0') {
      throw new Error('E2E fixture user or tenant remains after cleanup');
    }
    if (userIds.length) {
      const remainingNotifications = await client.query(
        'SELECT count(*) FROM notifications WHERE user_id = ANY($1::uuid[])',
        [userIds],
      );
      if (remainingNotifications.rows[0].count !== '0') {
        throw new Error('E2E fixture notifications remain after user deletion');
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

test('invitee accepts a company invitation and accesses an assigned team task', async ({
  browser,
}) => {
  await resetFixtureRegistrationLimit();
  const database = new Client({ connectionString: guardedTestDatabaseUrl() });
  await database.connect();
  const suffix = crypto.randomUUID();
  const adminEmail = `e2e-inviter-${suffix}@taskflow.invalid`;
  const inviteeEmail = `e2e-invitee-${suffix}@taskflow.invalid`;
  const companyName = `E2E Invitation Co ${suffix}`;
  const teamName = `E2E Invite Team ${suffix}`;
  const taskTitle = `E2E invited task ${suffix}`;
  const password = `E2E-${suffix}-Password!`;
  let adminRegistration: APIRequestContext | undefined;
  let inviteeRegistration: APIRequestContext | undefined;
  let adminBrowser: BrowserContext | undefined;
  let inviteeBrowser: BrowserContext | undefined;
  let admin: FixtureUser | undefined;
  let invitee: FixtureUser | undefined;
  let tenant: FixtureTenant | undefined;
  let invitation: FixtureInvitation | undefined;
  let team: FixtureTeam | undefined;
  let task: FixtureTask | undefined;
  let adminRegistrationToken: string | undefined;
  let inviteeRegistrationToken: string | undefined;
  let adminBrowserToken: string | undefined;
  let inviteeBrowserToken: string | undefined;

  try {
    adminRegistration = await playwrightRequest.newContext({ baseURL: API_BASE });
    inviteeRegistration = await playwrightRequest.newContext({ baseURL: API_BASE });
    const adminResponse = await adminRegistration.post('/api/v1/auth/register', {
      data: {
        fullName: `E2E Inviter ${suffix.slice(0, 8)}`,
        email: adminEmail,
        password,
        companyName,
      },
    });
    const adminBody = await adminResponse.json();
    adminRegistrationToken =
      typeof adminBody.accessToken === 'string' ? adminBody.accessToken : undefined;
    admin = readUser(adminBody, adminEmail, 'companyAdmin');
    if (admin?.tenantId) tenant = { id: admin.tenantId, name: companyName };
    expect(adminResponse.status()).toBe(201);
    expect(admin).toBeTruthy();
    expect(admin?.tenantId).toBeTruthy();

    const inviteeResponse = await inviteeRegistration.post('/api/v1/auth/register', {
      data: { fullName: `E2E Invitee ${suffix.slice(0, 8)}`, email: inviteeEmail, password },
    });
    const inviteeBody = await inviteeResponse.json();
    inviteeRegistrationToken =
      typeof inviteeBody.accessToken === 'string' ? inviteeBody.accessToken : undefined;
    invitee = readUser(inviteeBody, inviteeEmail, 'member');
    expect(inviteeResponse.status()).toBe(201);
    expect(invitee).toBeTruthy();
    expect(invitee?.tenantId).toBeNull();

    adminBrowser = await browser.newContext();
    inviteeBrowser = await browser.newContext();
    const adminPage = await adminBrowser.newPage();
    const inviteePage = await inviteeBrowser.newPage();
    adminBrowserToken = (await login(adminPage, admin!, password)).accessToken;
    await adminPage.goto('/company');
    await adminPage.locator('#company-settings-tab').click();
    await adminPage.locator('#company-user-identifier').fill(inviteeEmail);
    const invitationResponsePromise = adminPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/v1/company/invitations'),
    );
    await adminPage.getByRole('button', { name: /davet gönder|send invitation/i }).click();
    const invitationResponse = await invitationResponsePromise;
    const invitationBody = await invitationResponse.json();
    if (
      invitationBody.id &&
      UUID.test(invitationBody.id) &&
      invitationBody.tenantId === tenant?.id &&
      invitationBody.recipientUserId === invitee.id &&
      invitationBody.recipientEmail === invitee.email &&
      invitationBody.status === 'pending'
    ) {
      invitation = {
        id: invitationBody.id,
        tenantId: invitationBody.tenantId,
        recipientUserId: invitationBody.recipientUserId,
        invitedByUserId: admin.id,
        companyName,
      };
    }
    expect(invitationResponse.status()).toBe(201);
    expect(invitation).toBeTruthy();
    await expect(adminPage.getByTestId(`company-invitation-row-${invitation.id}`)).toContainText(
      inviteeEmail,
    );

    const inviteeLogin = await login(inviteePage, invitee, password);
    inviteeBrowserToken = inviteeLogin.accessToken;
    expect(inviteeLogin.user).toMatchObject({
      id: invitee.id,
      email: invitee.email,
      tenantId: null,
      role: 'member',
    });
    await inviteePage.goto('/notifications');
    await expect(inviteePage.getByTestId('company-invitation-card-' + invitation.id)).toBeVisible();
    const acceptResponsePromise = inviteePage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/api/v1/users/me/company-invitations/${invitation.id}/accept`),
    );
    await inviteePage
      .getByTestId(`company-invitation-card-${invitation.id}`)
      .getByRole('button', { name: /kabul et|accept/i })
      .click();
    const acceptResponse = await acceptResponsePromise;
    expect(acceptResponse.status()).toBe(200);
    const acceptedBody = await acceptResponse.json();
    expect(acceptedBody.invitation).toMatchObject({ id: invitation.id, status: 'accepted' });
    expect(acceptedBody.user).toMatchObject({
      id: invitee.id,
      email: invitee.email,
      tenantId: tenant.id,
      role: 'member',
    });
    invitee = { ...invitee, tenantId: tenant.id };
    await expect(inviteePage.getByTestId('dashboard-page')).toBeVisible();

    const teamResponse = await adminRegistration.post('/api/v1/teams', {
      headers: { authorization: `Bearer ${adminRegistrationToken}` },
      data: { name: teamName },
    });
    const teamBody = await teamResponse.json();
    if (
      teamBody.id &&
      UUID.test(teamBody.id) &&
      teamBody.tenantId === tenant.id &&
      teamBody.name === teamName
    ) {
      team = { id: teamBody.id, tenantId: teamBody.tenantId, name: teamName };
    }
    expect(teamResponse.status()).toBe(201);
    expect(team).toBeTruthy();

    const addMemberResponse = await adminRegistration.post(`/api/v1/teams/${team.id}/members`, {
      headers: { authorization: `Bearer ${adminRegistrationToken}` },
      data: { displayId: invitee.displayId },
    });
    const addedMember = await addMemberResponse.json();
    expect(addMemberResponse.status()).toBe(201);
    expect(addedMember).toMatchObject({
      userId: invitee.id,
      displayId: invitee.displayId,
      role: 'member',
    });

    const taskResponse = await adminRegistration.post('/api/v1/tasks', {
      headers: { authorization: `Bearer ${adminRegistrationToken}` },
      data: {
        title: taskTitle,
        deadline: new Date().toISOString().slice(0, 10),
        priority: 'medium',
        assigneeIds: [invitee.id],
        teamId: team.id,
      },
    });
    const taskBody = await taskResponse.json();
    if (
      taskBody.id &&
      UUID.test(taskBody.id) &&
      taskBody.title === taskTitle &&
      taskBody.teamId === team.id &&
      taskBody.assignerId === admin.id
    ) {
      task = { id: taskBody.id, teamId: team.id, assignerId: admin.id, title: taskTitle };
    }
    expect(taskResponse.status()).toBe(201);
    expect(task).toBeTruthy();
    expect(taskBody.assignees.map((assignee: { userId: string }) => assignee.userId)).toContain(
      invitee.id,
    );

    const refreshPromise = inviteePage.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/refresh'),
    );
    await inviteePage.reload();
    const refresh = await refreshPromise;
    expect(refresh.status()).toBe(200);
    expect(await refresh.json()).toMatchObject({
      user: { id: invitee.id, email: invitee.email, tenantId: tenant.id, role: 'member' },
    });
    await expect(inviteePage.getByTestId(`task-card-${task.id}`)).toBeVisible();
    await inviteePage.goto(`/tasks/${task.id}`);
    await expect(
      inviteePage.getByRole('heading', { name: taskTitle, exact: true, level: 1 }),
    ).toBeVisible();
  } finally {
    if (adminBrowser) await logout(adminBrowser.request, adminBrowserToken);
    if (inviteeBrowser) await logout(inviteeBrowser.request, inviteeBrowserToken);
    if (adminRegistration) await logout(adminRegistration, adminRegistrationToken);
    if (inviteeRegistration) await logout(inviteeRegistration, inviteeRegistrationToken);
    await adminBrowser?.close();
    await inviteeBrowser?.close();
    await adminRegistration?.dispose();
    await inviteeRegistration?.dispose();
    try {
      await removeFixture(database, {
        adminEmail,
        inviteeEmail,
        companyName,
        teamName,
        taskTitle,
        admin,
        invitee,
        tenant,
        invitation,
        team,
        task,
      });
    } finally {
      await database.end();
    }
  }
});
