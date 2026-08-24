import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { startOfUtcToday } from '../lib/calendarDate';
import { register, type AuthResult } from '../services/auth.service';

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
      { teamId: teamA.id, userId: memberA.user.id, role: 'member' },
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

  return { admin, memberA, foreignAdmin, teamA, zeroTask };
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

    const foreignTeam = await request(app)
      .get(`/api/v1/company/dashboard?teamId=${fixture.teamA.id}`)
      .set(auth(fixture.foreignAdmin.accessToken));
    expect(foreignTeam.status).toBe(404);

    const allScope = await request(app)
      .get('/api/v1/company/dashboard')
      .set(auth(fixture.admin.accessToken));
    expect(allScope.status).toBe(200);
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
    });
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
      .get(`/api/v1/company/dashboard?teamId=${fixture.teamA.id}`)
      .set(auth(fixture.admin.accessToken));
    expect(teamScope.status).toBe(200);
    expect(teamScope.body.scope).toEqual({ teamId: fixture.teamA.id, teamName: 'Alpha' });
    expect(teamScope.body.summary.totalTaskCount).toBe(7);
    expect(teamScope.body.summary.totalUserCount).toBe(4);
    expect(teamScope.body.teams).toEqual([]);
  });
});
