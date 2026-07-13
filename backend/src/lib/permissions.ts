import type { UserRole, TeamMemberRole } from '@prisma/client';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';

export type Actor = {
  id: string;
  role: UserRole;
  tenantId: string | null;
};

/** Tenant atanmamış user için ortak guard. Şirket-bağımlı tüm işlemlerde çağrılır. */
export function requireTenant(actor: Actor): string {
  if (actor.tenantId === null) {
    throw new AppError(403, 'Bu işlem için bir şirkete dahil olmalısınız', 'NO_TENANT');
  }
  return actor.tenantId;
}

export function isCompanyAdmin(actor: Actor): boolean {
  return actor.role === 'companyAdmin';
}

/** Verilen takımdaki actor rolünü döner (null = üye değil). */
export async function getTeamRole(teamId: string, userId: string): Promise<TeamMemberRole | null> {
  const m = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

/** Tenant + takım üyeliği kontrolü. Cross-tenant → 404 (bilgi sızıntısı önlemi). */
export async function loadTeamForActor(
  teamId: string,
  actor: Actor,
): Promise<{ id: string; tenantId: string }> {
  const tenantId = requireTenant(actor);
  const team = await prisma.team.findFirst({
    where: { id: teamId, tenantId },
    select: { id: true, tenantId: true },
  });
  if (!team) throw new AppError(404, 'Takım bulunamadı', 'NOT_FOUND');
  return team;
}

/** Actor bu takımda admin mi? (companyAdmin her zaman geçer.) */
export async function isTeamAdminOf(actor: Actor, teamId: string): Promise<boolean> {
  if (isCompanyAdmin(actor)) return true;
  const role = await getTeamRole(teamId, actor.id);
  return role === 'teamAdmin';
}

/** Actor bu takımın üyesi mi? (companyAdmin her zaman geçer.) */
export async function isTeamMemberOf(actor: Actor, teamId: string): Promise<boolean> {
  if (isCompanyAdmin(actor)) return true;
  const role = await getTeamRole(teamId, actor.id);
  return role !== null;
}

// ─── Task permission helpers ────────────────────────────────────────────

export type TaskForPerm = {
  id: string;
  teamId: string;
  assignerId: string;
  assigneeId: string;
};

/** Görev oluşturma: companyAdmin veya hedef takımın teamAdmin'i. */
export async function assertCanCreateTask(actor: Actor, teamId: string): Promise<void> {
  if (!(await isTeamAdminOf(actor, teamId))) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }
}

/** Görev görüntüleme: companyAdmin, takım üyesi. Cross-tenant → 404. */
export async function assertCanViewTask(
  actor: Actor,
  task: TaskForPerm & { team: { tenantId: string } },
): Promise<void> {
  const tenantId = requireTenant(actor);
  if (task.team.tenantId !== tenantId) {
    throw new AppError(404, 'Görev bulunamadı', 'NOT_FOUND');
  }
  if (!(await isTeamMemberOf(actor, task.teamId))) {
    throw new AppError(403, 'Bu göreve erişim yetkiniz yok', 'FORBIDDEN');
  }
}

/** Görev durumu güncelleme: assignee, teamAdmin veya companyAdmin. */
export async function assertCanUpdateTaskStatus(actor: Actor, task: TaskForPerm): Promise<void> {
  if (task.assigneeId === actor.id) return;
  if (await isTeamAdminOf(actor, task.teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

/** Görev önceliği güncelleme: yalnız teamAdmin veya companyAdmin. */
export async function assertCanUpdateTaskPriority(actor: Actor, task: TaskForPerm): Promise<void> {
  if (await isTeamAdminOf(actor, task.teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

/** Genel alan güncelleme (title/description/deadline/assignee): assigner, teamAdmin veya companyAdmin. */
export async function assertCanUpdateTaskFields(actor: Actor, task: TaskForPerm): Promise<void> {
  if (task.assignerId === actor.id) return;
  if (await isTeamAdminOf(actor, task.teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

/** Görev silme: yalnız teamAdmin veya companyAdmin. */
export async function assertCanDeleteTask(actor: Actor, task: TaskForPerm): Promise<void> {
  if (await isTeamAdminOf(actor, task.teamId)) return;
  throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
}

/** Yorum ekleme/listeleme: takım üyesi veya companyAdmin. */
export async function assertCanCommentOnTask(
  actor: Actor,
  task: TaskForPerm & { team: { tenantId: string } },
): Promise<void> {
  await assertCanViewTask(actor, task);
}
