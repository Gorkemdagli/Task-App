import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Prisma } from '@prisma/client';
import { createApp } from '../src/app';
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
  p95Signals: { investigate: number; high: number };
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
};

export type PerformanceReport = {
  generatedAt: string;
  config: PerformanceConfig;
  datasets: Array<{
    taskCount: number;
    eventCount: number;
    endpoints: EndpointMeasurement[];
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
  return {
    taskCounts: parseIntegerList(env.PERF_TASK_COUNTS, DEFAULT_TASK_COUNTS, 'PERF_TASK_COUNTS'),
    eventsPerTask: nonNegativeInteger(env.PERF_EVENTS_PER_TASK, 5, 'PERF_EVENTS_PER_TASK'),
    warmup: nonNegativeInteger(env.PERF_WARMUP, 3, 'PERF_WARMUP'),
    samples: positiveInteger(env.PERF_SAMPLES, 30, 'PERF_SAMPLES'),
    rounds: positiveInteger(env.PERF_ROUNDS, 3, 'PERF_ROUNDS'),
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

function queryLabel(query: string): 'application' | 'rlsTransactionSetup' {
  return /set local role|set_config\(/i.test(query) ? 'rlsTransactionSetup' : 'application';
}

let activeQueryLabels: Array<'application' | 'rlsTransactionSetup'> | undefined;
prisma.$on('query', (event: Prisma.QueryEvent) => {
  activeQueryLabels?.push(queryLabel(event.query));
});

export async function request(
  baseUrl: string,
  token: string,
  path: string,
  expectedStatus?: number,
): Promise<RequestMeasurement & { body: string }> {
  let retryAfterMs = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (retryAfterMs > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, retryAfterMs));
    const labels: Array<'application' | 'rlsTransactionSetup'> = [];
    activeQueryLabels = labels;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { authorization: `Bearer ${token}` },
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
      };
    } finally {
      activeQueryLabels = undefined;
    }
  }
  throw new Error(`${path} returned 429 after bounded retries`);
}

function endpointMeasurement(
  route: EndpointMeasurement['route'],
  samples: RequestMeasurement[],
  roundSamples: RequestMeasurement[][],
  signals: PerformanceConfig['p95Signals'],
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
    '',
    `Configuration: task counts ${safe.config.taskCounts.join(', ')}, ${safe.config.eventsPerTask} events/task, ${safe.config.rounds} rounds × ${safe.config.samples} samples, ${safe.config.warmup} warmup`,
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
  lines.push('', `Decision: ${safe.decision.rationale}`, '');
  return lines.join('\n');
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
  let tokenIndex = 0;
  const nextToken = () => fixture.accessTokens[tokenIndex++ % fixture.accessTokens.length];
  for (let index = 0; index < config.warmup; index += 1) {
    await request(baseUrl, nextToken(), companyPath, 200);
    await request(baseUrl, nextToken(), teamPath, 200);
  }

  const companySamples: RequestMeasurement[] = [];
  const teamSamples: RequestMeasurement[] = [];
  const companyRoundSamples: RequestMeasurement[][] = [];
  const teamRoundSamples: RequestMeasurement[][] = [];
  for (let round = 0; round < config.rounds; round += 1) {
    const companyRound: RequestMeasurement[] = [];
    const teamRound: RequestMeasurement[] = [];
    for (let index = 0; index < config.samples; index += 1) {
      const companySample = await request(baseUrl, nextToken(), companyPath, 200);
      const teamSample = await request(baseUrl, nextToken(), teamPath, 200);
      companySamples.push(companySample);
      teamSamples.push(teamSample);
      companyRound.push(companySample);
      teamRound.push(teamSample);
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

  return {
    taskCount: fixture.taskCount,
    eventCount: fixture.eventCount,
    endpoints: [
      endpointMeasurement('company', companySamples, companyRoundSamples, config.p95Signals),
      endpointMeasurement('team', teamSamples, teamRoundSamples, config.p95Signals),
    ],
    correctness,
  };
}

export async function runBenchmark(config = parsePerformanceConfig()): Promise<PerformanceReport> {
  const password = process.env.PERF_PASSWORD ?? 'PerfOnly-2026!';
  const requestsPerDataset = config.warmup * 2 + config.samples * config.rounds * 2 + 1;
  const sessionCount = requiredSessionCount(requestsPerDataset);
  const server = createApp().listen(0, '127.0.0.1');
  const datasets: PerformanceReport['datasets'] = [];
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
    config,
    datasets,
    decision: {
      measuredTaskCounts,
      unmeasuredDefaultTaskCounts,
      investigationRequired,
      persistentInvestigationRequired,
      optimizationJustified: false,
      rationale: `${measuredScaleStatement}${scaleCaveat} Optimization remains unjustified without measured query-cost, refresh, and staleness evidence.`,
    },
  };
}

async function main() {
  const report = await runBenchmark();
  const paths = await writeReportArtifacts(report);
  console.log(JSON.stringify({ report: paths, decision: report.decision, datasets: report.datasets }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
