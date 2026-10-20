import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { channel } from 'node:diagnostics_channel';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Prisma } from '@prisma/client';
import { createApp } from '../src/app';
import { withTenantContext } from '../src/db/withTenant';
import { env } from '../src/env';
import type { RequestTimingStage } from '../src/http/requestTiming';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { RATE_LIMIT_PROFILES } from '../src/middleware/rateLimitProfiles';
import {
  createPerformanceFixture,
  deletePerformanceFixture,
  type PerformanceFixture,
} from './performance-fixture';

const DEFAULT_TASK_COUNTS = [100, 1000, 5000];
const DEFAULT_SIGNALS = [500, 800];
const AUTH_LOGIN_STAGES: RequestTimingStage[] = ['auth_db_ms', 'password_verify_ms', 'session_redis_ms'];
const AUTH_REFRESH_STAGES: RequestTimingStage[] = ['auth_db_ms', 'session_redis_ms'];
const DASHBOARD_STAGES: RequestTimingStage[] = [
  'company_dashboard_cumulative_flow_query_elapsed_ms',
  'company_dashboard_cumulative_flow_compute_elapsed_ms',
];
const TASK_LIST_STAGES: RequestTimingStage[] = ['task_list_find_many_elapsed_ms', 'task_list_count_elapsed_ms'];
const NO_COOKIE_REFRESH_STAGES: RequestTimingStage[] = ['rate_limit_ms'];
const DEFAULT_ARTIFACT_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../artifacts/analytics/phase-10',
);
const SENSITIVE_KEY = /(password|token|secret|authorization|cookie|email|tenantId|teamId|taskId|userId|ids?)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const BEARER_PATTERN = /\bBearer\s+\S+/gi;

export type PerformanceConfig = {
  taskCounts: number[];
  eventsPerTask: number;
  warmup: number;
  samples: number;
  rounds: number;
  explainAnalyze: boolean;
  p95Signals: { investigate: number; high: number };
};

type StageTimingSummary = {
  requestsWithTimingEvent: number;
  stages: Record<string, {
    sampleCount: number;
    expectedSampleCount: number;
    latencyMs: NumericSummary | null;
  }>;
  note?: string;
};

export type NumericSummary = {
  count: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  mean: number;
};

export type RequestMeasurement = {
  status: number;
  latencyMs: number;
  responseBytes: number;
  queryEvents: number;
  rlsTransactionSetupQueryEvents: number;
  requestStages?: Partial<Record<RequestTimingStage, number>>;
  requestTimingEventReceived?: boolean;
};

export type EndpointMeasurement = {
  route: 'company' | 'team';
  sampleCount: number;
  latencyMs: NumericSummary;
  responseBytes: NumericSummary;
  queryEvents: NumericSummary;
  queryEventLabels: { application: number; rlsTransactionSetup: number };
  rounds: Array<{ round: number; p95Ms: number; classification: 'normal' | 'investigate' | 'high' }>;
  persistentInvestigationSignal: boolean;
  persistentHighSignal: boolean;
  stageTiming: StageTimingSummary;
};

export type AuthenticationEndpointMeasurement = {
  route: 'login' | 'refresh' | 'refresh-no-cookie';
  sampleCount: number;
  latencyMs: NumericSummary;
  stageTiming: StageTimingSummary;
};

export type TaskListEndpointMeasurement = {
  route: 'all-teams' | 'team';
  request: {
    method: 'GET';
    path: '/api/v1/tasks';
    query: string;
    actorRole: 'companyAdmin';
  };
  effectiveLimit: 100;
  dataset: string;
  warmupPerEndpoint: number;
  samplesPerRound: number;
  rounds: number;
  concurrency: 1;
  coldRun: 'not measured';
  queryPlan: 'reported in dataset query plans';
  sampleCount: number;
  latencyMs: NumericSummary;
  responseBytes: NumericSummary;
  queryEvents: NumericSummary;
  expectedTotal: number;
  expectedRowsPerRequest: number;
  stageTiming: StageTimingSummary;
};

export type QueryPlanMeasurement = {
  sourceEndpoint: 'task-list/all-teams' | 'task-list/team' | 'aggregate/company' | 'aggregate/team';
  actorRole: 'companyAdmin';
  replayActor: 'same fixture actor as captured request';
  mode: 'estimated' | 'analyzed';
  queryGroup: string;
  queryEvent: number;
  parameterCount: number;
  status: 'captured' | 'skipped';
  reason?: string;
  planningTimeMs?: number;
  executionTimeMs?: number;
  nodes?: Array<{
    nodeType: string;
    relationName?: string;
    indexName?: string;
    planRows: number;
    startupCost: number;
    totalCost: number;
    actualRows?: number;
    actualLoops?: number;
    actualStartupTimeMs?: number;
    actualTotalTimeMs?: number;
    rowsRemovedByFilter?: number;
    buffers?: {
      sharedHitBlocks?: number;
      sharedReadBlocks?: number;
      sharedDirtiedBlocks?: number;
      sharedWrittenBlocks?: number;
      localHitBlocks?: number;
      localReadBlocks?: number;
      localDirtiedBlocks?: number;
      localWrittenBlocks?: number;
      tempReadBlocks?: number;
      tempWrittenBlocks?: number;
    };
    sortMethod?: string;
    sortSpaceUsed?: number;
    sortSpaceType?: string;
  }>;
};

type CapturedQueryEvent = Pick<Prisma.QueryEvent, 'query' | 'params'>;

export type PerformanceReport = {
  generatedAt: string;
  worktreeReference: string;
  queryPlanMode: 'estimated' | 'analyzed';
  stageTimingEnabled: boolean;
  config: PerformanceConfig;
  authentication: AuthenticationEndpointMeasurement[];
  datasets: Array<{
    taskCount: number;
    eventCount: number;
    endpoints: EndpointMeasurement[];
    taskLists: TaskListEndpointMeasurement[];
    queryPlans: QueryPlanMeasurement[];
    taskListTenantControl: {
      status: number;
      noForeignData: boolean;
      passed: boolean;
    };
    taskListResponseCorrectness: {
      expectedTotal: number;
      expectedRowsPerRequest: number;
      maxRows: 100;
      passed: true;
    };
    correctness: { crossTenantStatus: number; noForeignData: boolean; passed: boolean };
  }>;
  decision: {
    measuredTaskCounts: number[];
    unmeasuredDefaultTaskCounts: number[];
    investigationRequired: boolean;
    persistentInvestigationRequired: boolean;
    optimizationJustified: false;
    rationale: string;
  };
};

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function parseIntegerList(value: string | undefined, fallback: number[], name: string): number[] {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = value.split(',').map((item) => positiveInteger(item.trim(), -1, name));
  if (parsed.length === 0) throw new Error(`${name} must not be empty`);
  return parsed;
}

