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
type UserRole = 'companyAdmin' | 'member';

type Account = {
  fullName: string;
  email: string;
  role: UserRole;
  id?: string;
  displayId?: string;
  tenantId?: string | null;
  tenantName?: string;
  registration?: APIRequestContext;
  registrationToken?: string;
  browser?: BrowserContext;
  browserToken?: string;
};
type TenantFixture = { name: string; owner: Account; id?: string };
type TeamFixture = {
  name: string;
  tenant: TenantFixture;
  id?: string;
};
type TaskFixture = {
  title: string;
  team: TeamFixture;
  assigner: Account;
  assignees: Account[];
  id?: string;
};
type Fixture = {
  database: Client;
  accounts: Account[];
  tenants: TenantFixture[];
  teams: TeamFixture[];
  tasks: TaskFixture[];
};

async function api(
  context: APIRequestContext,
  token: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  data?: unknown,
) {
  const url = `${API_BASE}/api/v1${path}`;
  const options = {
    headers: { authorization: `Bearer ${token}` },
    ...(data === undefined ? {} : { data }),
  };
  if (method === 'GET') return context.get(url, options);
  if (method === 'POST') return context.post(url, options);
  return context.patch(url, options);
}

async function login(page: Page, account: Account, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(password);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/auth/login'),
  );
  await page.locator('form button[type="submit"]').click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.user).toMatchObject({ id: account.id, email: account.email, role: account.role });
  if (account.tenantId) expect(body.user.tenantId).toBe(account.tenantId);
  account.browserToken = body.accessToken;
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
  return body.accessToken as string;
}

async function createTask(fixture: Fixture, task: TaskFixture) {
  fixture.tasks.push(task);
  const response = await api(
    task.assigner.registration!,
    task.assigner.registrationToken!,
    'POST',
    '/tasks',
    {
      title: task.title,
      deadline: new Date().toISOString().slice(0, 10),
      priority: 'medium',
      assigneeIds: task.assignees.map((assignee) => assignee.id),
      teamId: task.team.id,
    },
  );
  const body = await response.json();
  if (
    body.id &&
    UUID.test(body.id) &&
    body.title === task.title &&
    body.teamId === task.team.id &&
    body.assignerId === task.assigner.id
  ) {
    task.id = body.id;
  }
  expect(response.status()).toBe(201);
  expect(task.id).toBeTruthy();
  expect(body.assignees.map((assignee: { userId: string }) => assignee.userId).sort()).toEqual(
    task.assignees.map((assignee) => assignee.id).sort(),
  );
}

async function findUser(client: Client, email: string) {
  const result = await client.query(
    'SELECT id, email, tenant_id AS "tenantId", role FROM users WHERE email = $1',
    [email],
  );
  if (result.rowCount === 0) return undefined;
  if (result.rowCount !== 1) throw new Error('E2E fixture user recovery was ambiguous');
  return result.rows[0] as { id: string; email: string; tenantId: string | null; role: UserRole };
}

async function logout(context: APIRequestContext, token?: string) {
  await context
    .post(`${API_BASE}/api/v1/auth/logout`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    })
    .catch(() => undefined);
}

async function registerAccount(
  fixture: Fixture,
  account: Account,
  password: string,
  tenant?: TenantFixture,
) {
  account.registration = await playwrightRequest.newContext({ baseURL: API_BASE });
  const response = await account.registration.post('/api/v1/auth/register', {
    data: {
      fullName: account.fullName,
      email: account.email,
      password,
      ...(tenant ? { companyName: tenant.name } : {}),
    },
  });
  const body = await response.json();
  if (typeof body.accessToken === 'string') account.registrationToken = body.accessToken;
  if (
    typeof body.user?.id === 'string' &&
    UUID.test(body.user.id) &&
    body.user.email === account.email &&
    body.user.role === account.role
  ) {
    account.id = body.user.id;
    account.displayId = body.user.displayId;
    account.tenantId = body.user.tenantId;
    account.tenantName = tenant?.name;
  }
  fixture.accounts.push(account);
  expect(response.status()).toBe(201);
  expect(account.id).toBeTruthy();
  if (tenant) {
    tenant.id = account.tenantId;
    expect(tenant.id).toMatch(UUID);
  } else {
    expect(account.tenantId).toBeNull();
  }
}

