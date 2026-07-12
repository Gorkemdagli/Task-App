import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import type { CreateTeamInput } from '../schemas/teams.schema';
import type { TeamMemberRole, UserRole } from '@prisma/client';

type ActorUser = {
  id: string;
  role: UserRole;
  tenantId: string;
};

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

function isCompanyAdmin(actor: ActorUser): boolean {
  return actor.role === 'companyAdmin';
}

/**
 * Yeni takım oluşturur. Yalnızca companyAdmin. Takım tenant'a bağlanır.
 */
export async function createTeam(input: CreateTeamInput, actor: ActorUser): Promise<TeamSummary> {
  if (!isCompanyAdmin(actor)) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }
  const team = await prisma.team.create({
    data: {
      tenantId: actor.tenantId,
      name: input.name,
      description: input.description ?? null,
    },
    include: { _count: { select: { members: true } } },
  });
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    tenantId: team.tenantId,
    memberCount: team._count.members,
    createdAt: team.createdAt,
  };
}

/**
 * companyAdmin: tenant'ın tüm takımları. Diğerleri: yalnız üye oldukları takımlar.
 */
export async function listTeams(actor: ActorUser): Promise<TeamSummary[]> {
  const where = isCompanyAdmin(actor)
    ? { tenantId: actor.tenantId }
    : { tenantId: actor.tenantId, members: { some: { userId: actor.id } } };

  const teams = await prisma.team.findMany({
    where,
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    tenantId: t.tenantId,
    memberCount: t._count.members,
    createdAt: t.createdAt,
  }));
}

/**
 * Takım detayı. Tenant guard: cross-tenant → 404. Erişim: üye veya companyAdmin.
 * taskCount = tüm task'lar (FAZ-5'te status filtreleri eklenecek).
 */
export async function getTeam(teamId: string, actor: ActorUser): Promise<TeamDetail> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, tenantId: actor.tenantId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, displayId: true, fullName: true, avatarUrl: true },
          },
        },
        orderBy: { joinedAt: 'asc' },
      },
      _count: { select: { tasks: true } },
    },
  });
  if (!team) throw new AppError(404, 'Takım bulunamadı', 'NOT_FOUND');

  const isMember = team.members.some((m) => m.userId === actor.id);
  if (!isMember && !isCompanyAdmin(actor)) {
    throw new AppError(403, 'Bu takıma erişim yetkiniz yok', 'FORBIDDEN');
  }

  return {
    id: team.id,
    name: team.name,
    description: team.description,
    tenantId: team.tenantId,
    memberCount: team.members.length,
    createdAt: team.createdAt,
    members: team.members.map((m) => ({
      userId: m.userId,
      displayId: m.user.displayId,
      fullName: m.user.fullName,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    taskCount: team._count.tasks,
  };
}

/**
 * displayId ile takıma üye ekler. Yalnızca companyAdmin.
 * Cross-tenant koruması: eklenen user farklı tenant'taysa 404.
 */
export async function addMemberByDisplayId(
  teamId: string,
  displayId: string,
  actor: ActorUser,
): Promise<TeamMemberInfo> {
  if (!isCompanyAdmin(actor)) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, tenantId: actor.tenantId },
    select: { id: true },
  });
  if (!team) throw new AppError(404, 'Takım bulunamadı', 'NOT_FOUND');

  const user = await prisma.user.findUnique({
    where: { displayId },
    select: {
      id: true,
      displayId: true,
      fullName: true,
      avatarUrl: true,
      tenantId: true,
    },
  });
  if (!user || user.tenantId !== actor.tenantId) {
    throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
  }

  const existing = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: user.id } },
  });
  if (existing) {
    throw new AppError(409, 'Bu kullanıcı zaten takım üyesi', 'CONFLICT_MEMBER');
  }

  const member = await prisma.teamMember.create({
    data: { teamId, userId: user.id, role: 'member' },
    include: {
      user: { select: { displayId: true, fullName: true, avatarUrl: true } },
    },
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

/**
 * Takımdan üye çıkarır. Yalnızca companyAdmin. Son admin'i çıkarmaya izin verilir (YAGNI: min-member guard).
 */
export async function removeMember(
  teamId: string,
  userId: string,
  actor: ActorUser,
): Promise<void> {
  if (!isCompanyAdmin(actor)) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, tenantId: actor.tenantId },
    select: { id: true },
  });
  if (!team) throw new AppError(404, 'Takım bulunamadı', 'NOT_FOUND');

  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!member) {
    throw new AppError(404, 'Üye bulunamadı', 'NOT_FOUND');
  }

  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId } },
  });
}
