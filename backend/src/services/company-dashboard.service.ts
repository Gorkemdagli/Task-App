import { Prisma } from '@prisma/client';
import type { TenantDb } from '../db/types';
import { AppError } from '../lib/appError';
import { getTeamRole, isCompanyAdmin, requireTenant, type Actor } from '../lib/permissions';
import { formatCalendarDate, startOfUtcToday } from '../lib/calendarDate';

const MEMBER_LIMIT = 100;
const RISK_TASK_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE = '30d' as const;
const HEALTH_MIN_SAMPLE_SIZE = 5;
const HEALTH_THRESHOLDS = {
  overdueAtRisk: 20,
  overdueOffTrack: 35,
  blockedAtRisk: 15,
  blockedOffTrack: 25,
} as const;

export const COMPANY_DASHBOARD_RANGES = ['7d', '30d', '90d'] as const;
export type CompanyDashboardRange = (typeof COMPANY_DASHBOARD_RANGES)[number];

export type CountAndPercentage = {
  count: number;
  percentage: number;
};

export type DashboardComparison = {
  current: number;
  previous: number;
  delta: number;
  deltaPercentage: number;
};

export type DashboardPeriod = {
  range: CompanyDashboardRange;
  start: string;
  end: string;
};

export type DashboardScope = { teamId: string | null; teamName: string | null };

export type DashboardHealthStatus =
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'OFF_TRACK'
  | 'INSUFFICIENT_DATA';

export type DashboardHealthMetric =
  | 'completedTaskCount'
  | 'overdueRate'
  | 'blockedRate'
  | 'onTimeDeliveryRate'
  | 'agingWipOverThirty'
  | 'throughputBalance'
  | 'backlogChange';

export type DashboardHealthInsight = {
  metric: DashboardHealthMetric;
  observedValue: number | null;
  threshold: number;
  comparison: 'below' | 'at_or_above' | 'unavailable' | 'below_previous' | 'above_zero';
  message: string;
  period: DashboardPeriod;
  scope: DashboardScope;
};

export type DashboardHealth = {
  period: DashboardPeriod;
  scope: DashboardScope;
  status: DashboardHealthStatus;
  sampleSize: number;
  minimumSampleSize: number;
  explanation: string;
  insights: DashboardHealthInsight[];
};

export type DurationMetric = {
  unit: 'days';
  median: number | null;
  sampleSize: number;
};

export type CycleTimeMetric = DurationMetric & {
  p85: number | null;
};

export type AgingWipMetric = {
  unit: 'days';
  buckets: {
    zeroToThree: number;
    fourToSeven: number;
    eightToFourteen: number;
    fifteenToThirty: number;
    overThirty: number;
  };
  measuredCount: number;
  unknownCount: number;
  totalCount: number;
};

export type CompanyDashboardTrendPoint = {
  period: string;
  created: number;
  completed: number;
};

export type CompanyRiskTask = {
  id: string;
  title: string;
  team: { id: string; name: string };
  assignee: { id: string; fullName: string } | null;
  deadline: string | null;
  status: 'todo' | 'in_progress' | 'done';
};