function newAccount(prefix: string, suffix: string, role: UserRole = 'member'): Account {
  return {
    fullName: `E2E ${prefix} ${suffix.slice(0, 8)}`,
    email: `e2e-${prefix.toLowerCase()}-${suffix}@taskflow.invalid`,
    role,
  };
}

async function createTeamFixture(
  fixture: Fixture,
  tenant: TenantFixture,
  suffix: string,
  prefix: string,
) {
  const team: TeamFixture = { name: `${prefix} ${suffix}`, tenant };
  fixture.teams.push(team);
  const response = await api(
    tenant.owner.registration!,
    tenant.owner.registrationToken!,
    'POST',
    '/teams',
    { name: team.name },
  );
  const body = await response.json();
  if (body.id && UUID.test(body.id) && body.tenantId === tenant.id && body.name === team.name) {
    team.id = body.id;
  }
  expect(response.status()).toBe(201);
  expect(team.id).toBeTruthy();
  return team;
}

async function createFixture(): Promise<Fixture> {
  await resetFixtureRegistrationLimit();
  const database = new Client({ connectionString: guardedTestDatabaseUrl() });
  await database.connect();
  return { database, accounts: [], tenants: [], teams: [], tasks: [] };
}

async function attachMembers(fixture: Fixture, tenant: TenantFixture, members: Account[]) {
  await fixture.database.query('BEGIN');
  try {
    const owner = await fixture.database.query(
      `SELECT t.id FROM tenants t JOIN users u ON u.tenant_id = t.id
       WHERE t.id = $1 AND t.name = $2 AND u.id = $3 AND u.email = $4 AND u.role = 'companyAdmin'`,
      [tenant.id, tenant.name, tenant.owner.id, tenant.owner.email],
    );
    if (owner.rowCount !== 1) throw new Error('E2E fixture tenant owner check failed');
    for (const member of members) {
      const updated = await fixture.database.query(
        `UPDATE users SET tenant_id = $1
         WHERE id = $2 AND email = $3 AND tenant_id IS NULL AND role = 'member'
         RETURNING id, tenant_id AS "tenantId"`,
        [tenant.id, member.id, member.email],
      );
      if (updated.rowCount !== 1 || updated.rows[0].tenantId !== tenant.id) {
        throw new Error('E2E fixture member attachment check failed');
      }
      member.tenantId = tenant.id;
      member.tenantName = tenant.name;
    }
    await fixture.database.query('COMMIT');
  } catch (error) {
    await fixture.database.query('ROLLBACK');
    throw error;
  }
}

