import { AppError } from '../middleware/errorHandler';
import { assertCanManageTeam, isCompanyAdmin, type Actor } from '../lib/permissions';
import type { TenantDb } from '../db/types';
import type { CreateTeamInput } from '../schemas/teams.schema';
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
      OR: [{ tenantId: actor.tenantId }, { tenantId: null }],
    },
    select: { id: true, displayId: true, fullName: true, avatarUrl: true, tenantId: true },
  });
  if (!user) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');

  if (user.tenantId === null) {
    await db.user.update({ where: { id: user.id }, data: { tenantId: actor.tenantId } });
  }

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
  await db.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
}