export type CompanyDashboard = {
  period: DashboardPeriod;
  createdInPeriod: DashboardComparison;
  completedInPeriod: DashboardComparison;
  cycleTime: CycleTimeMetric;
  leadTime: DurationMetric;
  agingWip: AgingWipMetric;
  overdueRate: DashboardComparison;
  onTimeDeliveryRate: DashboardComparison;
  backlogChange: number;
  throughput: Array<{ period: string; count: number }>;
  createdVsCompleted: CompanyDashboardTrendPoint[];
  scope: DashboardScope;
  health: DashboardHealth;
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
    blockedTaskCount: number;
    blockedOverThreeDaysTaskCount: number;
    blockedRate: number;
  };
  riskTasks: {
    overdue: CompanyRiskTask[];
    dueNextSevenDays: CompanyRiskTask[];
    pendingApproval: CompanyRiskTask[];
    expired: CompanyRiskTask[];
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

export type CompanyDashboardFilters = {
  teamId?: string;
  range?: CompanyDashboardRange;
};

type Numeric = bigint | number;

type SummaryRow = {
  total_task_count: Numeric;
  open_task_count: Numeric;
  completed_task_count: Numeric;
  expired_task_count: Numeric;
  overdue_task_count: Numeric;
  due_next_seven_days_task_count: Numeric;
  pending_approval_task_count: Numeric;
  blocked_task_count: Numeric;
  blocked_over_three_days_task_count: Numeric;
  status_total: Numeric;
  status_todo: Numeric;
  status_in_progress: Numeric;
  status_done: Numeric;
  priority_total: Numeric;
  priority_low: Numeric;
  priority_medium: Numeric;
  priority_high: Numeric;
  current_created_task_count: Numeric;
  previous_created_task_count: Numeric;
  current_completed_task_count: Numeric;
  previous_completed_task_count: Numeric;
  current_deadline_completed_task_count: Numeric;
  current_on_time_task_count: Numeric;
  previous_deadline_completed_task_count: Numeric;
  previous_on_time_task_count: Numeric;
  cycle_time_median: Numeric | null;
  cycle_time_p85: Numeric | null;
  cycle_time_sample_count: Numeric;
  lead_time_median: Numeric | null;
  lead_time_sample_count: Numeric;
  aging_wip_0_3_count: Numeric;
  aging_wip_4_7_count: Numeric;
  aging_wip_8_14_count: Numeric;
  aging_wip_15_30_count: Numeric;
  aging_wip_30_plus_count: Numeric;
  aging_wip_unknown_count: Numeric;
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

type RiskTaskRow = {
  risk_type: 'overdue' | 'due_next_seven_days' | 'pending_approval' | 'expired';
  id: string;
  title: string;
  team_id: string;
  team_name: string;
  assignee_id: string | null;
  assignee_full_name: string | null;
  deadline: Date | null;
  status: 'todo' | 'in_progress' | 'done';
};

type TrendRow = {
  period: string | Date;
  created_count: Numeric;
  completed_count: Numeric;
};

function asNumber(value: Numeric | null | undefined): number {
  return typeof value === 'bigint' ? Number(value) : (value ?? 0);
}

function nullableNumber(value: Numeric | null | undefined): number | null {
  return value == null ? null : asNumber(value);
}

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100)));
}

function countAndPercentage(value: Numeric, total: number): CountAndPercentage {
  const count = asNumber(value);
  return { count, percentage: percentage(count, total) };
}

function comparison(current: number, previous: number): DashboardComparison {
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    deltaPercentage: previous === 0 ? 0 : Math.round((delta / Math.abs(previous)) * 100),
  };
}

function rangeConfig(range: CompanyDashboardRange | undefined) {
  const value = range ?? DEFAULT_RANGE;
  return { range: value, days: value === '7d' ? 7 : value === '90d' ? 90 : 30 };
}

