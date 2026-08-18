import type { TenantDb } from '../db/types';
import { AppError } from '../middleware/errorHandler';
import { isCompanyAdmin, requireTenant, type Actor } from '../lib/permissions';
import type {
  AddCompanyUserInput,
  UpdateCompanyPermissionsInput,
  UpdateCompanyRoleInput,
} from '../schemas/users.schema';

export type CompanyUser = {
  id: string;
  displayId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: 'member' | 'companyAdmin';
  teamRoles: Array<{ teamId: string; teamName: string; role: 'member' | 'teamAdmin' }>;
};

function companyUserSelect(tenantId: string) {
  return {
    id: true,
    displayId: true,
    email: true,
    fullName: true,
    avatarUrl: true,
    role: true,
    teamMembers: {
      where: { team: { tenantId } },
      select: {
        teamId: true,
        role: true,
        team: { select: { id: true, name: true } },
      },
    },
  } as const;
}

function toCompanyUser(user: {
  id: string;
  displayId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: 'member' | 'companyAdmin';
  teamMembers: Array<{
    teamId: string;
    role: 'member' | 'teamAdmin';
    team: { id: string; name: string };
  }>;
}): CompanyUser {
  return {
    id: user.id,
    displayId: user.displayId,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    teamRoles: user.teamMembers.map((member) => ({
      teamId: member.teamId,
      teamName: member.team.name,
      role: member.role,
    })),
  };
}

export function assertCompanyAdmin(actor: Actor): string {
  if (!isCompanyAdmin(actor)) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }
  return requireTenant(actor);
}

export async function listCompanyUsers(db: TenantDb, actor: Actor): Promise<CompanyUser[]> {
  const tenantId = assertCompanyAdmin(actor);
  const users = await db.user.findMany({
    where: { tenantId },
    select: companyUserSelect(tenantId),
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
  });
  return users.map(toCompanyUser);
}

export async function addCompanyUser(
  db: TenantDb,
  actor: Actor,
  input: AddCompanyUserInput,
): Promise<CompanyUser> {
  const tenantId = assertCompanyAdmin(actor);
  const claimed = await db.user.updateMany({
    where: { displayId: input.displayId, tenantId: null },
    data: { tenantId, role: 'member' },
  });

  if (claimed.count === 1) {
    const user = await db.user.findFirst({
      where: { displayId: input.displayId, tenantId },
      select: {
        id: true,
        displayId: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        role: true,
      },
    });
    if (!user) throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
    return toCompanyUser({ ...user, teamMembers: [] });
  }

  const existing = await db.user.findFirst({
    where: { displayId: input.displayId, tenantId },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(409, 'Kullanıcı zaten bu şirkette', 'USER_ALREADY_IN_COMPANY');
  }
  throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
}

export async function updateCompanyRole(
  db: TenantDb,
  userId: string,
  input: UpdateCompanyRoleInput,
  actor: Actor,
): Promise<CompanyUser> {
  const tenantId = assertCompanyAdmin(actor);
  if (actor.id === userId) {
    throw new AppError(403, 'Kendi rolünüz değiştirilemez', 'SELF_ROLE_CHANGE_FORBIDDEN');
  }

  const target = await db.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true },
  });
  if (!target) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');

  const updated = await db.user.update({
    where: { id: target.id },
    data: { role: input.role },
    select: companyUserSelect(tenantId),
  });
  return toCompanyUser(updated);
}

export async function updateCompanyPermissions(
  db: TenantDb,
  userId: string,
  input: UpdateCompanyPermissionsInput,
  actor: Actor,
): Promise<CompanyUser> {
  const tenantId = assertCompanyAdmin(actor);
  if (actor.id === userId) {
    throw new AppError(403, 'Kendi rolünüz değiştirilemez', 'SELF_ROLE_CHANGE_FORBIDDEN');
  }

  const target = await db.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true },
  });
  if (!target) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');

  const teamIds = input.teamRoles.map((teamRole) => teamRole.teamId);
  const teams = await db.team.findMany({
    where: { tenantId, id: { in: teamIds } },
    select: { id: true },
  });
  if (teams.length !== teamIds.length) {
    throw new AppError(404, 'Takım bulunamadı', 'NOT_FOUND');
  }

  await db.user.update({
    where: { id: target.id },
    data: { role: input.role },
  });

  await db.teamMember.deleteMany({
    where: {
      userId: target.id,
      team: { tenantId },
      teamId: { notIn: teamIds },
    },
  });

  for (const teamRole of input.teamRoles) {
    await db.teamMember.upsert({
      where: { teamId_userId: { teamId: teamRole.teamId, userId: target.id } },
      create: { teamId: teamRole.teamId, userId: target.id, role: teamRole.role },
      update: { role: teamRole.role },
    });
  }

  const updated = await db.user.findFirst({
    where: { id: target.id, tenantId },
    select: companyUserSelect(tenantId),
  });
  if (!updated) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
  return toCompanyUser(updated);
}
