import { AppError } from '../lib/appError';
import { assertCanManageTeam, isCompanyAdmin, requireTenant, type Actor } from '../lib/permissions';
import type { TenantDb } from '../db/types';
import type { CreateTeamInput, UpdateTeamMemberRoleInput } from '../schemas/teams.schema';
import type { TeamMemberRole } from '@prisma/client';

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  tenantId: string;
  memberCount: number;
  createdAt: Date;
}

export interface TeamMemberInfo {
  userId: string;
  displayId: string;
  fullName: string;
  avatarUrl: string | null;
  role: TeamMemberRole;
  joinedAt: Date;
}

export interface TeamMemberCandidate {
  id: string;
  displayId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface TeamDetail extends TeamSummary {
  members: TeamMemberInfo[];
  taskCount: number;
}

function toSummary(team: {
  id: string;
  name: string;
  description: string | null;
  tenantId: string;
  createdAt: Date;
  _count: { members: number };
}): TeamSummary {
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    tenantId: team.tenantId,
    memberCount: team._count.members,
    createdAt: team.createdAt,
  };
}

export async function createTeam(
  db: TenantDb,
  input: CreateTeamInput,
  actor: Actor,
): Promise<TeamSummary> {
  if (!isCompanyAdmin(actor)) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }
  if (!actor.tenantId) {
    throw new AppError(403, 'Bu işlem için bir şirkete dahil olmalısınız', 'NO_TENANT');
  }
  const team = await db.team.create({
    data: { tenantId: actor.tenantId, name: input.name, description: input.description ?? null },
    include: { _count: { select: { members: true } } },
  });
  return toSummary(team);
}

export async function listTeams(db: TenantDb, actor: Actor): Promise<TeamSummary[]> {
  if (!actor.tenantId) return [];
  const teams = await db.team.findMany({
    where: isCompanyAdmin(actor)
      ? { tenantId: actor.tenantId }
      : { tenantId: actor.tenantId, members: { some: { userId: actor.id } } },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return teams.map(toSummary);
}

export async function getTeam(db: TenantDb, teamId: string, actor: Actor): Promise<TeamDetail> {
  const team = await db.team.findFirst({
    where: { id: teamId, tenantId: actor.tenantId ?? undefined },
    include: {
      members: {
        include: {
          user: { select: { id: true, displayId: true, fullName: true, avatarUrl: true } },
        },
        orderBy: { joinedAt: 'asc' },
      },
      _count: { select: { members: true, tasks: true } },
    },
  });
  if (!team) throw new AppError(404, 'Takım bulunamadı', 'NOT_FOUND');
  if (!isCompanyAdmin(actor) && !team.members.some((member) => member.userId === actor.id)) {
    throw new AppError(403, 'Bu takıma erişim yetkiniz yok', 'FORBIDDEN');
  }
  return {
    ...toSummary(team),
    members: team.members.map((member) => ({
      userId: member.userId,
      displayId: member.user.displayId,
      fullName: member.user.fullName,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
    taskCount: team._count.tasks,
  };
}

export async function searchMemberCandidates(
  db: TenantDb,
  teamId: string,
  query: string,
  actor: Actor,
): Promise<TeamMemberCandidate[]> {
  await assertCanManageTeam(db, actor, teamId);
  const tenantId = requireTenant(actor);
  const normalizedQuery = query.trim();
  const normalizedDisplayIdQuery = normalizedQuery.replace(/^#?TF-/i, '').toUpperCase();

  const users = await db.user.findMany({
    where: {
      tenantId,
      teamMembers: { none: { teamId } },
      OR: [
        {
          displayId: {
            contains: normalizedDisplayIdQuery || normalizedQuery,
            mode: 'insensitive',
          },
        },
        { email: { contains: normalizedQuery, mode: 'insensitive' } },
        { fullName: { contains: normalizedQuery, mode: 'insensitive' } },
      ],
    },
    select: { id: true, displayId: true, email: true, fullName: true, avatarUrl: true },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    take: 20,
  });

  return users;
}

export async function addMemberByDisplayId(
  db: TenantDb,
  teamId: string,
  displayId: string,
  actor: Actor,
): Promise<TeamMemberInfo> {
  await assertCanManageTeam(db, actor, teamId);
  if (!actor.tenantId) {
    throw new AppError(403, 'Bu işlem için bir şirkete dahil olmalısınız', 'NO_TENANT');
  }
  const user = await db.user.findFirst({
    where: {
      displayId,
      tenantId: actor.tenantId,
    },
    select: { id: true, displayId: true, fullName: true, avatarUrl: true, tenantId: true },
  });
  if (!user) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');

  const existing = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: user.id } },
  });
  if (existing) throw new AppError(409, 'Bu kullanıcı zaten takım üyesi', 'CONFLICT_MEMBER');

  const member = await db.teamMember.create({
    data: { teamId, userId: user.id, role: 'member' },
    include: { user: { select: { displayId: true, fullName: true, avatarUrl: true } } },
  });
  return {
    userId: member.userId,
    displayId: member.user.displayId,
    fullName: member.user.fullName,
    avatarUrl: member.user.avatarUrl,
    role: member.role,
    joinedAt: member.joinedAt,
  };
}

export async function removeMember(
  db: TenantDb,
  teamId: string,
  userId: string,
  actor: Actor,
): Promise<void> {
  await assertCanManageTeam(db, actor, teamId);
  const member = await db.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
  if (!member) throw new AppError(404, 'Üye bulunamadı', 'NOT_FOUND');

  const activeAssignment = await db.taskAssignee.findFirst({
    where: {
      userId,
      task: {
        teamId,
        OR: [{ status: { not: 'done' } }, { pendingStatus: { not: null } }],
      },
    },
    select: { taskId: true },
  });
  if (activeAssignment) {
    throw new AppError(
      409,
      'Üyeyi çıkarmadan önce aktif görevlerini yeniden atayın ve bekleyen status tekliflerini tamamlayın veya iptal edin.',
      'MEMBER_HAS_ACTIVE_TASKS',
    );
  }
  await db.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
}

export async function updateTeamMemberRole(
  db: TenantDb,
  teamId: string,
  userId: string,
  input: UpdateTeamMemberRoleInput,
  actor: Actor,
): Promise<TeamMemberInfo> {
  await assertCanManageTeam(db, actor, teamId);
  if (!isCompanyAdmin(actor)) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }

  const member = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    include: { user: { select: { displayId: true, fullName: true, avatarUrl: true } } },
  });
  if (!member) throw new AppError(404, 'Üye bulunamadı', 'NOT_FOUND');

  const updated = await db.teamMember.update({
    where: { teamId_userId: { teamId, userId } },
    data: { role: input.role },
    include: { user: { select: { displayId: true, fullName: true, avatarUrl: true } } },
  });
  return {
    userId: updated.userId,
    displayId: updated.user.displayId,
    fullName: updated.user.fullName,
    avatarUrl: updated.user.avatarUrl,
    role: updated.role,
    joinedAt: updated.joinedAt,
  };
}