export function parsePerformanceConfig(env: NodeJS.ProcessEnv = process.env): PerformanceConfig {
  const signals = parseIntegerList(env.PERF_P95_SIGNALS, DEFAULT_SIGNALS, 'PERF_P95_SIGNALS');
  const sortedSignals = [...signals].sort((a, b) => a - b);
  if (sortedSignals.length !== 2) throw new Error('PERF_P95_SIGNALS must contain two values');
  const explainAnalyze = env.PERF_EXPLAIN_ANALYZE ?? 'false';
  if (explainAnalyze !== 'true' && explainAnalyze !== 'false') {
    throw new Error('PERF_EXPLAIN_ANALYZE must be true or false');
  }
  return {
    taskCounts: parseIntegerList(env.PERF_TASK_COUNTS, DEFAULT_TASK_COUNTS, 'PERF_TASK_COUNTS'),
    eventsPerTask: nonNegativeInteger(env.PERF_EVENTS_PER_TASK, 5, 'PERF_EVENTS_PER_TASK'),
    warmup: nonNegativeInteger(env.PERF_WARMUP, 3, 'PERF_WARMUP'),
    samples: positiveInteger(env.PERF_SAMPLES, 30, 'PERF_SAMPLES'),
    rounds: positiveInteger(env.PERF_ROUNDS, 3, 'PERF_ROUNDS'),
    explainAnalyze: explainAnalyze === 'true',
    p95Signals: { investigate: sortedSignals[0], high: sortedSignals[1] },
  };
}

export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) throw new Error('Cannot calculate percentile of empty values');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarize(values: number[]): NumericSummary {
  if (values.length === 0) throw new Error('Cannot summarize empty values');
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    mean: values.reduce((total, value) => total + value, 0) / values.length,
  };
}

export function summarizeRequestStages(
  samples: RequestMeasurement[],
  enabled: boolean,
  expectedStages: RequestTimingStage[],
  note?: string,
): StageTimingSummary {
  const names = new Set(expectedStages);
  for (const sample of samples) {
    for (const stage of Object.keys(sample.requestStages ?? {})) names.add(stage as RequestTimingStage);
  }
  return {
    requestsWithTimingEvent: samples.filter((sample) => sample.requestTimingEventReceived).length,
    stages: Object.fromEntries([...names].map((stage) => {
      const values = samples
        .map((sample) => sample.requestStages?.[stage])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      const reportStage = stage === 'password_verify_ms' ? 'bcrypt_verify_ms' : stage;
      return [reportStage, {
        sampleCount: values.length,
        expectedSampleCount: enabled ? samples.length : 0,
        latencyMs: values.length ? summarize(values) : null,
      }];
    })),
    ...(!enabled ? { note: note ?? 'REQUEST_STAGE_TIMING disabled' } : note ? { note } : {}),
  };
}

export function classifyP95(p95: number, signals: PerformanceConfig['p95Signals']): 'normal' | 'investigate' | 'high' {
  if (p95 > signals.high) return 'high';
  if (p95 > signals.investigate) return 'investigate';
  return 'normal';
}

export function requiredSessionCount(requestCount: number, perSessionLimit = RATE_LIMIT_PROFILES.authenticatedRead.max): number {
  if (!Number.isInteger(requestCount) || requestCount < 1) throw new Error('requestCount must be a positive integer');
  if (!Number.isInteger(perSessionLimit) || perSessionLimit < 1) throw new Error('perSessionLimit must be a positive integer');
  return Math.max(1, Math.ceil(requestCount / Math.max(1, perSessionLimit - 1)));
}

export function authenticationSamplePlan(
  config: PerformanceConfig,
  loginLimit = RATE_LIMIT_PROFILES.login.max,
  refreshLimit = RATE_LIMIT_PROFILES.refresh.max,
): {
  login: { warmup: number; samples: number };
  refresh: { warmup: number; samples: number };
  refreshWithoutCookie: { warmup: number; samples: number };
} {
  if (loginLimit < 2 || refreshLimit < 4) {
    throw new Error('Authentication rate limits must allow at least one sample per route');
  }
  const requestedSamples = config.samples * config.rounds;
  // Leave one slot below each per-route limiter ceiling for incidental traffic.
  const loginBudget = loginLimit - 1;
  const loginWarmup = Math.min(config.warmup, loginBudget - 1);
  const loginSamples = Math.min(requestedSamples, loginBudget - loginWarmup);
  const refreshBudget = refreshLimit - 1;
  const refreshWarmup = Math.min(config.warmup, Math.floor((refreshBudget - 2) / 2));
  const refreshSamplesBudget = refreshBudget - refreshWarmup * 2;
  const refreshSamples = Math.min(requestedSamples, Math.ceil(refreshSamplesBudget / 2));
  const refreshWithoutCookieSamples = Math.min(
    requestedSamples,
    Math.floor(refreshSamplesBudget / 2),
  );
  return {
    login: { warmup: loginWarmup, samples: loginSamples },
    refresh: { warmup: refreshWarmup, samples: refreshSamples },
    refreshWithoutCookie: {
      warmup: refreshWarmup,
      samples: refreshWithoutCookieSamples,
    },
  };
}

export function retryAfterMilliseconds(value: string | null): number {
  if (!value) return 1_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(60_000, Math.max(0, seconds * 1_000));
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.min(60_000, Math.max(0, timestamp - Date.now())) : 1_000;
}

export function evaluateCrossTenantControl(
  status: number,
  body: string,
  foreignTeamId: string,
): { noForeignData: boolean; passed: boolean } {
  const noForeignData = !body.includes(foreignTeamId);
  return {
    noForeignData,
    passed: (status === 403 || status === 404) && noForeignData,
  };
}

export function evaluateTaskListResponse(
  status: number,
  body: string,
  expectedTotal: number,
): { returned: number; total: number | null; passed: boolean } {
  try {
    const response = JSON.parse(body) as { tasks?: unknown; total?: unknown };
    const returned = Array.isArray(response.tasks) ? response.tasks.length : -1;
    const total = typeof response.total === 'number' ? response.total : null;
    return {
      returned,
      total,
      passed: status === 200 && returned === Math.min(expectedTotal, 100) && returned <= 100 && total === expectedTotal,
    };
  } catch {
    return { returned: -1, total: null, passed: false };
  }
}

export function evaluateTaskListTenantControl(
  status: number,
  body: string,
  foreignTaskId: string,
  foreignTeamId: string,
): { noForeignData: boolean; passed: boolean } {
  const noForeignData = !body.includes(foreignTaskId) && !body.includes(foreignTeamId);
  try {
    const response = JSON.parse(body) as { tasks?: unknown; total?: unknown };
    const emptyResult = Array.isArray(response.tasks) && response.tasks.length === 0 && response.total === 0;
    return { noForeignData, passed: status === 200 && emptyResult && noForeignData };
  } catch {
    return { noForeignData, passed: false };
  }
}

