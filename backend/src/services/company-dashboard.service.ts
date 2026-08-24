import { Prisma } from '@prisma/client';
import type { TenantDb } from '../db/types';
import { AppError } from '../lib/appError';
import { isCompanyAdmin, requireTenant, type Actor } from '../lib/permissions';
import { startOfUtcToday } from '../lib/calendarDate';

const MEMBER_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CountAndPercentage = {
  count: number;
  percentage: number;
};

export type CompanyDashboard = {
  scope: { teamId: string | null; teamName: string | null };
  summary: {
    totalUserCount: number;
    totalTaskCount: number;
    openTaskCount: number;
    completedTaskCount: number;
    expiredTaskCount: number;
    completionRate: number;
  };
  risk: {
    overdueTaskCount: number;
    dueNextSevenDaysTaskCount: number;
    pendingApprovalTaskCount: number;
    expiredTaskCount: number;
  };
  statusBreakdown: {
    total: number;
    todo: CountAndPercentage;
    inProgress: CountAndPercentage;
    done: CountAndPercentage;
  };
  priorityBreakdown: {
    total: number;
    low: CountAndPercentage;
    medium: CountAndPercentage;
    high: CountAndPercentage;
  };
  members: {
    items: Array<{
      userId: string;
      fullName: string;
      assignedTaskCount: number;
      openTaskCount: number;
      completedTaskCount: number;
      expiredTaskCount: number;
      completionRate: number;
    }>;
    totalCount: number;
    returnedCount: number;
    capped: boolean;
  };
  teams: Array<{
    teamId: string;
    teamName: string;
    totalTaskCount: number;
    openTaskCount: number;
    completedTaskCount: number;
    expiredTaskCount: number;
    completionRate: number;
  }>;
};

export type CompanyDashboardFilters = { teamId?: string };

type Numeric = bigint | number;

type SummaryRow = {
  total_task_count: Numeric;
  open_task_count: Numeric;
  completed_task_count: Numeric;
  expired_task_count: Numeric;
  overdue_task_count: Numeric;
  due_next_seven_days_task_count: Numeric;
  pending_approval_task_count: Numeric;
  status_total: Numeric;
  status_todo: Numeric;
  status_in_progress: Numeric;
  status_done: Numeric;
  priority_total: Numeric;
  priority_low: Numeric;
  priority_medium: Numeric;
  priority_high: Numeric;
};

type MemberRow = {
  user_id: string;
  full_name: string;
  assigned_task_count: Numeric;
  open_task_count: Numeric;
  completed_task_count: Numeric;
  expired_task_count: Numeric;
  total_user_count: Numeric;
};

type TeamRow = {
  team_id: string;
  team_name: string;
  total_task_count: Numeric;
  open_task_count: Numeric;
  completed_task_count: Numeric;
  expired_task_count: Numeric;
};

function asNumber(value: Numeric): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100)));
}

function countAndPercentage(value: Numeric, total: number): CountAndPercentage {
  const count = asNumber(value);
  return { count, percentage: percentage(count, total) };
}

function mapMember(row: MemberRow) {
  const assignedTaskCount = asNumber(row.assigned_task_count);
  const completedTaskCount = asNumber(row.completed_task_count);
  return {
    userId: row.user_id,
    fullName: row.full_name,
    assignedTaskCount,
    openTaskCount: asNumber(row.open_task_count),
    completedTaskCount,
    expiredTaskCount: asNumber(row.expired_task_count),
    completionRate: percentage(completedTaskCount, assignedTaskCount),
  };
}