async function removeRows(fixture: Fixture) {
  const { database, accounts, tenants, teams, tasks } = fixture;
  await database.query('BEGIN');
  try {
    const users = new Map<
      string,
      { id: string; email: string; tenantId: string | null; role: UserRole }
    >();
    for (const account of accounts) {
      const user = await findUser(database, account.email);
      if (!user) continue;
      if (
        (account.id && account.id !== user.id) ||
        user.role !== account.role ||
        (account.tenantId !== undefined && account.tenantId !== user.tenantId)
      ) {
        throw new Error('E2E fixture user ownership check failed');
      }
      account.id = user.id;
      account.tenantId = user.tenantId;
      users.set(user.id, user);
    }

    for (const tenant of tenants) {
      const result = tenant.id
        ? await database.query('SELECT id, name FROM tenants WHERE id = $1 AND name = $2', [
            tenant.id,
            tenant.name,
          ])
        : await database.query('SELECT id, name FROM tenants WHERE name = $1', [tenant.name]);
      if (result.rowCount !== 0 && result.rowCount !== 1)
        throw new Error('E2E tenant recovery ambiguous');
      if (result.rowCount === 0) continue;
      if (tenant.id && tenant.id !== result.rows[0].id)
        throw new Error('E2E tenant identity changed');
      tenant.id = result.rows[0].id as string;
      const owner = users.get(tenant.owner.id!) ?? (await findUser(database, tenant.owner.email));
      if (
        !UUID.test(tenant.id) ||
        !owner ||
        owner.id !== tenant.owner.id ||
        owner.email !== tenant.owner.email ||
        owner.role !== 'companyAdmin' ||
        owner.tenantId !== tenant.id
      ) {
        throw new Error('E2E fixture tenant ownership check failed');
      }
      const tenantUsers = await database.query('SELECT id, email FROM users WHERE tenant_id = $1', [
        tenant.id,
      ]);
      const ownedUsers = new Map(
        accounts
          .filter((account) => account.id && account.tenantName === tenant.name)
          .map((account) => [account.id!, account.email]),
      );
      if (tenantUsers.rows.some((user) => ownedUsers.get(user.id) !== user.email)) {
        throw new Error('E2E tenant contains an unexpected user');
      }
    }

    for (const team of teams) {
      if (!team.tenant.id) continue;
      const result = team.id
        ? await database.query(
            'SELECT id, tenant_id AS "tenantId", name FROM teams WHERE id = $1 AND tenant_id = $2 AND name = $3',
            [team.id, team.tenant.id, team.name],
          )
        : await database.query(
            'SELECT id, tenant_id AS "tenantId", name FROM teams WHERE tenant_id = $1 AND name = $2',
            [team.tenant.id, team.name],
          );
      if (result.rowCount !== 0 && result.rowCount !== 1)
        throw new Error('E2E team recovery ambiguous');
      if (result.rowCount === 1) team.id = result.rows[0].id as string;
      if (team.id && !UUID.test(team.id)) throw new Error('E2E team ID invalid');
    }

    for (const task of tasks) {
      if (!task.team.id || !task.assigner.id) continue;
      const result = task.id
        ? await database.query(
            'SELECT id, title, team_id AS "teamId", assigner_id AS "assignerId" FROM tasks WHERE id = $1 AND title = $2 AND team_id = $3 AND assigner_id = $4',
            [task.id, task.title, task.team.id, task.assigner.id],
          )
        : await database.query(
            'SELECT id, title, team_id AS "teamId", assigner_id AS "assignerId" FROM tasks WHERE title = $1 AND team_id = $2 AND assigner_id = $3',
            [task.title, task.team.id, task.assigner.id],
          );
      if (result.rowCount !== 0 && result.rowCount !== 1)
        throw new Error('E2E task recovery ambiguous');
      if (result.rowCount === 1) task.id = result.rows[0].id as string;
    }

    const teamIds = teams.map((team) => team.id).filter((id): id is string => Boolean(id));
    if (teamIds.length) {
      const members = await database.query(
        'SELECT team_id AS "teamId", user_id AS "userId" FROM team_members WHERE team_id = ANY($1::uuid[])',
        [teamIds],
      );
      if (members.rows.some((row) => !accounts.some((account) => account.id === row.userId))) {
        throw new Error('E2E fixture team has an unexpected member');
      }
      const persistedTasks = await database.query(
        'SELECT id, title, team_id AS "teamId", assigner_id AS "assignerId" FROM tasks WHERE team_id = ANY($1::uuid[])',
        [teamIds],
      );
      if (
        persistedTasks.rows.some(
          (row) =>
            !tasks.some(
              (task) =>
                task.id === row.id &&
                task.title === row.title &&
                task.team.id === row.teamId &&
                task.assigner.id === row.assignerId,
            ),
        )
      ) {
        throw new Error('E2E fixture teams contain an unexpected task');
      }
    }

    for (const tenant of tenants) {
      if (!tenant.id) continue;
      const deleted = await database.query(
        'DELETE FROM tenants WHERE id = $1 AND name = $2 RETURNING id',
        [tenant.id, tenant.name],
      );
      if (deleted.rowCount !== 1)
        throw new Error('E2E fixture tenant delete ownership check failed');
      const remainingTeams = await database.query(
        'SELECT count(*) FROM teams WHERE tenant_id = $1',
        [tenant.id],
      );
      if (remainingTeams.rows[0].count !== '0')
        throw new Error('E2E teams remain after tenant deletion');
    }
    if (teamIds.length) {
      const remainingMembers = await database.query(
        'SELECT count(*) FROM team_members WHERE team_id = ANY($1::uuid[])',
        [teamIds],
      );
      const remainingTasks = await database.query(
        'SELECT count(*) FROM tasks WHERE team_id = ANY($1::uuid[])',
        [teamIds],
      );
      if (remainingMembers.rows[0].count !== '0' || remainingTasks.rows[0].count !== '0') {
        throw new Error('E2E task or team membership remains after tenant deletion');
      }
    }

    for (const user of users.values()) {
      const deleted = await database.query(
        'DELETE FROM users WHERE id = $1 AND email = $2 AND role = $3 AND tenant_id IS NULL RETURNING id',
        [user.id, user.email, user.role],
      );
      if (deleted.rowCount !== 1) throw new Error('E2E fixture user delete ownership check failed');
    }
    const remainingUsers = await database.query(
      'SELECT count(*) FROM users WHERE email = ANY($1::text[])',
      [accounts.map((account) => account.email)],
    );
    const remainingTenants = await database.query(
      'SELECT count(*) FROM tenants WHERE name = ANY($1::text[])',
      [tenants.map((tenant) => tenant.name)],
    );
    const ids = [...users.keys()];
    const remainingNotifications = ids.length
      ? await database.query('SELECT count(*) FROM notifications WHERE user_id = ANY($1::uuid[])', [
          ids,
        ])
      : { rows: [{ count: '0' }] };
    if (
      remainingUsers.rows[0].count !== '0' ||
      remainingTenants.rows[0].count !== '0' ||
      remainingNotifications.rows[0].count !== '0'
    ) {
      throw new Error('E2E users, tenants, or notifications remain after cleanup');
    }
    await database.query('COMMIT');
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  } finally {
    await database.end();
  }
}