function queryLabel(query: string): 'application' | 'rlsTransactionSetup' {
  return /set local role|set_config\(/i.test(query) ? 'rlsTransactionSetup' : 'application';
}

function benchmarkTimingRoute(baseUrl: string, path: string): string {
  const apiPath = `${new URL(baseUrl).pathname.replace(/\/$/, '')}${path.split('?', 1)[0]}`;
  return apiPath.replace(/^\/api\/v1\/teams\/[^/]+\/dashboard$/, '/api/v1/teams/:teamId/dashboard');
}

let activeQueryLabels: Array<'application' | 'rlsTransactionSetup'> | undefined;
let activeCapturedQueries: CapturedQueryEvent[] | undefined;
let activeStageCapture = false;
const requestTimingChannel = channel('taskflow.request-timing');
export function recordPerformanceQueryEvent(event: CapturedQueryEvent): void {
  activeQueryLabels?.push(queryLabel(event.query));
  activeCapturedQueries?.push({ query: event.query, params: event.params });
}
prisma.$on('query', recordPerformanceQueryEvent);

export async function request(
  baseUrl: string,
  token: string | undefined,
  path: string,
  expectedStatus?: number,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    cookie?: string;
    captureQueries?: boolean;
    captureStages?: boolean;
  } = {},
): Promise<RequestMeasurement & {
  body: string;
  setCookie?: string;
  capturedQueries?: CapturedQueryEvent[];
}> {
  let retryAfterMs = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (retryAfterMs > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, retryAfterMs));
    const labels: Array<'application' | 'rlsTransactionSetup'> = [];
    const capturedQueries: CapturedQueryEvent[] = [];
    const method = options.method ?? 'GET';
    const route = benchmarkTimingRoute(baseUrl, path);
    const stageCapture = options.captureStages
      ? { method, route, stages: undefined as Partial<Record<RequestTimingStage, number>> | undefined, received: false }
      : undefined;
    if (stageCapture && activeStageCapture) throw new Error('Stage timing benchmark requests must be serial');
    activeQueryLabels = labels;
    activeCapturedQueries = options.captureQueries ? capturedQueries : undefined;
    const onStageTiming = (message: unknown) => {
      if (!stageCapture || !message || typeof message !== 'object') return;
      const event = message as {
        method?: unknown;
        route?: unknown;
        finished?: unknown;
        stages?: unknown;
      };
      if (
        event.method !== stageCapture.method ||
        event.route !== stageCapture.route ||
        event.finished !== true ||
        !event.stages ||
        typeof event.stages !== 'object'
      ) return;
      stageCapture.received = true;
      stageCapture.stages = Object.fromEntries(
        Object.entries(event.stages).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
        ),
      ) as Partial<Record<RequestTimingStage, number>>;
    };
    if (stageCapture) {
      activeStageCapture = true;
      requestTimingChannel.subscribe(onStageTiming);
    }
    const started = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (token) headers.authorization = `Bearer ${token}`;
      if (options.cookie) headers.cookie = options.cookie;
      const requestBody = options.body === undefined ? undefined : JSON.stringify(options.body);
      if (requestBody !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(requestBody === undefined ? {} : { body: requestBody }),
      });
      const body = await response.text();
      if (response.status === 429 && attempt < 2) {
        retryAfterMs = retryAfterMilliseconds(response.headers.get('retry-after'));
        continue;
      }
      if (expectedStatus !== undefined && response.status !== expectedStatus) {
        throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}`);
      }
      return {
        status: response.status,
        latencyMs: performance.now() - started,
        responseBytes: Buffer.byteLength(body, 'utf8'),
        queryEvents: labels.length,
        rlsTransactionSetupQueryEvents: labels.filter((label) => label === 'rlsTransactionSetup').length,
        body,
        ...(stageCapture
          ? {
              requestStages: stageCapture.stages ?? {},
              requestTimingEventReceived: stageCapture.received,
            }
          : {}),
        ...(options.captureQueries ? { capturedQueries } : {}),
        ...(response.headers.get('set-cookie')
          ? { setCookie: response.headers.get('set-cookie')!.split(';', 1)[0] }
          : {}),
      };
    } finally {
      activeQueryLabels = undefined;
      activeCapturedQueries = undefined;
      if (stageCapture) {
        requestTimingChannel.unsubscribe(onStageTiming);
        activeStageCapture = false;
      }
    }
  }
  throw new Error(`${path} returned 429 after bounded retries`);
}

export function prepareExplainQuery(
  query: string,
  rawParams: string,
): { query: string; params: unknown[] } | { reason: string } {
  const trimmedQuery = query.trim();
  if (!/^SELECT\b/i.test(trimmedQuery) || trimmedQuery.includes(';')) {
    return { reason: 'captured statement is not a single SELECT' };
  }
  let params: unknown;
  try {
    params = JSON.parse(rawParams);
  } catch {
    return { reason: 'captured parameters are not valid JSON' };
  }
  if (
    !Array.isArray(params) ||
    params.some((value) =>
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'boolean' &&
      !(typeof value === 'number' && Number.isFinite(value)),
    )
  ) {
    return { reason: 'captured parameters contain unsupported values' };
  }
  const placeholders = [...trimmedQuery.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  if (
    (params.length === 0 && placeholders.length > 0) ||
    (params.length > 0 &&
      (Math.max(0, ...placeholders) !== params.length ||
        Array.from({ length: params.length }, (_, index) => index + 1).some(
          (index) => !placeholders.includes(index),
        )))
  ) {
    return { reason: 'captured placeholder shape does not match parameters' };
  }
  return { query: trimmedQuery, params };
}

export function explainPlanSummary(result: unknown): Pick<QueryPlanMeasurement, 'nodes' | 'planningTimeMs' | 'executionTimeMs'> | undefined {
  if (!Array.isArray(result) || result.length !== 1 || !result[0] || typeof result[0] !== 'object') {
    return undefined;
  }
  const queryPlan = (result[0] as Record<string, unknown>)['QUERY PLAN'];
  const top = Array.isArray(queryPlan) ? queryPlan[0] : undefined;
  if (!top || typeof top !== 'object') return undefined;
  const topPlan = top as Record<string, unknown>;
  const root = topPlan.Plan;
  if (!root || typeof root !== 'object') return undefined;
  const nodes: NonNullable<QueryPlanMeasurement['nodes']> = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (
      typeof node['Node Type'] !== 'string' ||
      typeof node['Plan Rows'] !== 'number' ||
      typeof node['Startup Cost'] !== 'number' ||
      typeof node['Total Cost'] !== 'number'
    ) return;
    nodes.push({
      nodeType: node['Node Type'],
      ...(typeof node['Relation Name'] === 'string' ? { relationName: node['Relation Name'] } : {}),
      ...(typeof node['Index Name'] === 'string' ? { indexName: node['Index Name'] } : {}),
      planRows: node['Plan Rows'],
      startupCost: node['Startup Cost'],
      totalCost: node['Total Cost'],
      ...(typeof node['Actual Rows'] === 'number' ? { actualRows: node['Actual Rows'] } : {}),
      ...(typeof node['Actual Loops'] === 'number' ? { actualLoops: node['Actual Loops'] } : {}),
      ...(typeof node['Actual Startup Time'] === 'number'
        ? { actualStartupTimeMs: node['Actual Startup Time'] }
        : {}),
      ...(typeof node['Actual Total Time'] === 'number'
        ? { actualTotalTimeMs: node['Actual Total Time'] }
        : {}),
      ...(typeof node['Rows Removed by Filter'] === 'number'
        ? { rowsRemovedByFilter: node['Rows Removed by Filter'] }
        : {}),
      ...([
        'Shared Hit Blocks', 'Shared Read Blocks', 'Shared Dirtied Blocks', 'Shared Written Blocks',
        'Local Hit Blocks', 'Local Read Blocks', 'Local Dirtied Blocks', 'Local Written Blocks',
        'Temp Read Blocks', 'Temp Written Blocks',
      ].some(
        (key) => typeof node[key] === 'number',
      )
        ? {
            buffers: {
              ...(typeof node['Shared Hit Blocks'] === 'number'
                ? { sharedHitBlocks: node['Shared Hit Blocks'] }
                : {}),
              ...(typeof node['Shared Read Blocks'] === 'number'
                ? { sharedReadBlocks: node['Shared Read Blocks'] }
                : {}),
              ...(typeof node['Shared Dirtied Blocks'] === 'number'
                ? { sharedDirtiedBlocks: node['Shared Dirtied Blocks'] }
                : {}),
              ...(typeof node['Shared Written Blocks'] === 'number'
                ? { sharedWrittenBlocks: node['Shared Written Blocks'] }
                : {}),
              ...(typeof node['Local Hit Blocks'] === 'number' ? { localHitBlocks: node['Local Hit Blocks'] } : {}),
              ...(typeof node['Local Read Blocks'] === 'number' ? { localReadBlocks: node['Local Read Blocks'] } : {}),
              ...(typeof node['Local Dirtied Blocks'] === 'number'
                ? { localDirtiedBlocks: node['Local Dirtied Blocks'] }
                : {}),
              ...(typeof node['Local Written Blocks'] === 'number'
                ? { localWrittenBlocks: node['Local Written Blocks'] }
                : {}),
              ...(typeof node['Temp Read Blocks'] === 'number' ? { tempReadBlocks: node['Temp Read Blocks'] } : {}),
              ...(typeof node['Temp Written Blocks'] === 'number'
                ? { tempWrittenBlocks: node['Temp Written Blocks'] }
                : {}),
            },
          }
        : {}),
      ...(typeof node['Sort Method'] === 'string' ? { sortMethod: node['Sort Method'] } : {}),
      ...(typeof node['Sort Space Used'] === 'number' ? { sortSpaceUsed: node['Sort Space Used'] } : {}),
      ...(typeof node['Sort Space Type'] === 'string' ? { sortSpaceType: node['Sort Space Type'] } : {}),
    });
    if (Array.isArray(node.Plans)) node.Plans.forEach(visit);
  };
  visit(root);
  if (nodes.length === 0) return undefined;
  return {
    nodes,
    ...(typeof topPlan['Planning Time'] === 'number' ? { planningTimeMs: topPlan['Planning Time'] } : {}),
    ...(typeof topPlan['Execution Time'] === 'number' ? { executionTimeMs: topPlan['Execution Time'] } : {}),
  };
}

export function explainPlanNodes(result: unknown): QueryPlanMeasurement['nodes'] | undefined {
  return explainPlanSummary(result)?.nodes;
}

export function explainCommand(mode: 'estimated' | 'analyzed'): string {
  return mode === 'analyzed'
    ? 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)'
    : 'EXPLAIN (FORMAT JSON)';
}

async function captureQueryPlans(
  fixture: PerformanceFixture,
  actorUserId: string,
  sourceEndpoint: QueryPlanMeasurement['sourceEndpoint'],
  capturedQueries: CapturedQueryEvent[],
  mode: QueryPlanMeasurement['mode'],
): Promise<QueryPlanMeasurement[]> {
  if (!fixture.userIds.includes(actorUserId)) {
    throw new Error('Refusing EXPLAIN because captured actor does not belong to the fixture');
  }
  const selectedQueries = capturedQueries.filter(
    ({ query }) => queryLabel(query) === 'application' && /^\s*SELECT\b/i.test(query),
  );
  if (selectedQueries.length === 0) {
    return [{
      sourceEndpoint,
      actorRole: 'companyAdmin',
      replayActor: 'same fixture actor as captured request',
      mode,
      queryGroup: 'none',
      queryEvent: 0,
      parameterCount: 0,
      status: 'skipped',
      reason: 'no SELECT events captured for request',
    }];
  }
  return withTenantContext(actorUserId, fixture.tenantId, async (tx) => {
    const [context] = await tx.$queryRaw<Array<{ currentUser: string; userId: string | null; tenantId: string | null }>>`
      SELECT current_user AS "currentUser",
        current_setting('app.user_id', true) AS "userId",
        current_setting('app.tenant_id', true) AS "tenantId"
    `;
    if (
      context?.currentUser !== 'authenticated' ||
      context.userId !== actorUserId ||
      context.tenantId !== fixture.tenantId
    ) {
      throw new Error('Refusing EXPLAIN because authenticated fixture context verification failed');
    }
    const plans: QueryPlanMeasurement[] = [];
    for (const [index, captured] of selectedQueries.entries()) {
      const group = createHash('sha256').update(captured.query).digest('hex').slice(0, 12);
      const prepared = prepareExplainQuery(captured.query, captured.params);
      const base = {
        sourceEndpoint,
        actorRole: 'companyAdmin' as const,
        replayActor: 'same fixture actor as captured request' as const,
        mode,
        queryGroup: group,
        queryEvent: index + 1,
        parameterCount: 'params' in prepared ? prepared.params.length : -1,
      };
      if (!('params' in prepared)) {
        plans.push({ ...base, status: 'skipped', reason: prepared.reason });
        continue;
      }
      try {
        const result = await tx.$queryRawUnsafe<unknown[]>(
          `${explainCommand(mode)} ${prepared.query}`,
          ...prepared.params,
        );
        const summary = explainPlanSummary(result);
        plans.push(
          summary
            ? { ...base, status: 'captured', ...summary }
            : { ...base, status: 'skipped', reason: 'EXPLAIN returned an unsupported plan shape' },
        );
      } catch {
        plans.push({
          ...base,
          status: 'skipped',
          reason: `database rejected captured SELECT for ${mode === 'analyzed' ? 'EXPLAIN ANALYZE' : 'EXPLAIN'}`,
        });
      }
    }
    return plans;
  });
}

function endpointMeasurement(
  route: EndpointMeasurement['route'],
  samples: RequestMeasurement[],
  roundSamples: RequestMeasurement[][],
  signals: PerformanceConfig['p95Signals'],
  stageTimingEnabled: boolean,
): EndpointMeasurement {
  const rounds = roundSamples.map((round, index) => {
    const p95Ms = summarize(round.map((sample) => sample.latencyMs)).p95;
    return { round: index + 1, p95Ms, classification: classifyP95(p95Ms, signals) };
  });
  return {
    route,
    sampleCount: samples.length,
    latencyMs: summarize(samples.map((sample) => sample.latencyMs)),
    responseBytes: summarize(samples.map((sample) => sample.responseBytes)),
    queryEvents: summarize(samples.map((sample) => sample.queryEvents)),
    queryEventLabels: {
      application: samples.reduce(
        (total, sample) => total + sample.queryEvents - sample.rlsTransactionSetupQueryEvents,
        0,
      ),
      rlsTransactionSetup: samples.reduce(
        (total, sample) => total + sample.rlsTransactionSetupQueryEvents,
        0,
      ),
    },
    rounds,
    persistentInvestigationSignal: rounds.length > 0 && rounds.every((round) => round.classification !== 'normal'),
    persistentHighSignal: rounds.length > 0 && rounds.every((round) => round.classification === 'high'),
    stageTiming: summarizeRequestStages(samples, stageTimingEnabled, DASHBOARD_STAGES),
  };
}

export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item)) as T;
  if (value && typeof value === 'object') {
    const redacted = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[redacted]' : redactSensitive(item),
      ]),
    );
    return redacted as T;
  }
  if (typeof value === 'string') {
    return value
      .replace(EMAIL_PATTERN, '[redacted-email]')
      .replace(UUID_PATTERN, '[redacted-id]')
      .replace(BEARER_PATTERN, 'Bearer [redacted-token]') as T;
  }
  return value;
}

export function buildMarkdownReport(report: PerformanceReport): string {
  const safe = redactSensitive(report);
  const lines = [
    '# Analytics Phase 10 Performance',
    '',
    `Generated: ${safe.generatedAt}`,
    `Worktree: ${safe.worktreeReference}`,
    `Query plan mode: ${safe.queryPlanMode}`,
    `Request stage timing enabled: ${safe.stageTimingEnabled}`,
    '',
    `Configuration: task counts ${safe.config.taskCounts.join(', ')}, ${safe.config.eventsPerTask} events/task, ${safe.config.rounds} rounds × ${safe.config.samples} samples, ${safe.config.warmup} warmup`,
    '',
    '| Authentication route | Samples | Latency p50/p95 (ms) |',
    '| --- | ---: | ---: |',
    ...safe.authentication.map((endpoint) => {
      const route =
        endpoint.route === 'refresh-no-cookie'
          ? 'Refresh without cookie (204)'
          : endpoint.route === 'refresh'
            ? 'Refresh with cookie'
            : 'Login';
      return `| ${route} | ${endpoint.sampleCount} | ${endpoint.latencyMs.p50.toFixed(1)} / ${endpoint.latencyMs.p95.toFixed(1)} |`;
    }),
    '',
    '| Tasks | Events | Route | Samples | Latency p50/p95 (ms) | Bytes p50/p95 | Queries p50/p95 | RLS setup queries | Round p95 signals |',
    '| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const dataset of safe.datasets) {
    for (const endpoint of dataset.endpoints) {
      lines.push(
        `| ${dataset.taskCount} | ${dataset.eventCount} | ${endpoint.route} | ${endpoint.sampleCount} | ${endpoint.latencyMs.p50.toFixed(1)} / ${endpoint.latencyMs.p95.toFixed(1)} | ${endpoint.responseBytes.p50.toFixed(0)} / ${endpoint.responseBytes.p95.toFixed(0)} | ${endpoint.queryEvents.p50.toFixed(0)} / ${endpoint.queryEvents.p95.toFixed(0)} | ${endpoint.queryEventLabels.rlsTransactionSetup} | ${endpoint.rounds.map((round) => `${round.round}:${round.p95Ms.toFixed(1)}ms/${round.classification}`).join(', ')} |`,
      );
    }
  }
  lines.push(
    '',
    '## Dashboard task-list requests (separate from aggregates)',
    '',
    '| Tasks | Fixture distribution | Route | Request | Role | Warmup | Samples | Rounds | Concurrency | Latency p50/p95 (ms) | Bytes p50/p95 | Queries p50/p95 | Cold run | Stage timing | Query plan |',
    '| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |',
  );
  for (const dataset of safe.datasets) {
    for (const endpoint of dataset.taskLists) {
      lines.push(
        `| ${dataset.taskCount} | ${endpoint.dataset} | ${endpoint.route} | ${endpoint.request.method} ${endpoint.request.path}?${endpoint.request.query} | ${endpoint.request.actorRole} | ${endpoint.warmupPerEndpoint} | ${endpoint.sampleCount} | ${endpoint.rounds} | ${endpoint.concurrency} | ${endpoint.latencyMs.p50.toFixed(1)} / ${endpoint.latencyMs.p95.toFixed(1)} | ${endpoint.responseBytes.p50.toFixed(0)} / ${endpoint.responseBytes.p95.toFixed(0)} | ${endpoint.queryEvents.p50.toFixed(0)} / ${endpoint.queryEvents.p95.toFixed(0)} | ${endpoint.coldRun} | ${endpoint.stageTiming.requestsWithTimingEvent}/${endpoint.sampleCount} finish events | ${endpoint.queryPlan} |`,
      );
    }
  }
  lines.push(
    '',
    '## Request stage timings',
    '',
    `Enabled: ${safe.stageTimingEnabled}. Values are per-request stage samples; parallel stages are reported separately and are not summed. Warmups, controls, and diagnostic plan requests are excluded.`,
    '',
    '| Tasks | Endpoint | Stage | Endpoint samples | Finish events | Stage samples / expected | Stage p50/p95 (ms) | Note |',
    '| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |',
  );
  const appendStageRows = (
    taskCount: number | string,
    endpoint: string,
    sampleCount: number,
    timing: StageTimingSummary,
  ) => {
    for (const [stage, summary] of Object.entries(timing.stages)) {
      lines.push(
        `| ${taskCount} | ${endpoint} | ${stage} | ${sampleCount} | ${timing.requestsWithTimingEvent} | ${summary.sampleCount} / ${summary.expectedSampleCount} | ${summary.latencyMs ? `${summary.latencyMs.p50.toFixed(1)} / ${summary.latencyMs.p95.toFixed(1)}` : '—'} | ${timing.note ?? ''} |`,
      );
    }
  };
  for (const endpoint of safe.authentication) {
    appendStageRows('-', `auth/${endpoint.route}`, endpoint.sampleCount, endpoint.stageTiming);
  }
  for (const dataset of safe.datasets) {
    for (const endpoint of dataset.endpoints) {
      appendStageRows(dataset.taskCount, `dashboard/${endpoint.route}`, endpoint.sampleCount, endpoint.stageTiming);
    }
    for (const endpoint of dataset.taskLists) {
      appendStageRows(dataset.taskCount, `tasks/${endpoint.route}`, endpoint.sampleCount, endpoint.stageTiming);
    }
  }
  lines.push(
    '',
    '## Captured SELECT plans',
    '',
    `${safe.queryPlanMode === 'analyzed' ? 'Runtime plans from exact captured SELECT events; EXPLAIN ANALYZE BUFFERS.' : 'Estimated plans from exact captured SELECT events; EXPLAIN only (no ANALYZE).'} Aggregate query groups identify the source endpoint, not an inferred stage-timing label.`,
    '',
    '| Tasks | Source endpoint | Mode | Actor role | Replay actor | Query group | Event | Parameters | Planning ms | Execution ms | Status | Nodes (estimates / actuals / buffers / sort) | Reason |',
    '| ---: | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |',
  );
  for (const dataset of safe.datasets) {
    for (const plan of dataset.queryPlans) {
      const nodes = plan.nodes?.map((node) =>
        `${node.nodeType}/${node.relationName ?? '-'}/${node.indexName ?? '-'}:est=${node.planRows},${node.startupCost}-${node.totalCost};actual=${node.actualRows ?? '-' }x${node.actualLoops ?? '-'} ${node.actualStartupTimeMs ?? '-' }-${node.actualTotalTimeMs ?? '-'}ms;removed=${node.rowsRemovedByFilter ?? '-'};buffers=${JSON.stringify(node.buffers ?? {})};sort=${node.sortMethod ?? '-'}:${node.sortSpaceUsed ?? '-'}${node.sortSpaceType ?? ''}`,
      ).join('; ') ?? '';
      lines.push(
        `| ${dataset.taskCount} | ${plan.sourceEndpoint} | ${plan.mode} | ${plan.actorRole} | ${plan.replayActor} | ${plan.queryGroup} | ${plan.queryEvent} | ${plan.parameterCount} | ${plan.planningTimeMs ?? ''} | ${plan.executionTimeMs ?? ''} | ${plan.status} | ${nodes} | ${plan.reason ?? ''} |`,
      );
    }
  }
  lines.push('', `Decision: ${safe.decision.rationale}`, '');
  return lines.join('\n');
}

export function dashboardTaskListCases(teamId: string) {
  return [
    {
      route: 'all-teams' as const,
      path: '/tasks?includeArchived=true&limit=100',
      query: 'includeArchived=true&limit=100',
    },
    {
      route: 'team' as const,
      path: `/tasks?teamId=${encodeURIComponent(teamId)}&includeArchived=true&limit=100`,
      query: 'teamId=<fixture-team-id>&includeArchived=true&limit=100',
    },
  ];
}

export function fixtureActorForToken(token: string, accessTokens: string[], userIds: string[]): string {
  if (accessTokens.length === 0 || accessTokens.length !== userIds.length) {
    throw new Error('Performance fixture token and user mapping is invalid');
  }
  const index = accessTokens.indexOf(token);
  if (index < 0) throw new Error('Captured request token is not part of the performance fixture');
  return userIds[index];
}

function taskListMeasurement(
  route: TaskListEndpointMeasurement['route'],
  query: string,
  samples: RequestMeasurement[],
  config: PerformanceConfig,
  taskCount: number,
  stageTimingEnabled: boolean,
): TaskListEndpointMeasurement {
  return {
    route,
    request: { method: 'GET', path: '/api/v1/tasks', query, actorRole: 'companyAdmin' },
    effectiveLimit: 100,
    dataset:
      'synthetic fixture: one tenant and one team; dates across 90 days, priorities 1/3 high and 2/3 medium, all tasks assigned to fixture companyAdmin; archivedAt unset',
    warmupPerEndpoint: config.warmup,
    samplesPerRound: config.samples,
    rounds: config.rounds,
    concurrency: 1,
    coldRun: 'not measured',
    stageTiming: 'not captured',
    queryPlan: 'reported in dataset query plans',
    sampleCount: samples.length,
    latencyMs: summarize(samples.map((sample) => sample.latencyMs)),
    responseBytes: summarize(samples.map((sample) => sample.responseBytes)),
    queryEvents: summarize(samples.map((sample) => sample.queryEvents)),
    expectedTotal: taskCount,
    expectedRowsPerRequest: Math.min(taskCount, 100),
    stageTiming: summarizeRequestStages(samples, stageTimingEnabled, TASK_LIST_STAGES),
  };
}

function getWorktreeReference(): string {
  try {
    const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
    return `${revision} (${dirty ? 'dirty' : 'clean'})`;
  } catch {
    return 'unknown';
  }
}

export async function writeReportArtifacts(report: PerformanceReport, outputDirectory = DEFAULT_ARTIFACT_DIRECTORY) {
  await mkdir(outputDirectory, { recursive: true });
  const safeReport = redactSensitive(report);
  const jsonPath = resolve(outputDirectory, 'phase-10-report.json');
  const markdownPath = resolve(outputDirectory, 'phase-10-report.md');
  await writeFile(jsonPath, `${JSON.stringify(safeReport, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, buildMarkdownReport(safeReport), 'utf8');
  return { jsonPath, markdownPath };
}