const summaryQuery = (
  tenantId: string,
  taskScope: Prisma.Sql,
  archiveCutoff: Date,
  today: Date,
  dueSoonExclusiveEnd: Date,
) => Prisma.sql`
  SELECT
    COUNT(task.id) AS total_task_count,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status IN ('todo', 'in_progress')
    ) AS open_task_count,
    COUNT(task.id) FILTER (WHERE task.status = 'done') AS completed_task_count,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NOT NULL
        AND task.status IN ('todo', 'in_progress')
        AND task.deadline <= ${archiveCutoff}
    ) AS expired_task_count,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status <> 'done'
        AND task.deadline < ${today}
    ) AS overdue_task_count,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status <> 'done'
        AND task.deadline >= ${today}
        AND task.deadline < ${dueSoonExclusiveEnd}
    ) AS due_next_seven_days_task_count,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.pending_status IS NOT NULL
    ) AS pending_approval_task_count,
    COUNT(task.id) FILTER (WHERE task.archived_at IS NULL) AS status_total,
    COUNT(task.id) FILTER (WHERE task.archived_at IS NULL AND task.status = 'todo') AS status_todo,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL AND task.status = 'in_progress'
    ) AS status_in_progress,
    COUNT(task.id) FILTER (WHERE task.archived_at IS NULL AND task.status = 'done') AS status_done,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status IN ('todo', 'in_progress')
    ) AS priority_total,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status IN ('todo', 'in_progress')
        AND task.priority = 'low'
    ) AS priority_low,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status IN ('todo', 'in_progress')
        AND task.priority = 'medium'
    ) AS priority_medium,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status IN ('todo', 'in_progress')
        AND task.priority = 'high'
    ) AS priority_high
  FROM tasks task
  JOIN teams team ON team.id = task.team_id
  WHERE team.tenant_id = ${tenantId}::uuid
    ${taskScope}
`;

const memberQuery = (tenantId: string, teamId: string | null, archiveCutoff: Date) => Prisma.sql`
  WITH scoped_users AS (
    SELECT u.id, u.full_name
    FROM users u
    WHERE u.tenant_id = ${tenantId}::uuid
      AND (
        ${teamId}::uuid IS NULL
        OR EXISTS (
          SELECT 1
          FROM team_members tm
          JOIN teams membership_team ON membership_team.id = tm.team_id
          WHERE tm.user_id = u.id
            AND tm.team_id = ${teamId}::uuid
            AND membership_team.tenant_id = ${tenantId}::uuid
        )
      )
  )
  SELECT
    scoped_users.id AS user_id,
    scoped_users.full_name,
    COUNT(DISTINCT task.id) AS assigned_task_count,
    COUNT(DISTINCT task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status IN ('todo', 'in_progress')
    ) AS open_task_count,
    COUNT(DISTINCT task.id) FILTER (WHERE task.status = 'done') AS completed_task_count,
    COUNT(DISTINCT task.id) FILTER (
      WHERE task.archived_at IS NOT NULL
        AND task.status IN ('todo', 'in_progress')
        AND task.deadline <= ${archiveCutoff}
    ) AS expired_task_count,
    COUNT(*) OVER () AS total_user_count
  FROM scoped_users
  LEFT JOIN task_assignees assignment ON assignment.user_id = scoped_users.id
  LEFT JOIN tasks task
    ON task.id = assignment.task_id
    AND (${teamId}::uuid IS NULL OR task.team_id = ${teamId}::uuid)
  LEFT JOIN teams task_team
    ON task_team.id = task.team_id
    AND task_team.tenant_id = ${tenantId}::uuid
  WHERE task.id IS NULL OR task_team.id IS NOT NULL
  GROUP BY scoped_users.id, scoped_users.full_name
  ORDER BY scoped_users.full_name ASC, scoped_users.id ASC
  LIMIT ${MEMBER_LIMIT}
`;

const teamQuery = (tenantId: string, archiveCutoff: Date) => Prisma.sql`
  SELECT
    team.id AS team_id,
    team.name AS team_name,
    COUNT(task.id) AS total_task_count,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status IN ('todo', 'in_progress')
    ) AS open_task_count,
    COUNT(task.id) FILTER (WHERE task.status = 'done') AS completed_task_count,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NOT NULL
        AND task.status IN ('todo', 'in_progress')
        AND task.deadline <= ${archiveCutoff}
    ) AS expired_task_count
  FROM teams team
  LEFT JOIN tasks task ON task.team_id = team.id
  WHERE team.tenant_id = ${tenantId}::uuid
  GROUP BY team.id, team.name
  ORDER BY team.name ASC, team.id ASC
`;