async function finishFixture(fixture: Fixture) {
  for (const account of fixture.accounts) {
    if (account.browser) await logout(account.browser.request, account.browserToken);
    if (account.registration) await logout(account.registration, account.registrationToken);
  }
  for (const account of fixture.accounts) {
    await account.browser?.close();
    await account.registration?.dispose();
  }
  await removeRows(fixture);
}

async function addAccountToTeam(team: TeamFixture, account: Account, admin: Account) {
  const response = await api(
    admin.registration!,
    admin.registrationToken!,
    'POST',
    `/teams/${team.id}/members`,
    { displayId: account.displayId },
  );
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({ userId: account.id, role: 'member' });
}

async function attachTeamAdmin(team: TeamFixture, account: Account, admin: Account) {
  await addAccountToTeam(team, account, admin);
  const response = await api(
    admin.registration!,
    admin.registrationToken!,
    'PATCH',
    `/teams/${team.id}/members/${account.id}/role`,
    { role: 'teamAdmin' },
  );
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ userId: account.id, role: 'teamAdmin' });
}

test('member cannot create tasks, change assignments, or update another assignee task', async ({
  browser,
}) => {
  const fixture = await createFixture();
  const suffix = crypto.randomUUID();
  const password = `E2E-${suffix}-Password!`;
  const tenant: TenantFixture = {
    name: `E2E Member Auth ${suffix}`,
    owner: newAccount('admin', suffix, 'companyAdmin'),
  };
  const caller = newAccount('member', suffix);
  const peer = newAccount('peer', suffix);
  fixture.tenants.push(tenant);
  try {
    await registerAccount(fixture, tenant.owner, password, tenant);
    await registerAccount(fixture, caller, password);
    await registerAccount(fixture, peer, password);
    await attachMembers(fixture, tenant, [caller, peer]);
    const team = await createTeamFixture(fixture, tenant, suffix, 'Member Scope');
    await addAccountToTeam(team, caller, tenant.owner);
    await addAccountToTeam(team, peer, tenant.owner);
    const ownTask: TaskFixture = {
      title: `E2E own task ${suffix}`,
      team,
      assigner: tenant.owner,
      assignees: [caller],
    };
    const peerTask: TaskFixture = {
      title: `E2E peer task ${suffix}`,
      team,
      assigner: tenant.owner,
      assignees: [peer],
    };
    await createTask(fixture, ownTask);
    await createTask(fixture, peerTask);

    const memberBrowser = await browser.newContext();
    caller.browser = memberBrowser;
    const page = await memberBrowser.newPage();
    const token = await login(page, caller, password);
    await expect(page.getByTestId('add-task-button')).toHaveCount(0);

    const createTitle = `E2E forbidden create ${suffix}`;
    const createDenied = await api(page.request, token, 'POST', '/tasks', {
      title: createTitle,
      deadline: new Date().toISOString().slice(0, 10),
      priority: 'medium',
      assigneeIds: [caller.id],
      teamId: team.id,
    });
    expect(createDenied.status()).toBe(403);
    expect((await createDenied.json()).error).toBe('FORBIDDEN');
    const listAfterCreate = await api(
      tenant.owner.registration!,
      tenant.owner.registrationToken!,
      'GET',
      '/tasks',
    );
    expect(listAfterCreate.status()).toBe(200);
    expect(
      (await listAfterCreate.json()).tasks.some(
        (task: { title: string }) => task.title === createTitle,
      ),
    ).toBe(false);

    const assignmentDenied = await api(page.request, token, 'PATCH', `/tasks/${ownTask.id}`, {
      assigneeIds: [peer.id],
    });
    expect(assignmentDenied.status()).toBe(403);
    expect((await assignmentDenied.json()).error).toBe('FORBIDDEN');
    const ownAfterAssignment = await api(
      tenant.owner.registration!,
      tenant.owner.registrationToken!,
      'GET',
      `/tasks/${ownTask.id}`,
    );
    expect(ownAfterAssignment.status()).toBe(200);
    expect(
      (await ownAfterAssignment.json()).assignees.map((item: { userId: string }) => item.userId),
    ).toEqual([caller.id]);

    const ownStatus = await api(
      page.request,
      token,
      'POST',
      `/tasks/${ownTask.id}/status/propose`,
      { status: 'in_progress' },
    );
    expect(ownStatus.status()).toBe(200);
    expect((await ownStatus.json()).status).toBe('in_progress');
    const peerStatusDenied = await api(
      page.request,
      token,
      'POST',
      `/tasks/${peerTask.id}/status/propose`,
      { status: 'in_progress' },
    );
    expect(peerStatusDenied.status()).toBe(403);
    expect((await peerStatusDenied.json()).error).toBe('FORBIDDEN');
    const peerAfterStatus = await api(
      tenant.owner.registration!,
      tenant.owner.registrationToken!,
      'GET',
      `/tasks/${peerTask.id}`,
    );
    expect(peerAfterStatus.status()).toBe(200);
    expect(await peerAfterStatus.json()).toMatchObject({
      title: peerTask.title,
      status: 'todo',
      pendingStatus: null,
    });
  } finally {
    await finishFixture(fixture);
  }
});