async function measureDataset(
  baseUrl: string,
  fixture: PerformanceFixture,
  controlFixture: PerformanceFixture,
  config: PerformanceConfig,
) {
  const companyPath = '/company/dashboard?range=90d';
  const teamPath = `/teams/${fixture.teamId}/dashboard?range=90d`;
  const taskListPaths = dashboardTaskListCases(fixture.teamId);
  let tokenIndex = 0;
  const nextToken = () => fixture.accessTokens[tokenIndex++ % fixture.accessTokens.length];
  const taskListRequest = async (path: string, captureQueries = false, captureStages = false) => {
    const token = nextToken();
    const actorUserId = captureQueries
      ? fixtureActorForToken(token, fixture.accessTokens, fixture.userIds)
      : undefined;
    const sample = await request(baseUrl, token, path, 200, {
      captureQueries,
      captureStages: captureStages && env.REQUEST_STAGE_TIMING,
    });
    if (!evaluateTaskListResponse(sample.status, sample.body, fixture.taskCount).passed) {
      throw new Error('Dashboard task-list response count or pagination check failed');
    }
    return { ...sample, ...(actorUserId ? { diagnosticActorUserId: actorUserId } : {}) };
  };
  for (let index = 0; index < config.warmup; index += 1) {
    await request(baseUrl, nextToken(), companyPath, 200);
    await request(baseUrl, nextToken(), teamPath, 200);
    for (const taskList of taskListPaths) {
      await taskListRequest(taskList.path);
    }
  }

  const companySamples: RequestMeasurement[] = [];
  const teamSamples: RequestMeasurement[] = [];
  const companyRoundSamples: RequestMeasurement[][] = [];
  const teamRoundSamples: RequestMeasurement[][] = [];
  const taskListSamples = taskListPaths.map(() => [] as RequestMeasurement[]);
  for (let round = 0; round < config.rounds; round += 1) {
    const companyRound: RequestMeasurement[] = [];
    const teamRound: RequestMeasurement[] = [];
    for (let index = 0; index < config.samples; index += 1) {
      const companySample = await request(baseUrl, nextToken(), companyPath, 200, {
        captureStages: env.REQUEST_STAGE_TIMING,
      });
      const teamSample = await request(baseUrl, nextToken(), teamPath, 200, {
        captureStages: env.REQUEST_STAGE_TIMING,
      });
      companySamples.push(companySample);
      teamSamples.push(teamSample);
      companyRound.push(companySample);
      teamRound.push(teamSample);
      for (const [taskListIndex, taskList] of taskListPaths.entries()) {
        taskListSamples[taskListIndex].push(await taskListRequest(taskList.path, false, true));
      }
    }
    companyRoundSamples.push(companyRound);
    teamRoundSamples.push(teamRound);
  }

  const crossTenant = await request(
    baseUrl,
    nextToken(),
    `/teams/${controlFixture.teamId}/dashboard?range=90d`,
  );
  const controlResult = evaluateCrossTenantControl(
    crossTenant.status,
    crossTenant.body,
    controlFixture.teamId,
  );
  const correctness = {
    crossTenantStatus: crossTenant.status,
    ...controlResult,
  };
  if (!correctness.passed) throw new Error('Cross-tenant team dashboard control failed');

  const foreignTaskList = await request(
    baseUrl,
    nextToken(),
    `/tasks?teamId=${encodeURIComponent(controlFixture.teamId)}&includeArchived=true&limit=100`,
    200,
  );
  const taskListTenantControl = {
    status: foreignTaskList.status,
    ...evaluateTaskListTenantControl(
      foreignTaskList.status,
      foreignTaskList.body,
      controlFixture.taskId,
      controlFixture.teamId,
    ),
  };
  if (!taskListTenantControl.passed) throw new Error('Cross-tenant task-list control failed');

  const queryPlans: QueryPlanMeasurement[] = [];
  for (const [index, taskList] of taskListPaths.entries()) {
    const diagnostic = await taskListRequest(taskList.path, true);
    queryPlans.push(
      ...await captureQueryPlans(
        fixture,
        diagnostic.diagnosticActorUserId!,
        index === 0 ? 'task-list/all-teams' : 'task-list/team',
        diagnostic.capturedQueries ?? [],
        config.explainAnalyze ? 'analyzed' : 'estimated',
      ),
    );
  }
  for (const [path, source] of [
    [companyPath, 'aggregate/company'],
    [teamPath, 'aggregate/team'],
  ] as const) {
    const token = nextToken();
    const actorUserId = fixtureActorForToken(token, fixture.accessTokens, fixture.userIds);
    const diagnostic = await request(baseUrl, token, path, 200, { captureQueries: true });
    queryPlans.push(...await captureQueryPlans(
      fixture,
      actorUserId,
      source,
      diagnostic.capturedQueries ?? [],
      config.explainAnalyze ? 'analyzed' : 'estimated',
    ));
  }

  return {
    taskCount: fixture.taskCount,
    eventCount: fixture.eventCount,
    endpoints: [
      endpointMeasurement('company', companySamples, companyRoundSamples, config.p95Signals, env.REQUEST_STAGE_TIMING),
      endpointMeasurement('team', teamSamples, teamRoundSamples, config.p95Signals, env.REQUEST_STAGE_TIMING),
    ],
    taskLists: taskListPaths.map((taskList, index) =>
      taskListMeasurement(
        taskList.route,
        taskList.query,
        taskListSamples[index],
        config,
        fixture.taskCount,
        env.REQUEST_STAGE_TIMING,
      ),
    ),
    queryPlans,
    taskListTenantControl,
    taskListResponseCorrectness: {
      expectedTotal: fixture.taskCount,
      expectedRowsPerRequest: Math.min(fixture.taskCount, 100),
      maxRows: 100,
      passed: true,
    },
    correctness,
  };
}

