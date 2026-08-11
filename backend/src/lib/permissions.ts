import type { TaskStatus, UserRole, TeamMemberRole } from '@prisma/client';
import type { TenantDb } from '../db/types';
import { AppError } from '../middleware/errorHandler';

export type Actor = {
  id: string;
  role: UserRole;
  tenantId: string | null;
};

export function requireTenant(actor: Actor): string {
  if (actor.tenantId === null) {
    throw new AppError(403, 'Bu işlem için bir şirkete dahil olmalısınız', 'NO_TENANT');
  }
  return actor.tenantId;
}

export function isCompanyAdmin(actor: Actor): boolean {
  return actor.role === 'companyAdmin';
}

export async function getTeamRole(
  db: TenantDb,
  teamId: string,
  userId: string,
): Promise<TeamMemberRole | null> {
  const member = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

export async function loadTeamForActor(
  db: TenantDb,
  actor: Actor,
  teamId: string,
): Promise<{ id: string; tenantId: string }> {
  const team = await db.team.findFirst({
    where: { id: teamId, tenantId: requireTenant(actor) },
    select: { id: true, tenantId: true },
  });
  if (!team) throw new AppError(404, 'Takım bulunamadı', 'NOT_FOUND');
  return team;
}

export async function isTeamAdminOf(db: TenantDb, actor: Actor, teamId: string): Promise<boolean> {
  if (isCompanyAdmin(actor)) return true;
  const role = await getTeamRole(db, teamId, actor.id);
  return role === 'teamAdmin';
}

export async function isTeamMemberOf(db: TenantDb, actor: Actor, teamId: string): Promise<boolean> {
  if (isCompanyAdmin(actor)) return true;
  const role = await getTeamRole(db, teamId, actor.id);
  return role !== null;
}

export type TaskForPerm = {
  id: string;
  teamId: string;
  assignerId: string;
  assignees: Array<{ userId: string }>;
  pendingStatus: TaskStatus | null;
  pendingProposedBy: string | null;
};

export async function assertCanCreateTask(
  db: TenantDb,
  actor: Actor,
  teamId: string,
): Promise<void> {
  await loadTeamForActor(db, actor, teamId);
  if (!(await isTeamAdminOf(db, actor, teamId))) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }
}

export async function assertCanViewTask(
  db: TenantDb,
  actor: Actor,
  task: TaskForPerm & { team: { tenantId: string } },
): Promise<void> {
  if (task.team.tenantId !== requireTenant(actor)) {
    throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  }
  if (!(await isTeamMemberOf(db, actor, task.teamId))) {
    throw new AppError(403, 'Bu göreve erişim yetkiniz yok', 'FORBIDDEN');
  }
}

async function assertCurrentTeamMember(db: TenantDb, actor: Actor, teamId: string): Promise<void> {
  if (!(await isTeamMemberOf(db, actor, teamId))) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }
}

export async function assertCanUpdateTaskStatus(
  db: TenantDb,
  actor: Actor,
  task: TaskForPerm,
): Promise<void> {
  await assertCurrentTeamMember(db, actor, task.teamId);
  if (task.assignees.some((assignee) => assignee.userId === actor.id)) return;
  if (await isTeamAdminOf(db, actor, task.teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

export async function assertCanProposeTaskStatus(
  db: TenantDb,
  actor: Actor,
  task: TaskForPerm,
): Promise<void> {
  await assertCurrentTeamMember(db, actor, task.teamId);
  if (task.assignees.some((assignee) => assignee.userId === actor.id)) return;
  if (await isTeamAdminOf(db, actor, task.teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

export async function assertCanAckTaskStatus(
  db: TenantDb,
  actor: Actor,
  task: TaskForPerm,
): Promise<void> {
  await assertCurrentTeamMember(db, actor, task.teamId);
  if (task.assignees.some((assignee) => assignee.userId === actor.id)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

export async function assertCanCancelTaskStatus(
  db: TenantDb,
  actor: Actor,
  task: TaskForPerm,
): Promise<void> {
  if (task.pendingProposedBy === actor.id) return;
  if (await isTeamAdminOf(db, actor, task.teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

export async function assertCanUpdateTaskPriority(
  db: TenantDb,
  actor: Actor,
  task: TaskForPerm,
): Promise<void> {
  if (await isTeamAdminOf(db, actor, task.teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

export async function assertCanUpdateTaskFields(
  db: TenantDb,
  actor: Actor,
  task: TaskForPerm,
): Promise<void> {
  if (task.assignerId === actor.id) return;
  if (await isTeamAdminOf(db, actor, task.teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

export async function assertCanDeleteTask(
  db: TenantDb,
  actor: Actor,
  task: TaskForPerm,
): Promise<void> {
  if (await isTeamAdminOf(db, actor, task.teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

export async function assertCanManageTeam(
  db: TenantDb,
  actor: Actor,
  teamId: string,
): Promise<void> {
  await loadTeamForActor(db, actor, teamId);
  if (await isTeamAdminOf(db, actor, teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

export async function assertCanCommentOnTask(
  db: TenantDb,
  actor: Actor,
  task: TaskForPerm & { team: { tenantId: string } },
): Promise<void> {
  await assertCanViewTask(db, actor, task);
}