test('team admin manages only their own team', async ({ browser }) => {
  const fixture = await createFixture();
  const suffix = crypto.randomUUID();
  const password = `E2E-${suffix}-Password!`;
  const tenant: TenantFixture = {
    name: `E2E Team Admin ${suffix}`,
    owner: newAccount('admin', suffix, 'companyAdmin'),
  };
  const teamAdmin = newAccount('team-admin', suffix);
  const memberA = newAccount('member-a', suffix);
  const memberB = newAccount('member-b', suffix);
  fixture.tenants.push(tenant);
  try {
    await registerAccount(fixture, tenant.owner, password, tenant);
    await registerAccount(fixture, teamAdmin, password);
    await registerAccount(fixture, memberA, password);
    await registerAccount(fixture, memberB, password);
    await attachMembers(fixture, tenant, [teamAdmin, memberA, memberB]);
    const teamA = await createTeamFixture(fixture, tenant, suffix, 'Team Admin Own');
    const teamB = await createTeamFixture(fixture, tenant, suffix, 'Team Admin Other');
    await attachTeamAdmin(teamA, teamAdmin, tenant.owner);
    await addAccountToTeam(teamA, memberA, tenant.owner);
    await addAccountToTeam(teamB, memberB, tenant.owner);
    const ownTask: TaskFixture = {
      title: `E2E managed task ${suffix}`,
      team: teamA,
      assigner: tenant.owner,
      assignees: [memberA],
    };
    const otherTask: TaskFixture = {
      title: `E2E other team task ${suffix}`,
      team: teamB,
      assigner: tenant.owner,
      assignees: [memberB],
    };
    await createTask(fixture, ownTask);
    await createTask(fixture, otherTask);

    const teamAdminBrowser = await browser.newContext();
    teamAdmin.browser = teamAdminBrowser;
    const page = await teamAdminBrowser.newPage();
    const token = await login(page, teamAdmin, password);
    const ownTeamRead = await api(page.request, token, 'GET', `/teams/${teamA.id}`);
    expect(ownTeamRead.status()).toBe(200);
    const ownTaskRead = await api(page.request, token, 'GET', `/tasks/${ownTask.id}`);
    expect(ownTaskRead.status()).toBe(200);
    expect((await ownTaskRead.json()).title).toBe(ownTask.title);

    const ownTaskStatus = await api(page.request, token, 'PATCH', `/tasks/${ownTask.id}/status`, {
      status: 'in_progress',
    });
    expect(ownTaskStatus.status()).toBe(200);
    expect((await ownTaskStatus.json()).status).toBe('in_progress');

    const otherTeamRead = await api(page.request, token, 'GET', `/teams/${teamB.id}`);
    expect(otherTeamRead.status()).toBe(403);
    expect((await otherTeamRead.json()).error).toBe('FORBIDDEN');
    const otherTaskRead = await api(page.request, token, 'GET', `/tasks/${otherTask.id}`);
    expect(otherTaskRead.status()).toBe(403);
    expect((await otherTaskRead.json()).error).toBe('FORBIDDEN');
    const otherTaskMutation = await api(
      page.request,
      token,
      'PATCH',
      `/tasks/${otherTask.id}/status`,
      { status: 'in_progress' },
    );
    expect(otherTaskMutation.status()).toBe(403);
    expect((await otherTaskMutation.json()).error).toBe('FORBIDDEN');

    const ownState = await api(
      tenant.owner.registration!,
      tenant.owner.registrationToken!,
      'GET',
      `/tasks/${ownTask.id}`,
    );
    expect(ownState.status()).toBe(200);
    expect(await ownState.json()).toMatchObject({ title: ownTask.title, status: 'in_progress' });
    const otherState = await api(
      tenant.owner.registration!,
      tenant.owner.registrationToken!,
      'GET',
      `/tasks/${otherTask.id}`,
    );
    expect(otherState.status()).toBe(200);
    expect(await otherState.json()).toMatchObject({
      title: otherTask.title,
      status: 'todo',
      pendingStatus: null,
    });
  } finally {
    await finishFixture(fixture);
  }
});