function refreshCookie(sample: Awaited<ReturnType<typeof request>>): string {
  const cookie = sample.setCookie;
  if (!cookie?.startsWith('refreshToken=')) {
    throw new Error('Authentication benchmark response did not include a refresh cookie');
  }
  return cookie;
}

function authenticationEndpointMeasurement(
  route: AuthenticationEndpointMeasurement['route'],
  samples: RequestMeasurement[],
  stageTimingEnabled: boolean,
): AuthenticationEndpointMeasurement {
  const expectedStages = route === 'login'
    ? AUTH_LOGIN_STAGES
    : route === 'refresh'
      ? AUTH_REFRESH_STAGES
      : NO_COOKIE_REFRESH_STAGES;
  return {
    route,
    sampleCount: samples.length,
    latencyMs: summarize(samples.map((sample) => sample.latencyMs)),
    stageTiming: summarizeRequestStages(
      samples,
      stageTimingEnabled,
      expectedStages,
      route === 'refresh-no-cookie' ? 'No-cookie 204 has no DB/password stage; rate-limit timing is expected.' : undefined,
    ),
  };
}

function numericRequestMeasurement(
  sample: Awaited<ReturnType<typeof request>>,
): RequestMeasurement {
  return {
    status: sample.status,
    latencyMs: sample.latencyMs,
    responseBytes: sample.responseBytes,
    queryEvents: sample.queryEvents,
    rlsTransactionSetupQueryEvents: sample.rlsTransactionSetupQueryEvents,
    ...(sample.requestStages ? { requestStages: sample.requestStages } : {}),
    ...(sample.requestTimingEventReceived === undefined
      ? {}
      : { requestTimingEventReceived: sample.requestTimingEventReceived }),
  };
}

