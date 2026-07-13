import type { AuthUser } from '../stores/authStore';
import type { Task } from '../hooks/tasks';

/** Kullanıcı şirket admin'i mi (tenant genelinde tam yetki). */
export function isCompanyAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === 'companyAdmin';
}

/** Kullanıcı bu takımda admin mi? Backend TeamMember.role'a göre yetki verir;
 * frontend'de takım-üyelik bilgisi yoksa sadece companyAdmin sayılır. */
export function canManageTaskInTeam(
  user: AuthUser | null | undefined,
  _task: Pick<Task, 'teamId' | 'assignerId' | 'assigneeId'>,
  isTeamAdminOfThisTeam: boolean,
): boolean {
  if (!user) return false;
  if (isCompanyAdmin(user)) return true;
  return isTeamAdminOfThisTeam;
}

/** Kullanıcı bu görevin durumunu değiştirebilir mi? */
export function canUpdateTaskStatus(
  user: AuthUser | null | undefined,
  task: Pick<Task, 'assigneeId'>,
  isTeamAdminOfThisTeam: boolean,
): boolean {
  if (!user) return false;
  if (isCompanyAdmin(user)) return true;
  if (task.assigneeId === user.id) return true;
  return isTeamAdminOfThisTeam;
}

/** Kullanıcı bu görevin önceliğini değiştirebilir mi? */
export function canUpdateTaskPriority(
  user: AuthUser | null | undefined,
  _task: Pick<Task, 'teamId'>,
  isTeamAdminOfThisTeam: boolean,
): boolean {
  if (!user) return false;
  if (isCompanyAdmin(user)) return true;
  return isTeamAdminOfThisTeam;
}

/** Kullanıcı bu görevi silebilir mi? */
export function canDeleteTask(
  user: AuthUser | null | undefined,
  _task: Pick<Task, 'teamId'>,
  isTeamAdminOfThisTeam: boolean,
): boolean {
  if (!user) return false;
  if (isCompanyAdmin(user)) return true;
  return isTeamAdminOfThisTeam;
}

/** Kullanıcı bu göreve yorum yapabilir mi? Takım üyesi veya admin. */
export function canCommentOnTask(
  user: AuthUser | null | undefined,
  _task: Pick<Task, 'teamId'>,
  isTeamMemberOfThisTeam: boolean,
): boolean {
  if (!user) return false;
  if (isCompanyAdmin(user)) return true;
  return isTeamMemberOfThisTeam;
}