test('tenant B member cannot read or mutate tenant A task', async ({ browser }) => {
  const fixture = await createFixture();
  const suffix = crypto.randomUUID();
  const password = `E2E-${suffix}-Password!`;
  const tenantA: TenantFixture = {
    name: `E2E Private A ${suffix}`,
    owner: newAccount('admin-a', suffix, 'companyAdmin'),
  };
  const tenantB: TenantFixture = {
    name: `E2E Private B ${suffix}`,
    owner: newAccount('admin-b', suffix, 'companyAdmin'),
  };
  const memberA = newAccount('member-a', suffix);
  const memberB = newAccount('member-b', suffix);
  fixture.tenants.push(tenantA, tenantB);
  try {
    await registerAccount(fixture, tenantA.owner, password, tenantA);
    await registerAccount(fixture, tenantB.owner, password, tenantB);
    await registerAccount(fixture, memberA, password);
    await registerAccount(fixture, memberB, password);
    await attachMembers(fixture, tenantA, [memberA]);
    await attachMembers(fixture, tenantB, [memberB]);
    const teamA = await createTeamFixture(fixture, tenantA, suffix, 'Private Team A');
    const teamB = await createTeamFixture(fixture, tenantB, suffix, 'Private Team B');
    await addAccountToTeam(teamA, memberA, tenantA.owner);
    await addAccountToTeam(teamB, memberB, tenantB.owner);
    const privateTask: TaskFixture = {
      title: `E2E private task ${suffix}`,
      team: teamA,
      assigner: tenantA.owner,
      assignees: [memberA],
    };
    const ownTask: TaskFixture = {
      title: `E2E tenant B task ${suffix}`,
      team: teamB,
      assigner: tenantB.owner,
      assignees: [memberB],
    };
    await createTask(fixture, privateTask);
    await createTask(fixture, ownTask);

    const memberBrowser = await browser.newContext();
    memberB.browser = memberBrowser;
    const page = await memberBrowser.newPage();
    const token = await login(page, memberB, password);
    const ownTaskRead = await api(page.request, token, 'GET', `/tasks/${ownTask.id}`);
    expect(ownTaskRead.status()).toBe(200);
    expect(await ownTaskRead.json()).toMatchObject({ id: ownTask.id, title: ownTask.title });

    const foreignRead = await api(page.request, token, 'GET', `/tasks/${privateTask.id}`);
    expect(foreignRead.status()).toBe(404);
    expect((await foreignRead.json()).error).toBe('NOT_FOUND');
    const foreignMutation = await api(
      page.request,
      token,
      'PATCH',
      `/tasks/${privateTask.id}/status`,
      { status: 'done' },
    );
    expect(foreignMutation.status()).toBe(404);
    expect((await foreignMutation.json()).error).toBe('NOT_FOUND');
    const ownerState = await api(
      tenantA.owner.registration!,
      tenantA.owner.registrationToken!,
      'GET',
      `/tasks/${privateTask.id}`,
    );
    expect(ownerState.status()).toBe(200);
    expect(await ownerState.json()).toMatchObject({
      id: privateTask.id,
      title: privateTask.title,
      status: 'todo',
      pendingStatus: null,
      assignees: [{ userId: memberA.id }],
    });

    const pageTaskReadPromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().endsWith(`/api/v1/tasks/${privateTask.id}`),
    );
    await page.goto(`/tasks/${privateTask.id}`);
    const pageTaskRead = await pageTaskReadPromise;
    expect(pageTaskRead.status()).toBe(404);
    expect((await pageTaskRead.json()).error).toBe('NOT_FOUND');
    await expect(
      page.getByRole('heading', {
        name: /Aradığınız sayfa bulunamadı|The page you are looking for could not be found/i,
      }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: privateTask.title, exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText(privateTask.title, { exact: true })).toHaveCount(0);
  } finally {
    await finishFixture(fixture);
  }
});