async function measureAuthentication(
  baseUrl: string,
  email: string,
  password: string,
  config: PerformanceConfig,
): Promise<AuthenticationEndpointMeasurement[]> {
  const plan = authenticationSamplePlan(config);
  const loginPath = '/auth/login';
  const refreshPath = '/auth/refresh';
  let refreshCookieValue: string | undefined;
  const loginSamples: RequestMeasurement[] = [];
  const successfulRefreshSamples: RequestMeasurement[] = [];
  const cookieLessRefreshSamples: RequestMeasurement[] = [];

  const login = async (captureStages = false) => {
    const sample = await request(baseUrl, undefined, loginPath, 200, {
      method: 'POST',
      body: { email, password },
      captureStages: captureStages && env.REQUEST_STAGE_TIMING,
    });
    refreshCookieValue = refreshCookie(sample);
    return sample;
  };
  for (let index = 0; index < plan.login.warmup; index += 1) await login();
  for (let index = 0; index < plan.login.samples; index += 1) {
    loginSamples.push(numericRequestMeasurement(await login(true)));
  }

  const refresh = async (captureStages = false) => {
    if (!refreshCookieValue) throw new Error('Authentication benchmark has no refresh cookie');
    const sample = await request(baseUrl, undefined, refreshPath, 200, {
      method: 'POST',
      cookie: refreshCookieValue,
      captureStages: captureStages && env.REQUEST_STAGE_TIMING,
    });
    refreshCookieValue = refreshCookie(sample);
    return sample;
  };
  for (let index = 0; index < plan.refresh.warmup; index += 1) await refresh();
  for (let index = 0; index < plan.refresh.samples; index += 1) {
    successfulRefreshSamples.push(numericRequestMeasurement(await refresh(true)));
  }

  for (let index = 0; index < plan.refreshWithoutCookie.warmup; index += 1) {
    await request(baseUrl, undefined, refreshPath, 204, { method: 'POST' });
  }
  for (let index = 0; index < plan.refreshWithoutCookie.samples; index += 1) {
    cookieLessRefreshSamples.push(
      numericRequestMeasurement(
        await request(baseUrl, undefined, refreshPath, 204, {
          method: 'POST',
          captureStages: env.REQUEST_STAGE_TIMING,
        }),
      ),
    );
  }

  return [
    authenticationEndpointMeasurement('login', loginSamples, env.REQUEST_STAGE_TIMING),
    authenticationEndpointMeasurement('refresh', successfulRefreshSamples, env.REQUEST_STAGE_TIMING),
    authenticationEndpointMeasurement('refresh-no-cookie', cookieLessRefreshSamples, env.REQUEST_STAGE_TIMING),
  ];
}