export async function getCompanyDashboard(
  db: TenantDb,
  actor: Actor,
  filters: CompanyDashboardFilters,
  now = new Date(),
): Promise<CompanyDashboard> {
  if (!isCompanyAdmin(actor)) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }
  const tenantId = requireTenant(actor);

  const team = filters.teamId
    ? await db.team.findFirst({
        where: { id: filters.teamId, tenantId },
        select: { id: true, name: true },
      })
    : null;

  if (filters.teamId && !team) {
    throw new AppError(404, 'Takım bulunamadı', 'NOT_FOUND');
  }

  const today = startOfUtcToday(now);
  const archiveCutoff = new Date(today.getTime() - 7 * DAY_MS);
  const dueSoonExclusiveEnd = new Date(today.getTime() + 8 * DAY_MS);
  const taskScope = team ? Prisma.sql`AND task.team_id = ${team.id}::uuid` : Prisma.empty;
  const teamId = team?.id ?? null;

  const [summaryRows, memberRows] = await Promise.all([
    db.$queryRaw<SummaryRow[]>(
      summaryQuery(tenantId, taskScope, archiveCutoff, today, dueSoonExclusiveEnd),
    ),
    db.$queryRaw<MemberRow[]>(memberQuery(tenantId, teamId, archiveCutoff)),
  ]);

  const summary = summaryRows[0];
  if (!summary) {
    throw new AppError(500, 'Şirket dashboard verisi oluşturulamadı', 'DASHBOARD_QUERY_FAILED');
  }

  const totalUserCount = memberRows.length > 0 ? asNumber(memberRows[0].total_user_count) : 0;
  const memberItems = memberRows.slice(0, MEMBER_LIMIT).map(mapMember);
  const totalTaskCount = asNumber(summary.total_task_count);
  const completedTaskCount = asNumber(summary.completed_task_count);
  const statusTotal = asNumber(summary.status_total);
  const priorityTotal = asNumber(summary.priority_total);

  let teams: CompanyDashboard['teams'] = [];
  if (!filters.teamId) {
    const teamRows = await db.$queryRaw<TeamRow[]>(teamQuery(tenantId, archiveCutoff));
    teams = teamRows.map((row) => {
      const total = asNumber(row.total_task_count);
      const completed = asNumber(row.completed_task_count);
      return {
        teamId: row.team_id,
        teamName: row.team_name,
        totalTaskCount: total,
        openTaskCount: asNumber(row.open_task_count),
        completedTaskCount: completed,
        expiredTaskCount: asNumber(row.expired_task_count),
        completionRate: percentage(completed, total),
      };
    });
  }

  return {
    scope: { teamId: team?.id ?? null, teamName: team?.name ?? null },
    summary: {
      totalUserCount,
      totalTaskCount,
      openTaskCount: asNumber(summary.open_task_count),
      completedTaskCount,
      expiredTaskCount: asNumber(summary.expired_task_count),
      completionRate: percentage(completedTaskCount, totalTaskCount),
    },
    risk: {
      overdueTaskCount: asNumber(summary.overdue_task_count),
      dueNextSevenDaysTaskCount: asNumber(summary.due_next_seven_days_task_count),
      pendingApprovalTaskCount: asNumber(summary.pending_approval_task_count),
      expiredTaskCount: asNumber(summary.expired_task_count),
    },
    statusBreakdown: {
      total: statusTotal,
      todo: countAndPercentage(summary.status_todo, statusTotal),
      inProgress: countAndPercentage(summary.status_in_progress, statusTotal),
      done: countAndPercentage(summary.status_done, statusTotal),
    },
    priorityBreakdown: {
      total: priorityTotal,
      low: countAndPercentage(summary.priority_low, priorityTotal),
      medium: countAndPercentage(summary.priority_medium, priorityTotal),
      high: countAndPercentage(summary.priority_high, priorityTotal),
    },
    members: {
      items: memberItems,
      totalCount: totalUserCount,
      returnedCount: memberItems.length,
      capped: totalUserCount > memberItems.length,
    },
    teams,
  };
}