function deriveHealth(
  period: DashboardPeriod,
  scope: DashboardScope,
  inputs: {
    completedTaskCount: number;
    overdueNumerator: number;
    overdueDenominator: number;
    blockedNumerator: number;
    blockedDenominator: number;
    currentOnTimeRate: number;
    previousOnTimeRate: number;
    currentOnTimeNumerator: number;
    currentOnTimeDenominator: number;
    previousOnTimeNumerator: number;
    previousOnTimeDenominator: number;
    agingWipOverThirty: number;
    backlogChange: number;
    createdVsCompleted: CompanyDashboardTrendPoint[];
  },
): DashboardHealth {
  const trace = { period, scope };
  const insufficientInsights: DashboardHealthInsight[] = [];
  if (inputs.completedTaskCount < HEALTH_MIN_SAMPLE_SIZE) {
    insufficientInsights.push({
      ...trace,
      metric: 'completedTaskCount',
      observedValue: inputs.completedTaskCount,
      threshold: HEALTH_MIN_SAMPLE_SIZE,
      comparison: 'below',
      message: `Örneklem yetersiz: ${inputs.completedTaskCount}/${HEALTH_MIN_SAMPLE_SIZE} tamamlanan görev.`,
    });
  }
  if (inputs.overdueDenominator <= 0) {
    insufficientInsights.push({
      ...trace,
      metric: 'overdueRate',
      observedValue: null,
      threshold: HEALTH_THRESHOLDS.overdueAtRisk,
      comparison: 'unavailable',
      message: 'Gecikme oranı için tamamlanan ve teslim tarihi olan görev bulunmuyor.',
    });
  }
  if (inputs.blockedDenominator <= 0) {
    insufficientInsights.push({
      ...trace,
      metric: 'blockedRate',
      observedValue: null,
      threshold: HEALTH_THRESHOLDS.blockedAtRisk,
      comparison: 'unavailable',
      message: 'Engel oranı için kapsamda görev bulunmuyor.',
    });
  }
  if (insufficientInsights.length > 0) {
    return {
      period,
      scope,
      status: 'INSUFFICIENT_DATA',
      sampleSize: inputs.completedTaskCount,
      minimumSampleSize: HEALTH_MIN_SAMPLE_SIZE,
      explanation: `Sağlık durumu üretilemedi: ${insufficientInsights.map((insight) => insight.message).join(' ')}`,
      insights: insufficientInsights,
    };
  }

  const insights: DashboardHealthInsight[] = [];
  const addRateInsight = (
    metric: 'overdueRate' | 'blockedRate',
    observedValue: number,
    numerator: number,
    denominator: number,
    label: string,
    atRiskThreshold: number,
    offTrackThreshold: number,
  ) => {
    const atOffTrack = numerator * 100 >= denominator * offTrackThreshold;
    const atRisk = numerator * 100 >= denominator * atRiskThreshold;
    const threshold = atOffTrack ? offTrackThreshold : atRisk ? atRiskThreshold : null;
    if (threshold === null) return;
    const status = threshold === offTrackThreshold ? 'OFF_TRACK' : 'AT_RISK';
    insights.push({
      ...trace,
      metric,
      observedValue,
      threshold,
      comparison: 'at_or_above',
      message: `${label} %${observedValue}; ${status} eşiği olan %${threshold} seviyesinde veya üzerinde.`,
    });
  };

  addRateInsight(
    'overdueRate',
    percentage(inputs.overdueNumerator, inputs.overdueDenominator),
    inputs.overdueNumerator,
    inputs.overdueDenominator,
    'Gecikme oranı',
    HEALTH_THRESHOLDS.overdueAtRisk,
    HEALTH_THRESHOLDS.overdueOffTrack,
  );
  addRateInsight(
    'blockedRate',
    percentage(inputs.blockedNumerator, inputs.blockedDenominator),
    inputs.blockedNumerator,
    inputs.blockedDenominator,
    'Engel oranı',
    HEALTH_THRESHOLDS.blockedAtRisk,
    HEALTH_THRESHOLDS.blockedOffTrack,
  );

  if (
    inputs.previousOnTimeDenominator > 0 &&
    inputs.currentOnTimeDenominator > 0 &&
    inputs.currentOnTimeNumerator * inputs.previousOnTimeDenominator <
      inputs.previousOnTimeNumerator * inputs.currentOnTimeDenominator
  ) {
    insights.push({
      ...trace,
      metric: 'onTimeDeliveryRate',
      observedValue: inputs.currentOnTimeRate,
      threshold: inputs.previousOnTimeRate,
      comparison: 'below_previous',
      message: `Zamanında teslim oranı %${inputs.currentOnTimeRate}; önceki dönem oranı %${inputs.previousOnTimeRate} seviyesinin altında.`,
    });
  }
  if (inputs.agingWipOverThirty > 0) {
    insights.push({
      ...trace,
      metric: 'agingWipOverThirty',
      observedValue: inputs.agingWipOverThirty,
      threshold: 0,
      comparison: 'above_zero',
      message: `${inputs.agingWipOverThirty} görev 30 günden uzun süredir in-progress durumda.`,
    });
  }
  const longestOutpacingRun = inputs.createdVsCompleted.reduce(
    ({ longest, current }, point) => {
      const next = point.created > point.completed ? current + 1 : 0;
      return { longest: Math.max(longest, next), current: next };
    },
    { longest: 0, current: 0 },
  ).longest;
  if (longestOutpacingRun > 0) {
    insights.push({
      ...trace,
      metric: 'throughputBalance',
      observedValue: longestOutpacingRun,
      threshold: 0,
      comparison: 'above_zero',
      message: `Girişlerin çıkışları aştığı en uzun seri ${longestOutpacingRun} dönem sürdü.`,
    });
  }
  if (inputs.backlogChange > 0) {
    insights.push({
      ...trace,
      metric: 'backlogChange',
      observedValue: inputs.backlogChange,
      threshold: 0,
      comparison: 'above_zero',
      message: `Backlog bu dönemde ${inputs.backlogChange} görev arttı.`,
    });
  }

  const status: DashboardHealthStatus =
    inputs.overdueNumerator * 100 >= inputs.overdueDenominator * HEALTH_THRESHOLDS.overdueOffTrack ||
    inputs.blockedNumerator * 100 >= inputs.blockedDenominator * HEALTH_THRESHOLDS.blockedOffTrack
      ? 'OFF_TRACK'
      : inputs.overdueNumerator * 100 >= inputs.overdueDenominator * HEALTH_THRESHOLDS.overdueAtRisk ||
          inputs.blockedNumerator * 100 >= inputs.blockedDenominator * HEALTH_THRESHOLDS.blockedAtRisk
        ? 'AT_RISK'
        : 'ON_TRACK';
  const overdueRate = percentage(inputs.overdueNumerator, inputs.overdueDenominator);
  const blockedRate = percentage(inputs.blockedNumerator, inputs.blockedDenominator);
  const explanation =
    status === 'ON_TRACK'
      ? `Gecikme oranı %${overdueRate} ve engel oranı %${blockedRate}; AT_RISK eşiklerinin altında.${
          insights.length > 0 ? ` ${insights.map((insight) => insight.message).join(' ')}` : ''
        }`
      : `${status}: ${insights.map((insight) => insight.message).join(' ')}`;

  return {
    period,
    scope,
    status,
    sampleSize: inputs.completedTaskCount,
    minimumSampleSize: HEALTH_MIN_SAMPLE_SIZE,
    explanation,
    insights,
  };
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
  now: Date,
  dueSoonExclusiveEnd: Date,
  periodStart: Date,
  periodEnd: Date,
  previousPeriodStart: Date,
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
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.is_blocked = true
    ) AS blocked_task_count,
    COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.is_blocked = true
        AND task.blocked_since < ${new Date(now.getTime() - 3 * DAY_MS)}
    ) AS blocked_over_three_days_task_count,
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
    ) AS priority_high,
    COUNT(task.id) FILTER (
      WHERE task.created_at >= ${periodStart} AND task.created_at < ${periodEnd}
    ) AS current_created_task_count,
    COUNT(task.id) FILTER (
      WHERE task.created_at >= ${previousPeriodStart} AND task.created_at < ${periodStart}
    ) AS previous_created_task_count,
    COUNT(task.id) FILTER (
      WHERE task.completed_at >= ${periodStart} AND task.completed_at < ${periodEnd}
    ) AS current_completed_task_count,
    COUNT(task.id) FILTER (
      WHERE task.completed_at >= ${previousPeriodStart} AND task.completed_at < ${periodStart}
    ) AS previous_completed_task_count,
    COUNT(task.id) FILTER (
      WHERE task.completed_at >= ${periodStart}
        AND task.completed_at < ${periodEnd}
        AND task.deadline IS NOT NULL
    ) AS current_deadline_completed_task_count,
    COUNT(task.id) FILTER (
      WHERE task.completed_at >= ${periodStart}
        AND task.completed_at < ${periodEnd}
        AND task.deadline IS NOT NULL
        AND task.completed_at <= task.deadline
    ) AS current_on_time_task_count,
    COUNT(task.id) FILTER (
      WHERE task.completed_at >= ${previousPeriodStart}
        AND task.completed_at < ${periodStart}
        AND task.deadline IS NOT NULL
    ) AS previous_deadline_completed_task_count,
    COUNT(task.id) FILTER (
      WHERE task.completed_at >= ${previousPeriodStart}
        AND task.completed_at < ${periodStart}
        AND task.deadline IS NOT NULL
        AND task.completed_at <= task.deadline
    ) AS previous_on_time_task_count
    ,PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (task.completed_at - task.started_at)) / 86400.0
    ) FILTER (
      WHERE task.completed_at >= ${periodStart}
        AND task.completed_at < ${periodEnd}
        AND task.started_at IS NOT NULL
        AND task.completed_at IS NOT NULL
        AND task.completed_at >= task.started_at
    ) AS cycle_time_median
    ,PERCENTILE_CONT(0.85) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (task.completed_at - task.started_at)) / 86400.0
    ) FILTER (
      WHERE task.completed_at >= ${periodStart}
        AND task.completed_at < ${periodEnd}
        AND task.started_at IS NOT NULL
        AND task.completed_at IS NOT NULL
        AND task.completed_at >= task.started_at
    ) AS cycle_time_p85
    ,COUNT(task.id) FILTER (
      WHERE task.completed_at >= ${periodStart}
        AND task.completed_at < ${periodEnd}
        AND task.started_at IS NOT NULL
        AND task.completed_at IS NOT NULL
        AND task.completed_at >= task.started_at
    ) AS cycle_time_sample_count
    ,PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (task.completed_at - task.created_at)) / 86400.0
    ) FILTER (
      WHERE task.completed_at >= ${periodStart}
        AND task.completed_at < ${periodEnd}
        AND task.created_at IS NOT NULL
        AND task.completed_at IS NOT NULL
        AND task.completed_at >= task.created_at
    ) AS lead_time_median
    ,COUNT(task.id) FILTER (
      WHERE task.completed_at >= ${periodStart}
        AND task.completed_at < ${periodEnd}
        AND task.created_at IS NOT NULL
        AND task.completed_at IS NOT NULL
        AND task.completed_at >= task.created_at
    ) AS lead_time_sample_count
    ,COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status = 'in_progress'
        AND task.pending_status IS NULL
        AND task.started_at IS NOT NULL
        AND FLOOR(EXTRACT(EPOCH FROM (${now} - task.started_at)) / 86400.0) < 4
    ) AS aging_wip_0_3_count
    ,COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status = 'in_progress'
        AND task.pending_status IS NULL
        AND task.started_at IS NOT NULL
        AND FLOOR(EXTRACT(EPOCH FROM (${now} - task.started_at)) / 86400.0) >= 4
        AND FLOOR(EXTRACT(EPOCH FROM (${now} - task.started_at)) / 86400.0) < 8
    ) AS aging_wip_4_7_count
    ,COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status = 'in_progress'
        AND task.pending_status IS NULL
        AND task.started_at IS NOT NULL
        AND FLOOR(EXTRACT(EPOCH FROM (${now} - task.started_at)) / 86400.0) >= 8
        AND FLOOR(EXTRACT(EPOCH FROM (${now} - task.started_at)) / 86400.0) < 15
    ) AS aging_wip_8_14_count
    ,COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status = 'in_progress'
        AND task.pending_status IS NULL
        AND task.started_at IS NOT NULL
        AND FLOOR(EXTRACT(EPOCH FROM (${now} - task.started_at)) / 86400.0) >= 15
        AND FLOOR(EXTRACT(EPOCH FROM (${now} - task.started_at)) / 86400.0) < 30
    ) AS aging_wip_15_30_count
    ,COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status = 'in_progress'
        AND task.pending_status IS NULL
        AND task.started_at IS NOT NULL
        AND FLOOR(EXTRACT(EPOCH FROM (${now} - task.started_at)) / 86400.0) >= 30
    ) AS aging_wip_30_plus_count
    ,COUNT(task.id) FILTER (
      WHERE task.archived_at IS NULL
        AND task.status = 'in_progress'
        AND task.pending_status IS NULL
        AND task.started_at IS NULL
    ) AS aging_wip_unknown_count
  FROM tasks task
  JOIN teams team ON team.id = task.team_id
  WHERE team.tenant_id = ${tenantId}::uuid
    ${taskScope}