export async function runBenchmark(config = parsePerformanceConfig()): Promise<PerformanceReport> {
  const password = process.env.PERF_PASSWORD ?? 'PerfOnly-2026!';
  const requestsPerDataset = config.warmup * 4 + config.samples * config.rounds * 4 + 6;
  const sessionCount = requiredSessionCount(requestsPerDataset);
  const server = createApp().listen(0, '127.0.0.1');
  const datasets: PerformanceReport['datasets'] = [];
  let authentication: AuthenticationEndpointMeasurement[] | undefined;
  try {
    await new Promise<void>((resolvePromise, reject) => {
      server.once('listening', () => resolvePromise());
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Benchmark server did not expose port');
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    for (const taskCount of config.taskCounts) {
      const namespace = `perf-phase10-${taskCount}-${randomUUID()}`;
      let fixture: PerformanceFixture | undefined;
      let controlFixture: PerformanceFixture | undefined;
      let cleanupFailure: unknown;
      let workFailure: unknown;
      try {
        fixture = await createPerformanceFixture({
          slug: namespace,
          email: `${namespace}@taskflow.test`,
          password,
          taskCount,
          eventsPerTask: config.eventsPerTask,
          sessionCount,
        });
        controlFixture = await createPerformanceFixture({
          slug: `${namespace}-control`,
          email: `${namespace}-control@taskflow.test`,
          password,
          taskCount: 1,
          eventsPerTask: 0,
          sessionCount: 1,
        });
        if (!authentication) {
          authentication = await measureAuthentication(
            baseUrl,
            `${namespace}@taskflow.test`,
            password,
            config,
          );
        }
        datasets.push(await measureDataset(baseUrl, fixture, controlFixture, config));
      } catch (error) {
        workFailure = error;
      } finally {
        const fixturesToDelete = [controlFixture, fixture].filter(
          (candidate): candidate is PerformanceFixture => candidate !== undefined,
        );
        const cleanupResults = await Promise.allSettled(
          fixturesToDelete.map((candidate) => deletePerformanceFixture(candidate)),
        );
        const rejectedCleanup = cleanupResults.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        cleanupFailure = rejectedCleanup?.reason;
      }
      if (workFailure && cleanupFailure) {
        throw new AggregateError([workFailure, cleanupFailure], 'Benchmark cleanup failed');
      }
      if (workFailure) throw workFailure;
      if (cleanupFailure) throw cleanupFailure;
    }
  } finally {
    if (server.listening) {
      await new Promise<void>((resolvePromise, reject) =>
        server.close((error) => (error ? reject(error) : resolvePromise())),
      );
    }
    await prisma.$disconnect();
    await redis.quit();
  }

  const measuredTaskCounts = datasets.map((dataset) => dataset.taskCount);
  const unmeasuredDefaultTaskCounts = DEFAULT_TASK_COUNTS.filter(
    (taskCount) => !measuredTaskCounts.includes(taskCount),
  );
  if (!authentication) throw new Error('Authentication benchmark did not run');
  const investigationRequired = datasets.some((dataset) =>
    dataset.endpoints.some((endpoint) => endpoint.rounds.some((round) => round.classification !== 'normal')),
  );
  const persistentInvestigationRequired = datasets.some((dataset) =>
    dataset.endpoints.some((endpoint) => endpoint.persistentInvestigationSignal),
  );
  const measuredScaleStatement = persistentInvestigationRequired
    ? `Measured task sizes ${measuredTaskCounts.join(', ')} persistently exceeded the ${config.p95Signals.investigate}ms investigation signal in at least one route; query-plan review is required.`
    : investigationRequired
      ? `Measured task sizes ${measuredTaskCounts.join(', ')} crossed an investigation signal in at least one round, but not persistently across every round.`
      : `Measured task sizes ${measuredTaskCounts.join(', ')} did not persistently exceed the ${config.p95Signals.investigate}ms investigation signal.`;
  const scaleCaveat =
    unmeasuredDefaultTaskCounts.length > 0
      ? ` Unassessed default sizes: ${unmeasuredDefaultTaskCounts.join(', ')}; no conclusion is made for them.`
      : '';
  return {
    generatedAt: new Date().toISOString(),
    worktreeReference: getWorktreeReference(),
    queryPlanMode: config.explainAnalyze ? 'analyzed' : 'estimated',
    stageTimingEnabled: env.REQUEST_STAGE_TIMING,
    config,
    authentication,
    datasets,
    decision: {
      measuredTaskCounts,
      unmeasuredDefaultTaskCounts,
      investigationRequired,
      persistentInvestigationRequired,
      optimizationJustified: false,
      rationale: `${measuredScaleStatement}${scaleCaveat} Optimization remains unjustified without measured query-cost and staleness evidence.`,
    },
  };
}

async function main() {
  const report = await runBenchmark();
  const paths = await writeReportArtifacts(report);
  console.log(
    JSON.stringify(
      {
        report: paths,
        decision: report.decision,
        authentication: report.authentication,
        datasets: report.datasets,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
