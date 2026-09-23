import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { startOfUtcToday } from '../lib/calendarDate';
import { withTenantContext } from '../db/withTenant';
import type { Actor } from '../lib/permissions';
import { register, type AuthResult } from '../services/auth.service';
import { getCompanyDashboard } from '../services/company-dashboard.service';

const PASSWORD = 'hunter22';
const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanDb() {
  await prisma.taskComment.deleteMany();
  await prisma.taskStatusAck.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.companyInvitation.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const keys = await redis.keys('*');
  if (keys.length) await redis.del(...keys);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createTenantMember(
  fullName: string,
  email: string,
  tenantId: string,
): Promise<AuthResult> {
  const result = await register({ fullName, email, password: PASSWORD });
  await prisma.user.update({
    where: { id: result.user.id },
    data: { tenantId, role: 'member' },
  });
  return result;
}

async function createDirectMember(
  fullName: string,
  index: number,
  tenantId: string,
): Promise<{ id: string }> {
  return prisma.user.create({
    data: {
      tenantId,
      fullName,
      email: `dashboard-${index}@company-a.test`,
      displayId: `DB${String(index).padStart(5, '0')}`,
      passwordHash: 'unused',
      role: 'member',
    },
    select: { id: true },
  });
}

async function createTask(input: {
  teamId: string;
  title: string;
  assignerId: string;
  assigneeIds: string[];
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  deadline?: Date;
  archivedAt?: Date;
  pendingStatus?: 'todo' | 'in_progress' | 'done';
}) {
  return prisma.task.create({
    data: {
      teamId: input.teamId,
      title: input.title,
      assignerId: input.assignerId,
      status: input.status,
      priority: input.priority,
      ...(input.deadline ? { deadline: input.deadline } : {}),
      ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
      ...(input.pendingStatus ? { pendingStatus: input.pendingStatus } : {}),
      assignees: {
        create: input.assigneeIds.map((userId) => ({ userId })),
      },
    },
  });
}

async function seedDashboardFixture() {
  const admin = await register({
    fullName: 'Admin A',
    email: 'dashboard-admin-a@company.test',
    password: PASSWORD,
    companyName: 'Company A',
  });
  const tenantId = admin.user.tenantId!;
  const memberA = await createTenantMember('A Member', 'dashboard-member-a@company.test', tenantId);
  const memberB = await createDirectMember('B Member', 1, tenantId);
  const memberC = await createDirectMember('C Member', 2, tenantId);
  const zeroTask = await createDirectMember('A Zero Task', 3, tenantId);

  const capUsers = Array.from({ length: 100 }, (_, index) => ({
    tenantId,
    fullName: `ZZ Fixture ${String(index + 1).padStart(3, '0')}`,
    email: `dashboard-cap-${index + 1}@company-a.test`,
    displayId: `CAP${String(index + 1).padStart(5, '0')}`,
    passwordHash: 'unused',
    role: 'member' as const,
  }));
  await prisma.user.createMany({ data: capUsers });

  const teamA = await prisma.team.create({ data: { tenantId, name: 'Alpha' } });
  const teamB = await prisma.team.create({ data: { tenantId, name: 'Beta' } });
  await prisma.teamMember.createMany({
    data: [
      { teamId: teamA.id, userId: admin.user.id, role: 'member' },
      { teamId: teamA.id, userId: memberA.user.id, role: 'teamAdmin' },
      { teamId: teamA.id, userId: memberB.id, role: 'member' },
      { teamId: teamA.id, userId: memberC.id, role: 'member' },
      { teamId: teamB.id, userId: memberC.id, role: 'member' },
    ],
  });

  const foreignAdmin = await register({
    fullName: 'Admin B',
    email: 'dashboard-admin-b@company.test',
    password: PASSWORD,
    companyName: 'Company B',
  });
  const foreignTeam = await prisma.team.create({
    data: { tenantId: foreignAdmin.user.tenantId!, name: 'Foreign Team' },
  });

  const today = startOfUtcToday();
  const day = (offset: number) => new Date(today.getTime() + offset * DAY_MS);
  const archivedAt = new Date(today.getTime() + 12 * 60 * 60 * 1000);

  await createTask({
    teamId: teamA.id,
    title: 'T1',
    assignerId: admin.user.id,
    assigneeIds: [memberA.user.id],
    status: 'todo',
    priority: 'low',
    deadline: day(-1),
  });
  await createTask({
    teamId: teamA.id,
    title: 'T2',
    assignerId: admin.user.id,
    assigneeIds: [memberA.user.id, memberB.id],
    status: 'in_progress',
    priority: 'medium',
    deadline: day(0),
    pendingStatus: 'done',
  });
  await createTask({
    teamId: teamA.id,
    title: 'T3',
    assignerId: admin.user.id,
    assigneeIds: [memberB.id],
    status: 'done',
    priority: 'high',
  });
  await createTask({
    teamId: teamA.id,
    title: 'T4',
    assignerId: admin.user.id,
    assigneeIds: [memberB.id],
    status: 'done',
    priority: 'high',
    deadline: day(-10),
    archivedAt,
  });
  await createTask({
    teamId: teamA.id,
    title: 'T5',
    assignerId: admin.user.id,
    assigneeIds: [memberA.user.id],
    status: 'todo',
    priority: 'low',
    deadline: day(-7),
    archivedAt,
  });
  await createTask({
    teamId: teamA.id,
    title: 'T6',
    assignerId: admin.user.id,
    assigneeIds: [memberA.user.id],
    status: 'in_progress',
    priority: 'medium',
    deadline: day(-8),
    archivedAt,
  });
  await createTask({
    teamId: teamA.id,
    title: 'T7',
    assignerId: admin.user.id,
    assigneeIds: [memberC.id],
    status: 'todo',
    priority: 'high',
    deadline: day(7),
  });
  await createTask({
    teamId: teamB.id,
    title: 'T8',
    assignerId: admin.user.id,
    assigneeIds: [memberC.id],
    status: 'todo',
    priority: 'low',
    deadline: day(8),
  });
  await createTask({
    teamId: teamB.id,
    title: 'T9',
    assignerId: admin.user.id,
    assigneeIds: [memberC.id],
    status: 'done',
    priority: 'medium',
  });
  await createTask({
    teamId: foreignTeam.id,
    title: 'Tenant B Unique',
    assignerId: foreignAdmin.user.id,
    assigneeIds: [foreignAdmin.user.id],
    status: 'todo',
    priority: 'high',
    deadline: day(-1),
  });

  return { admin, memberA, foreignAdmin, teamA, teamB, zeroTask };
}

describe('company dashboard routes', () => {
  beforeEach(cleanDb);

  it('requires authentication', async () => {
    const response = await request(createApp()).get('/api/v1/company/dashboard');
    expect(response.status).toBe(401);
  });

  it('enforces role, tenant scope, metric rules, and member cap', async () => {
    const fixture = await seedDashboardFixture();
    const app = createApp();

    const memberResponse = await request(app)
      .get('/api/v1/company/dashboard')
      .set(auth(fixture.memberA.accessToken));
    expect(memberResponse.status).toBe(403);

    const malformedTeam = await request(app)
      .get('/api/v1/company/dashboard?teamId=not-a-uuid')
      .set(auth(fixture.admin.accessToken));
    expect(malformedTeam.status).toBe(400);

    const malformedRange = await request(app)
      .get('/api/v1/company/dashboard?range=1d')
      .set(auth(fixture.admin.accessToken));
    expect(malformedRange.status).toBe(400);

    const foreignTeam = await request(app)
      .get(`/api/v1/company/dashboard?teamId=${fixture.teamA.id}`)
      .set(auth(fixture.foreignAdmin.accessToken));
    expect(foreignTeam.status).toBe(404);

    const allScope = await request(app)
      .get('/api/v1/company/dashboard')
      .set(auth(fixture.admin.accessToken));
    expect(allScope.status).toBe(200);
    expect(allScope.body.period).toMatchObject({ range: '30d' });
    expect(allScope.body.createdInPeriod).toMatchObject({ current: 9, previous: 0 });
    expect(allScope.body.completedInPeriod).toMatchObject({ current: 0, previous: 0 });
    expect(allScope.body.backlogChange).toBe(9);
    expect(allScope.body.createdVsCompleted).toHaveLength(30);
    expect(allScope.body.throughput).toHaveLength(30);
    expect(allScope.body.summary).toEqual({
      totalUserCount: 105,
      totalTaskCount: 9,
      openTaskCount: 4,
      completedTaskCount: 3,
      expiredTaskCount: 2,
      completionRate: 33,
    });
    expect(allScope.body.risk).toEqual({
      overdueTaskCount: 1,
      dueNextSevenDaysTaskCount: 2,
      pendingApprovalTaskCount: 1,
      expiredTaskCount: 2,
      blockedTaskCount: 0,
      blockedOverThreeDaysTaskCount: 0,
      blockedRate: 0,
    });
    expect(allScope.body.riskTasks.overdue.map((task: { title: string }) => task.title)).toEqual([
      'T1',
    ]);
    expect(
      allScope.body.riskTasks.dueNextSevenDays.map((task: { title: string }) => task.title),
    ).toEqual(['T2', 'T7']);
    expect(
      allScope.body.riskTasks.pendingApproval.map((task: { title: string }) => task.title),
    ).toEqual(['T2']);
    expect(allScope.body.riskTasks.expired.map((task: { title: string }) => task.title)).toEqual([
      'T6',
      'T5',
    ]);
    expect(allScope.body.statusBreakdown).toEqual({
      total: 6,
      todo: { count: 3, percentage: 50 },
      inProgress: { count: 1, percentage: 17 },
      done: { count: 2, percentage: 33 },
    });
    expect(allScope.body.priorityBreakdown).toEqual({
      total: 4,
      low: { count: 2, percentage: 50 },
      medium: { count: 1, percentage: 25 },
      high: { count: 1, percentage: 25 },
    });
    expect(allScope.body.members.items).toHaveLength(100);
    expect(allScope.body.members.totalCount).toBe(105);
    expect(allScope.body.members.capped).toBe(true);
    expect(allScope.body.members.items).toContainEqual({
      userId: fixture.memberA.user.id,
      fullName: 'A Member',
      assignedTaskCount: 4,
      openTaskCount: 2,
      completedTaskCount: 0,
      expiredTaskCount: 2,
      completionRate: 0,
    });
    expect(allScope.body.members.items).toContainEqual({
      fullName: 'B Member',
      assignedTaskCount: 3,
      openTaskCount: 1,
      completedTaskCount: 2,
      expiredTaskCount: 0,
      completionRate: 67,
      userId: expect.any(String),
    });
    expect(allScope.body.members.items).toContainEqual({
      userId: fixture.zeroTask.id,
      fullName: 'A Zero Task',
      assignedTaskCount: 0,
      openTaskCount: 0,
      completedTaskCount: 0,
      expiredTaskCount: 0,
      completionRate: 0,
    });
    expect(allScope.body.teams).toEqual([
      {
        teamId: fixture.teamA.id,
        teamName: 'Alpha',
        totalTaskCount: 7,
        openTaskCount: 3,
        completedTaskCount: 2,
        expiredTaskCount: 2,
        completionRate: 29,
      },
      expect.objectContaining({
        teamName: 'Beta',
        totalTaskCount: 2,
        openTaskCount: 1,
        completedTaskCount: 1,
        expiredTaskCount: 0,
        completionRate: 50,
      }),
    ]);
    expect(JSON.stringify(allScope.body)).not.toContain('Tenant B Unique');

    const teamScope = await request(app)
      .get(`/api/v1/company/dashboard?teamId=${fixture.teamA.id}&range=7d`)
      .set(auth(fixture.admin.accessToken));
    expect(teamScope.status).toBe(200);
    expect(teamScope.body.period.range).toBe('7d');
    expect(teamScope.body.scope).toEqual({ teamId: fixture.teamA.id, teamName: 'Alpha' });
    expect(teamScope.body.summary.totalTaskCount).toBe(7);
    expect(teamScope.body.summary.totalUserCount).toBe(4);
    expect(teamScope.body.teams).toEqual([]);
  });

  it('keeps the response contract stable for a tenant without tasks', async () => {
    const admin = await register({
      fullName: 'Empty Admin',
      email: 'dashboard-empty@company.test',
      password: PASSWORD,
      companyName: 'Empty Company',
    });

    const response = await request(createApp())
      .get('/api/v1/company/dashboard')
      .set(auth(admin.accessToken));

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual([
      'period',
      'createdInPeriod',
      'completedInPeriod',
      'cycleTime',
      'leadTime',
      'agingWip',
      'overdueRate',
      'onTimeDeliveryRate',
      'backlogChange',
      'throughput',
      'createdVsCompleted',
      'cumulativeFlow',
      'scope',
      'health',
      'summary',
      'risk',
      'riskTasks',
      'statusBreakdown',
      'priorityBreakdown',
      'members',
      'teams',
    ]);
    expect(response.body.summary).toEqual({
      totalUserCount: 1,
      totalTaskCount: 0,
      openTaskCount: 0,
      completedTaskCount: 0,
      expiredTaskCount: 0,
      completionRate: 0,
    });
    expect(response.body.cycleTime).toEqual({
      unit: 'days',
      median: null,
      p85: null,
      sampleSize: 0,
    });
    expect(response.body.leadTime).toEqual({ unit: 'days', median: null, sampleSize: 0 });
    expect(response.body.agingWip).toEqual({
      unit: 'days',
      buckets: { zeroToThree: 0, fourToSeven: 0, eightToFourteen: 0, fifteenToThirty: 0, overThirty: 0 },
      measuredCount: 0,
      unknownCount: 0,
      totalCount: 0,
    });
    expect(response.body.risk).toEqual({
      overdueTaskCount: 0,
      dueNextSevenDaysTaskCount: 0,
      pendingApprovalTaskCount: 0,
      expiredTaskCount: 0,
      blockedTaskCount: 0,
      blockedOverThreeDaysTaskCount: 0,
      blockedRate: 0,
    });
    expect(response.body.riskTasks).toEqual({
      overdue: [],
      dueNextSevenDays: [],
      pendingApproval: [],
      expired: [],
    });
    expect(response.body.statusBreakdown.total).toBe(0);
    expect(response.body.priorityBreakdown.total).toBe(0);
    expect(response.body.createdVsCompleted).toHaveLength(30);
    expect(response.body.cumulativeFlow.samples).toHaveLength(30);
    expect(response.body.cumulativeFlow.bottleneck).toEqual({
      inProgressDelta: 0,
      inProgressGrowthPct: null,
      agingInProgressCount: 0,
      unknownStartedAtCount: 0,
      blockedRate: null,
      cycleDegradationPct: null,
    });
    expect(
      response.body.createdVsCompleted.every(
        (point: { created: number; completed: number }) =>
          point.created === 0 && point.completed === 0,
      ),
    ).toBe(true);
    expect(response.body.members).toMatchObject({
      totalCount: 1,
      returnedCount: 1,
      capped: false,
    });
    expect(response.body.teams).toEqual([]);
  });

  it('uses completedAt and excludes deadline-less completions from on-time rate', async () => {
    const admin = await register({
      fullName: 'Analytics Admin',
      email: 'dashboard-analytics@company.test',
      password: PASSWORD,
      companyName: 'Analytics Company',
    });
    const team = await prisma.team.create({
      data: { tenantId: admin.user.tenantId!, name: 'Analytics' },
    });
    const today = startOfUtcToday();
    const completedAt = new Date(today.getTime() + 12 * 60 * 60 * 1000);
    const onTime = await createTask({
      teamId: team.id,
      title: 'On time',
      assignerId: admin.user.id,
      assigneeIds: [],
      status: 'todo',
      priority: 'low',
      deadline: new Date(today.getTime() + DAY_MS),
    });
    const late = await createTask({
      teamId: team.id,
      title: 'Late',
      assignerId: admin.user.id,
      assigneeIds: [],
      status: 'todo',
      priority: 'low',
      deadline: new Date(today.getTime() - DAY_MS),
    });
    const noDeadline = await createTask({
      teamId: team.id,
      title: 'No deadline',
      assignerId: admin.user.id,
      assigneeIds: [],
      status: 'todo',
      priority: 'low',
    });
    await createTask({
      teamId: team.id,
      title: 'Status only',
      assignerId: admin.user.id,
      assigneeIds: [],
      status: 'done',
      priority: 'low',
    });
    await prisma.task.updateMany({
      where: { id: { in: [onTime.id, late.id, noDeadline.id] } },
      data: { completedAt },
    });

    const response = await request(createApp())
      .get('/api/v1/company/dashboard?range=7d')
      .set(auth(admin.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.createdInPeriod.current).toBe(4);
    expect(response.body.completedInPeriod.current).toBe(3);
    expect(response.body.onTimeDeliveryRate.current).toBe(50);
    expect(response.body.overdueRate.current).toBe(50);
    expect(response.body.createdVsCompleted).toHaveLength(7);
  });

  it('excludes a task blocked exactly 72 hours from the strict over-three-day metric', async () => {
    const admin = await register({
      fullName: 'Blocking Boundary Admin',
      email: 'dashboard-blocking-boundary@company.test',
      password: PASSWORD,
      companyName: 'Blocking Boundary Company',
    });
    const team = await prisma.team.create({
      data: { tenantId: admin.user.tenantId!, name: 'Blocking Boundary Team' },
    });
    const now = new Date('2026-09-17T12:00:00.000Z');
    const task = await createTask({
      teamId: team.id,
      title: 'Exactly three days blocked',
      assignerId: admin.user.id,
      assigneeIds: [],
      status: 'todo',
      priority: 'low',
    });
    await prisma.task.update({
      where: { id: task.id },
      data: { isBlocked: true, blockedSince: new Date(now.getTime() - 3 * DAY_MS) },
    });

    const dashboard = await withTenantContext(
      admin.user.id,
      admin.user.tenantId!,
      (db) => getCompanyDashboard(db, admin.user as Actor, {}, now),
    );

    expect(dashboard.risk.blockedTaskCount).toBe(1);
    expect(dashboard.risk.blockedOverThreeDaysTaskCount).toBe(0);
  });

  it('does not expose a cross-tenant assignee through risk tasks', async () => {
    const adminA = await register({
      fullName: 'Tenant A Admin',
      email: 'dashboard-assignee-a@company.test',
      password: PASSWORD,
      companyName: 'Assignee Company A',
    });
    const adminB = await register({
      fullName: 'Tenant B Admin',
      email: 'dashboard-assignee-b@company.test',
      password: PASSWORD,
      companyName: 'Assignee Company B',
    });
    const teamA = await prisma.team.create({
      data: { tenantId: adminA.user.tenantId!, name: 'Assignee Team A' },
    });
    const task = await createTask({
      teamId: teamA.id,
      title: 'Tenant-safe risk task',
      assignerId: adminA.user.id,
      assigneeIds: [],
      status: 'todo',
      priority: 'high',
      deadline: new Date(startOfUtcToday().getTime() - DAY_MS),
    });
    await prisma.taskAssignee.create({
      data: { taskId: task.id, userId: adminB.user.id },
    });

    const response = await request(createApp())
      .get('/api/v1/company/dashboard')
      .set(auth(adminA.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.riskTasks.overdue).toContainEqual(
      expect.objectContaining({ title: 'Tenant-safe risk task', assignee: null }),
    );
    expect(JSON.stringify(response.body)).not.toContain('Tenant B Admin');
  });

  it('scopes team dashboard access to company admins and team admins', async () => {
    const fixture = await seedDashboardFixture();
    const app = createApp();

    const companyAdmin = await request(app)
      .get(`/api/v1/teams/${fixture.teamA.id}/dashboard?range=7d`)
      .set(auth(fixture.admin.accessToken));
    expect(companyAdmin.status).toBe(200);
    expect(companyAdmin.body.scope).toEqual({ teamId: fixture.teamA.id, teamName: 'Alpha' });
    expect(companyAdmin.body.summary.totalTaskCount).toBe(7);
    expect(companyAdmin.body.members.items).toContainEqual(
      expect.objectContaining({ fullName: 'A Member', assignedTaskCount: 4 }),
    );

    const teamAdmin = await request(app)
      .get(`/api/v1/teams/${fixture.teamA.id}/dashboard`)
      .set(auth(fixture.memberA.accessToken));
    expect(teamAdmin.status).toBe(200);
    expect(teamAdmin.body.summary.totalTaskCount).toBe(7);

    const regular = await createTenantMember(
      'Regular',
      'dashboard-regular@company.test',
      fixture.admin.user.tenantId!,
    );
    await prisma.teamMember.create({
      data: { teamId: fixture.teamA.id, userId: regular.user.id, role: 'member' },
    });
    const member = await request(app)
      .get(`/api/v1/teams/${fixture.teamA.id}/dashboard`)
      .set(auth(regular.accessToken));
    expect(member.status).toBe(403);

    const otherTeam = await request(app)
      .get(`/api/v1/teams/${fixture.teamB.id}/dashboard`)
      .set(auth(fixture.memberA.accessToken));
    expect(otherTeam.status).toBe(403);

    const foreignTeam = await request(app)
      .get(`/api/v1/teams/${fixture.teamA.id}/dashboard`)
      .set(auth(fixture.foreignAdmin.accessToken));
    expect(foreignTeam.status).toBe(404);

    const malformedRange = await request(app)
      .get(`/api/v1/teams/${fixture.teamA.id}/dashboard?range=1d`)
      .set(auth(fixture.admin.accessToken));
    expect(malformedRange.status).toBe(400);

    const malformedTeamId = await request(app)
      .get('/api/v1/teams/not-a-uuid/dashboard')
      .set(auth(fixture.admin.accessToken));
    expect(malformedTeamId.status).toBe(400);
  });
});