`;

const trendQuery = (
  tenantId: string,
  taskScope: Prisma.Sql,
  periodStart: Date,
  periodEnd: Date,
  bucketDays: number,
) => Prisma.sql`
  WITH periods AS (
    SELECT generate_series(
      ${periodStart}::timestamptz,
      ${periodEnd}::timestamptz - (${bucketDays} * INTERVAL '1 day'),
      ${bucketDays} * INTERVAL '1 day'
    ) AS period_start
  ), scoped_tasks AS (
    SELECT task.id, task.created_at, task.completed_at
    FROM tasks task
    JOIN teams team ON team.id = task.team_id
    WHERE team.tenant_id = ${tenantId}::uuid
      ${taskScope}
  )
  SELECT
    TO_CHAR(periods.period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS period,
    COUNT(DISTINCT scoped_tasks.id) FILTER (
      WHERE scoped_tasks.created_at >= periods.period_start
        AND scoped_tasks.created_at < LEAST(
          periods.period_start + (${bucketDays} * INTERVAL '1 day'),
          ${periodEnd}::timestamptz
        )
    ) AS created_count,
    COUNT(DISTINCT scoped_tasks.id) FILTER (
      WHERE scoped_tasks.completed_at >= periods.period_start
        AND scoped_tasks.completed_at < LEAST(
          periods.period_start + (${bucketDays} * INTERVAL '1 day'),
          ${periodEnd}::timestamptz
        )
    ) AS completed_count
  FROM periods
  LEFT JOIN scoped_tasks ON (
    (scoped_tasks.created_at >= periods.period_start
      AND scoped_tasks.created_at < LEAST(
        periods.period_start + (${bucketDays} * INTERVAL '1 day'),
        ${periodEnd}::timestamptz
      ))
    OR (scoped_tasks.completed_at >= periods.period_start
      AND scoped_tasks.completed_at < LEAST(
        periods.period_start + (${bucketDays} * INTERVAL '1 day'),
        ${periodEnd}::timestamptz
      ))
  )
  GROUP BY periods.period_start
  ORDER BY periods.period_start ASC
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

const riskTaskQuery = (
  tenantId: string,
  teamId: string | null,
  archiveCutoff: Date,
  today: Date,
  dueSoonExclusiveEnd: Date,
) => Prisma.sql`
  WITH scoped_tasks AS (
    SELECT
      task.id,
      task.title,
      task.deadline,
      task.status,
      task.archived_at,
      task.pending_status,
      team.id AS team_id,
      team.name AS team_name,
      assignee.id AS assignee_id,
      assignee.full_name AS assignee_full_name
    FROM tasks task
    JOIN teams team ON team.id = task.team_id
    LEFT JOIN LATERAL (
      SELECT u.id, u.full_name
      FROM task_assignees assignment
      JOIN users u ON u.id = assignment.user_id
      WHERE assignment.task_id = task.id
        AND u.tenant_id = ${tenantId}::uuid
      ORDER BY assignment.assigned_at ASC, u.id ASC
      LIMIT 1
    ) assignee ON TRUE
    WHERE team.tenant_id = ${tenantId}::uuid
      AND (${teamId}::uuid IS NULL OR team.id = ${teamId}::uuid)
  ),
  risk_tasks AS (
    SELECT *, 'overdue'::text AS risk_type
    FROM scoped_tasks
    WHERE archived_at IS NULL AND status <> 'done' AND deadline < ${today}
    UNION ALL
    SELECT *, 'due_next_seven_days'::text AS risk_type
    FROM scoped_tasks
    WHERE archived_at IS NULL
      AND status <> 'done'
      AND deadline >= ${today}
      AND deadline < ${dueSoonExclusiveEnd}
    UNION ALL
    SELECT *, 'pending_approval'::text AS risk_type
    FROM scoped_tasks
    WHERE archived_at IS NULL AND pending_status IS NOT NULL
    UNION ALL
    SELECT *, 'expired'::text AS risk_type
    FROM scoped_tasks
    WHERE archived_at IS NOT NULL
      AND status IN ('todo', 'in_progress')
      AND deadline <= ${archiveCutoff}
  ),
  ranked_tasks AS (
    SELECT
      risk_tasks.*,
      ROW_NUMBER() OVER (
        PARTITION BY risk_type
        ORDER BY deadline ASC NULLS LAST, id ASC
      ) AS risk_rank
    FROM risk_tasks
  )
  SELECT
    risk_type,
    id,
    title,
    team_id,
    team_name,
    assignee_id,
    assignee_full_name,
    deadline,
    status
  FROM ranked_tasks
  WHERE risk_rank <= ${RISK_TASK_LIMIT}
  ORDER BY risk_type, deadline ASC NULLS LAST, id ASC
`;

function mapRiskTask(row: RiskTaskRow): CompanyRiskTask {
  return {
    id: row.id,
    title: row.title,
    team: { id: row.team_id, name: row.team_name },
    assignee: row.assignee_id
      ? { id: row.assignee_id, fullName: row.assignee_full_name ?? 'Atanmamış' }
      : null,
    deadline: row.deadline ? row.deadline.toISOString().slice(0, 10) : null,
    status: row.status,
  };
}

async function getDashboardData(
  db: TenantDb,
  actor: Actor,
  filters: CompanyDashboardFilters,
  now = new Date(),
): Promise<CompanyDashboard> {
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
  const selectedRange = rangeConfig(filters.range);
  const periodEnd = new Date(today.getTime() + DAY_MS);
  const periodStart = new Date(periodEnd.getTime() - selectedRange.days * DAY_MS);
  const previousPeriodStart = new Date(periodStart.getTime() - selectedRange.days * DAY_MS);
  const bucketDays = selectedRange.range === '90d' ? 7 : 1;

  const [summaryRows, memberRows, riskTaskRows, trendRows] = await Promise.all([
    db.$queryRaw<SummaryRow[]>(
      summaryQuery(
        tenantId,
        taskScope,
        archiveCutoff,
        today,
        now,
        dueSoonExclusiveEnd,
        periodStart,
        periodEnd,
        previousPeriodStart,
      ),
    ),
    db.$queryRaw<MemberRow[]>(memberQuery(tenantId, teamId, archiveCutoff)),
    db.$queryRaw<RiskTaskRow[]>(
      riskTaskQuery(tenantId, teamId, archiveCutoff, today, dueSoonExclusiveEnd),
    ),
    db.$queryRaw<TrendRow[]>(trendQuery(tenantId, taskScope, periodStart, periodEnd, bucketDays)),
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
  const blockedTaskCount = asNumber(summary.blocked_task_count);
  const blockedOverThreeDaysTaskCount = asNumber(summary.blocked_over_three_days_task_count);
  const priorityTotal = asNumber(summary.priority_total);
  const currentCreated = asNumber(summary.current_created_task_count);
  const previousCreated = asNumber(summary.previous_created_task_count);
  const currentCompleted = asNumber(summary.current_completed_task_count);
  const previousCompleted = asNumber(summary.previous_completed_task_count);
  const currentDeadlineCompleted = asNumber(summary.current_deadline_completed_task_count);
  const currentOnTime = asNumber(summary.current_on_time_task_count);
  const previousDeadlineCompleted = asNumber(summary.previous_deadline_completed_task_count);
  const previousOnTime = asNumber(summary.previous_on_time_task_count);
  const cycleTimeSampleSize = asNumber(summary.cycle_time_sample_count);
  const leadTimeSampleSize = asNumber(summary.lead_time_sample_count);
  const agingWipBuckets = {
    zeroToThree: asNumber(summary.aging_wip_0_3_count),
    fourToSeven: asNumber(summary.aging_wip_4_7_count),
    eightToFourteen: asNumber(summary.aging_wip_8_14_count),
    fifteenToThirty: asNumber(summary.aging_wip_15_30_count),
    overThirty: asNumber(summary.aging_wip_30_plus_count),
  };
  const agingWipMeasuredCount = Object.values(agingWipBuckets).reduce(
    (total, count) => total + count,
    0,
  );
  const agingWipUnknownCount = asNumber(summary.aging_wip_unknown_count);
  const currentOnTimeRate = percentage(currentOnTime, currentDeadlineCompleted);
  const previousOnTimeRate = percentage(previousOnTime, previousDeadlineCompleted);
  const currentOverdueRate = percentage(
    currentDeadlineCompleted - currentOnTime,
    currentDeadlineCompleted,
  );
  const previousOverdueRate = percentage(
    previousDeadlineCompleted - previousOnTime,
    previousDeadlineCompleted,
  );
  const trendByPeriod = new Map(
    trendRows.map((row) => [
      typeof row.period === 'string' ? row.period : formatCalendarDate(row.period)!,
      {
        created: asNumber(row.created_count),
        completed: asNumber(row.completed_count),
      },
    ]),
  );
  const createdVsCompleted = Array.from(
    { length: Math.ceil(selectedRange.days / bucketDays) },
    (_, index) => {
      const periodDate = new Date(periodStart.getTime() + index * bucketDays * DAY_MS);
      const period = formatCalendarDate(periodDate)!;
      const values = trendByPeriod.get(period) ?? { created: 0, completed: 0 };
      return { period, ...values };
    },
  );
  const riskTasks: CompanyDashboard['riskTasks'] = {
    overdue: [],
    dueNextSevenDays: [],
    pendingApproval: [],
    expired: [],
  };
  for (const row of riskTaskRows) {
    const task = mapRiskTask(row);
    if (row.risk_type === 'overdue') riskTasks.overdue.push(task);
    if (row.risk_type === 'due_next_seven_days') riskTasks.dueNextSevenDays.push(task);
    if (row.risk_type === 'pending_approval') riskTasks.pendingApproval.push(task);
    if (row.risk_type === 'expired') riskTasks.expired.push(task);
  }

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

  const period: DashboardPeriod = {
    range: selectedRange.range,
    start: formatCalendarDate(periodStart)!,
    end: formatCalendarDate(periodEnd)!,
  };
  const scope: DashboardScope = { teamId: team?.id ?? null, teamName: team?.name ?? null };
  const blockedRate = percentage(blockedTaskCount, statusTotal);

  return {
    period,
    createdInPeriod: comparison(currentCreated, previousCreated),
    completedInPeriod: comparison(currentCompleted, previousCompleted),
    cycleTime: {
      unit: 'days',
      median: nullableNumber(summary.cycle_time_median),
      p85: nullableNumber(summary.cycle_time_p85),
      sampleSize: cycleTimeSampleSize,
    },
    leadTime: {
      unit: 'days',
      median: nullableNumber(summary.lead_time_median),
      sampleSize: leadTimeSampleSize,
    },
    agingWip: {
      unit: 'days',
      buckets: agingWipBuckets,
      measuredCount: agingWipMeasuredCount,
      unknownCount: agingWipUnknownCount,
      totalCount: agingWipMeasuredCount + agingWipUnknownCount,
    },
    overdueRate: comparison(currentOverdueRate, previousOverdueRate),
    onTimeDeliveryRate: comparison(currentOnTimeRate, previousOnTimeRate),
    backlogChange: currentCreated - currentCompleted,
    throughput: createdVsCompleted.map(({ period, completed }) => ({ period, count: completed })),
    createdVsCompleted,
    scope,
    health: deriveHealth(period, scope, {
      completedTaskCount: currentCompleted,
      overdueNumerator: currentDeadlineCompleted - currentOnTime,
      overdueDenominator: currentDeadlineCompleted,
      blockedNumerator: blockedTaskCount,
      blockedDenominator: statusTotal,
      currentOnTimeRate,
      previousOnTimeRate,
      currentOnTimeNumerator: currentOnTime,
      currentOnTimeDenominator: currentDeadlineCompleted,
      previousOnTimeNumerator: previousOnTime,
      previousOnTimeDenominator: previousDeadlineCompleted,
      agingWipOverThirty: agingWipBuckets.overThirty,
      backlogChange: currentCreated - currentCompleted,
      createdVsCompleted,
    }),
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
      blockedTaskCount,
      blockedOverThreeDaysTaskCount,
      blockedRate,
    },
    riskTasks,
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

export async function getCompanyDashboard(
  db: TenantDb,
  actor: Actor,
  filters: CompanyDashboardFilters,
  now = new Date(),
): Promise<CompanyDashboard> {
  if (!isCompanyAdmin(actor)) {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }
  return getDashboardData(db, actor, filters, now);
}

export async function getTeamDashboard(
  db: TenantDb,
  teamId: string,
  actor: Actor,
  filters: Pick<CompanyDashboardFilters, 'range'> = {},
  now = new Date(),
): Promise<CompanyDashboard> {
  const tenantId = requireTenant(actor);
  const team = await db.team.findFirst({
    where: { id: teamId, tenantId },
    select: { id: true },
  });
  if (!team) throw new AppError(404, 'Takım bulunamadı', 'NOT_FOUND');

  if (!isCompanyAdmin(actor) && (await getTeamRole(db, teamId, actor.id)) !== 'teamAdmin') {
    throw new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN');
  }

  return getDashboardData(db, actor, { teamId, range: filters.range }, now);
}
