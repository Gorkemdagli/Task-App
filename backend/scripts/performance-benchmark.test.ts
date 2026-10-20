import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { channel } from 'node:diagnostics_channel';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMarkdownReport,
  dashboardTaskListCases,
  classifyP95,
  authenticationSamplePlan,
  evaluateCrossTenantControl,
  evaluateTaskListResponse,
  evaluateTaskListTenantControl,
  explainCommand,
  explainPlanNodes,
  explainPlanSummary,
  fixtureActorForToken,
  parsePerformanceConfig,
  percentile,
  request,
  prepareExplainQuery,
  recordPerformanceQueryEvent,
  retryAfterMilliseconds,
  requiredSessionCount,
  redactSensitive,
  summarize,
  summarizeRequestStages,
  writeReportArtifacts,
  type PerformanceReport,
} from './performance-benchmark';

const requestTimingChannel = channel('taskflow.request-timing');

describe('percentile', () => {
  it('uses nearest-rank percentile', () => {
    expect(percentile([5, 1, 4, 2, 3], 0.95)).toBe(5);
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
  });
});

describe('performance measurement helpers', () => {
  it('correlates a finished stage event to only its measured request body', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => {
        requestTimingChannel.publish({
          method: 'GET',
          route: '/api/v1/tasks',
          finished: true,
          stages: { task_list_find_many_elapsed_ms: 12.4 },
        });
        return new Response('complete-body', { status: 200 });
      })
      .mockResolvedValueOnce(new Response('next-body', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const measured = await request('http://127.0.0.1/api/v1', 'token', '/tasks?limit=100', 200, {
        captureStages: true,
      });
      const next = await request('http://127.0.0.1/api/v1', 'token', '/tasks?limit=100', 200, {
        captureStages: true,
      });
      expect(measured.body).toBe('complete-body');
      expect(measured.requestTimingEventReceived).toBe(true);
      expect(measured.requestStages).toEqual({ task_list_find_many_elapsed_ms: 12.4 });
      expect(next.requestTimingEventReceived).toBe(false);
      expect(next.requestStages).toEqual({});
      expect(requestTimingChannel.hasSubscribers).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not subscribe to or return stage data for unmeasured requests', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      expect(requestTimingChannel.hasSubscribers).toBe(false);
      requestTimingChannel.publish({
        method: 'GET', route: '/api/v1/tasks', finished: true, stages: { task_list_count_elapsed_ms: 9 },
      });
      return new Response('warmup-body', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const warmup = await request('http://127.0.0.1/api/v1', 'token', '/tasks', 200);
      expect(warmup.requestStages).toBeUndefined();
      expect(warmup.requestTimingEventReceived).toBeUndefined();
      expect(warmup.body).toBe('warmup-body');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports stage p50/p95 and missing samples against the measured endpoint count', () => {
    const summary = summarizeRequestStages([
      {
        status: 200, latencyMs: 1, responseBytes: 1, queryEvents: 0, rlsTransactionSetupQueryEvents: 0,
        requestTimingEventReceived: true, requestStages: { task_list_count_elapsed_ms: 2 },
      },
      {
        status: 200, latencyMs: 2, responseBytes: 1, queryEvents: 0, rlsTransactionSetupQueryEvents: 0,
        requestTimingEventReceived: true, requestStages: { task_list_count_elapsed_ms: 4 },
      },
    ], true, ['task_list_find_many_elapsed_ms', 'task_list_count_elapsed_ms']);
    expect(summary.requestsWithTimingEvent).toBe(2);
    expect(summary.stages.task_list_count_elapsed_ms).toMatchObject({
      sampleCount: 2,
      expectedSampleCount: 2,
      latencyMs: { p50: 2, p95: 4 },
    });
    expect(summary.stages.task_list_find_many_elapsed_ms).toMatchObject({
      sampleCount: 0,
      expectedSampleCount: 2,
      latencyMs: null,
    });
  });

  it('links each diagnostic fixture token to its trusted actor and rejects mismatches', () => {
    expect(fixtureActorForToken('token-2', ['token-1', 'token-2'], ['user-1', 'user-2'])).toBe('user-2');
    expect(() => fixtureActorForToken('foreign-token', ['token-1'], ['user-1'])).toThrow(
      'Captured request token is not part of the performance fixture',
    );
    expect(() => fixtureActorForToken('token-1', ['token-1', 'token-2'], ['user-1'])).toThrow(
      'Performance fixture token and user mapping is invalid',
    );
  });

  it('checks the current task-list page size and total before recording samples', () => {
    expect(evaluateTaskListResponse(200, JSON.stringify({ tasks: Array(100).fill({}), total: 5000 }), 5000)).toEqual({
      returned: 100,
      total: 5000,
      passed: true,
    });
    expect(evaluateTaskListResponse(200, '{"tasks":[],"total":0}', 5000).passed).toBe(false);
    expect(evaluateTaskListResponse(500, '{"tasks":[],"total":0}', 0).passed).toBe(false);
  });

  it('requires a successful empty result for a foreign-team task-list control', () => {
    expect(evaluateTaskListTenantControl(200, '{"tasks":[],"total":0}', 'foreign-task', 'foreign-team'))
      .toEqual({ noForeignData: true, passed: true });
    expect(evaluateTaskListTenantControl(
      200,
      '{"tasks":[{"id":"foreign-task"}],"total":1}',
      'foreign-task',
      'foreign-team',
    ).passed).toBe(false);
  });

  it('captures only exact query text in memory and reports prepared parameters safely', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      recordPerformanceQueryEvent({ query: 'SELECT * FROM "Task" WHERE id = $1', params: '["fixture-secret"]' });
      return new Response('ok', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const measurement = await request('http://127.0.0.1', 'token', '/tasks', 200, { captureQueries: true });
      expect(measurement.capturedQueries).toEqual([
        { query: 'SELECT * FROM "Task" WHERE id = $1', params: '["fixture-secret"]' },
      ]);
      expect(prepareExplainQuery('SELECT * FROM "Task" WHERE id = $1', '["fixture-secret"]')).toEqual({
        query: 'SELECT * FROM "Task" WHERE id = $1',
        params: ['fixture-secret'],
      });
      expect(prepareExplainQuery('UPDATE "Task" SET title = $1', '["x"]')).toEqual({
        reason: 'captured statement is not a single SELECT',
      });
      expect(prepareExplainQuery('WITH changed AS (DELETE FROM "Task") SELECT * FROM changed', '[]'))
        .toMatchObject({ reason: 'captured statement is not a single SELECT' });
      expect(prepareExplainQuery('SELECT $1', '[{"unsupported":true}]')).toMatchObject({
        reason: 'captured parameters contain unsupported values',
      });
      expect(prepareExplainQuery('SELECT $2', '["x"]')).toMatchObject({
        reason: 'captured placeholder shape does not match parameters',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('summarizes estimated plan nodes without retaining SQL or bind values', () => {
    const nodes = explainPlanNodes([{ 'QUERY PLAN': [{ Plan: {
      'Node Type': 'Index Scan',
      'Relation Name': 'Task',
      'Index Name': 'Task_tenantId_idx',
      'Plan Rows': 100,
      'Startup Cost': 0.4,
      'Total Cost': 12.8,
      Plans: [{
        'Node Type': 'Seq Scan',
        'Relation Name': 'Team',
        'Plan Rows': 1,
        'Startup Cost': 0,
        'Total Cost': 1.2,
      }],
    } }] }]);
    expect(nodes).toEqual([
      { nodeType: 'Index Scan', relationName: 'Task', indexName: 'Task_tenantId_idx', planRows: 100, startupCost: 0.4, totalCost: 12.8 },
      { nodeType: 'Seq Scan', relationName: 'Team', planRows: 1, startupCost: 0, totalCost: 1.2 },
    ]);
  });

  it('retains runtime plan, buffer, filter, sort, and overall timing fields when present', () => {
    const summary = explainPlanSummary([{ 'QUERY PLAN': [{
      'Planning Time': 0.21,
      'Execution Time': 2.7,
      Plan: {
        'Node Type': 'Sort',
        'Plan Rows': 8,
        'Startup Cost': 1,
        'Total Cost': 4,
        'Actual Rows': 8,
        'Actual Loops': 1,
        'Actual Startup Time': 0.3,
        'Actual Total Time': 2.4,
        'Rows Removed by Filter': 3,
        'Shared Hit Blocks': 12,
        'Shared Read Blocks': 2,
        'Sort Method': 'quicksort',
        'Sort Space Used': 25,
        'Sort Space Type': 'Memory',
      },
    }] }]);
    expect(summary).toEqual({
      planningTimeMs: 0.21,
      executionTimeMs: 2.7,
      nodes: [{
        nodeType: 'Sort',
        planRows: 8,
        startupCost: 1,
        totalCost: 4,
        actualRows: 8,
        actualLoops: 1,
        actualStartupTimeMs: 0.3,
        actualTotalTimeMs: 2.4,
        rowsRemovedByFilter: 3,
        buffers: { sharedHitBlocks: 12, sharedReadBlocks: 2 },
        sortMethod: 'quicksort',
        sortSpaceUsed: 25,
        sortSpaceType: 'Memory',
      }],
    });
    expect(explainCommand('estimated')).toBe('EXPLAIN (FORMAT JSON)');
    expect(explainCommand('analyzed')).toBe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)');
  });

  it('matches dashboard all-team and selected-team task-list requests', () => {
    expect(dashboardTaskListCases('team-id')).toEqual([
      {
        route: 'all-teams',
        path: '/tasks?includeArchived=true&limit=100',
        query: 'includeArchived=true&limit=100',
      },
      {
        route: 'team',
        path: '/tasks?teamId=team-id&includeArchived=true&limit=100',
        query: 'teamId=<fixture-team-id>&includeArchived=true&limit=100',
      },
    ]);
  });

  it('parses repeatable defaults and overrides', () => {
    expect(parsePerformanceConfig({})).toMatchObject({
      taskCounts: [100, 1000, 5000],
      eventsPerTask: 5,
      warmup: 3,
      samples: 30,
      rounds: 3,
      explainAnalyze: false,
      p95Signals: { investigate: 500, high: 800 },
    });
    expect(
      parsePerformanceConfig({
        PERF_TASK_COUNTS: '2,4',
        PERF_EVENTS_PER_TASK: '0',
        PERF_WARMUP: '0',
        PERF_SAMPLES: '2',
        PERF_ROUNDS: '1',
        PERF_P95_SIGNALS: '20,40',
        PERF_EXPLAIN_ANALYZE: 'false',
      }),
    ).toMatchObject({
      taskCounts: [2, 4],
      eventsPerTask: 0,
      warmup: 0,
      samples: 2,
      rounds: 1,
      explainAnalyze: false,
      p95Signals: { investigate: 20, high: 40 },
    });
    expect(parsePerformanceConfig({ PERF_EXPLAIN_ANALYZE: 'true' }).explainAnalyze).toBe(true);
    expect(() => parsePerformanceConfig({ PERF_EXPLAIN_ANALYZE: 'yes' })).toThrow(
      'PERF_EXPLAIN_ANALYZE must be true or false',
    );
  });

  it('summarizes latency with nearest-rank p50 and p95', () => {
    expect(summarize([5, 1, 4, 2, 3])).toMatchObject({
      count: 5,
      min: 1,
      max: 5,
      p50: 3,
      p95: 5,
      mean: 3,
    });
  });

  it('classifies investigation signals without turning them into a CI gate', () => {
    const signals = { investigate: 500, high: 800 };
    expect(classifyP95(500, signals)).toBe('normal');
    expect(classifyP95(501, signals)).toBe('investigate');
    expect(classifyP95(801, signals)).toBe('high');
  });

  it('sizes the pre-issued session pool below the authenticated-read limit', () => {
    expect(requiredSessionCount(119, 120)).toBe(1);
    expect(requiredSessionCount(120, 120)).toBe(2);
    expect(requiredSessionCount(1_000, 120)).toBe(9);
  });

  it('keeps authentication warmups and samples below their route limits', () => {
    const config = parsePerformanceConfig({
      PERF_WARMUP: '3',
      PERF_SAMPLES: '30',
      PERF_ROUNDS: '3',
    });
    const plan = authenticationSamplePlan(config, 10, 10);
    expect(plan).toEqual({
      login: { warmup: 3, samples: 6 },
      refresh: { warmup: 3, samples: 2 },
      refreshWithoutCookie: { warmup: 3, samples: 1 },
    });
    expect(plan.login.warmup + plan.login.samples).toBeLessThan(10);
    expect(
      plan.refresh.warmup + plan.refresh.samples + plan.refreshWithoutCookie.warmup +
        plan.refreshWithoutCookie.samples,
    ).toBeLessThan(10);
    expect(() => authenticationSamplePlan(config, 1, 3)).toThrow(
      'Authentication rate limits must allow at least one sample per route',
    );
  });

  it('retries a rate-limited route outside the measured sample', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('retry', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const measurement = await request('http://127.0.0.1', 'token', '/dashboard', 200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(measurement.status).toBe(200);
      expect(measurement.body).toBe('ok');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('supports login and refresh request bodies and captures only the cookie header value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('ok', {
        status: 200,
        headers: { 'set-cookie': 'refreshToken=rotated-secret; HttpOnly; Path=/' },
      }),
    ).mockResolvedValueOnce(
      new Response('ok', {
        status: 200,
        headers: { 'set-cookie': 'refreshToken=rotated-secret; HttpOnly; Path=/' },
      }),
    ).mockResolvedValueOnce(
      new Response('ok', {
        status: 200,
        headers: { 'set-cookie': 'refreshToken=next-secret; HttpOnly; Path=/' },
      }),
    ).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const measurement = await request('http://127.0.0.1', undefined, '/auth/login', 200, {
        method: 'POST',
        body: { email: 'private@example.test', password: 'secret' },
      });
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'private@example.test', password: 'secret' }),
      });
      expect(measurement.setCookie).toBe('refreshToken=rotated-secret');
      await request('http://127.0.0.1', undefined, '/auth/refresh', 200, {
        method: 'POST',
        cookie: measurement.setCookie!,
      });
      expect(fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1/auth/refresh', {
        method: 'POST',
        headers: { cookie: 'refreshToken=rotated-secret' },
      });
      await request('http://127.0.0.1', undefined, '/auth/refresh', 204, { method: 'POST' });
      expect(fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1/auth/refresh', {
        method: 'POST',
        headers: {},
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('parses Retry-After seconds with a bounded wait', () => {
    expect(retryAfterMilliseconds('0')).toBe(0);
    expect(retryAfterMilliseconds('120')).toBe(60_000);
  });

  it('requires a denied cross-tenant response without foreign data', () => {
    expect(evaluateCrossTenantControl(404, '{"error":"not found"}', 'foreign-team-id')).toEqual({
      noForeignData: true,
      passed: true,
    });
    expect(evaluateCrossTenantControl(200, '{"teamId":"foreign-team-id"}', 'foreign-team-id')).toEqual({
      noForeignData: false,
      passed: false,
    });
  });

  it('redacts secrets, emails, and identifiers before report output', () => {
    const value = redactSensitive({
      password: 'secret',
      email: 'person@example.test',
      tenantId: '0b9f1f47-8d4d-4f8d-b4ad-5f5c5aa2b6de',
      note: 'Bearer abc and person@example.test',
    });
    expect(value).toEqual({
      password: '[redacted]',
      email: '[redacted]',
      tenantId: '[redacted]',
      note: 'Bearer [redacted-token] and [redacted-email]',
    });
  });

  it('writes JSON and Markdown report artifacts', async () => {
    const report = {
      generatedAt: '2026-09-17T00:00:00.000Z',
      worktreeReference: 'test-revision (dirty)',
      config: {
        taskCounts: [2],
        eventsPerTask: 5,
        warmup: 1,
        samples: 2,
        rounds: 1,
        explainAnalyze: false,
        p95Signals: { investigate: 500, high: 800 },
      },
      queryPlanMode: 'estimated' as const,
      stageTimingEnabled: true,
      authentication: [
        {
          route: 'login' as const,
          sampleCount: 2,
          latencyMs: summarize([5, 10]),
          stageTiming: summarizeRequestStages([
            {
              status: 200, latencyMs: 1, responseBytes: 1, queryEvents: 0, rlsTransactionSetupQueryEvents: 0,
              requestTimingEventReceived: true,
              requestStages: { auth_db_ms: 5, password_verify_ms: 5 },
            },
            {
              status: 200, latencyMs: 2, responseBytes: 1, queryEvents: 0, rlsTransactionSetupQueryEvents: 0,
              requestTimingEventReceived: true,
              requestStages: { auth_db_ms: 10, password_verify_ms: 10 },
            },
          ], true, ['auth_db_ms', 'password_verify_ms']),
        },
        {
          route: 'refresh' as const,
          sampleCount: 2,
          latencyMs: summarize([8, 16]),
          stageTiming: { requestsWithTimingEvent: 2, stages: {} },
        },
        {
          route: 'refresh-no-cookie' as const,
          sampleCount: 2,
          latencyMs: summarize([1, 2]),
          stageTiming: {
            requestsWithTimingEvent: 2,
            stages: {},
            note: 'No-cookie 204 has no DB/password stage; rate-limit timing is expected.',
          },
        },
      ],
      datasets: [
        {
          taskCount: 2,
          eventCount: 10,
          endpoints: [
            {
              route: 'company' as const,
              sampleCount: 2,
              latencyMs: summarize([10, 20]),
              responseBytes: summarize([100, 120]),
              queryEvents: summarize([8, 8]),
              queryEventLabels: { application: 10, rlsTransactionSetup: 6 },
              rounds: [{ round: 1, p95Ms: 20, classification: 'normal' as const }],
              persistentInvestigationSignal: false,
              persistentHighSignal: false,
              stageTiming: { requestsWithTimingEvent: 2, stages: {} },
            },
          ],
          taskLists: [
            {
              route: 'all-teams' as const,
              request: {
                method: 'GET' as const,
                path: '/api/v1/tasks' as const,
                query: 'includeArchived=true&limit=100',
                actorRole: 'companyAdmin' as const,
              },
              effectiveLimit: 100 as const,
              dataset: 'synthetic one-team fixture',
              warmupPerEndpoint: 1,
              samplesPerRound: 2,
              rounds: 1,
              concurrency: 1 as const,
              coldRun: 'not measured' as const,
              queryPlan: 'reported in dataset query plans' as const,
              sampleCount: 2,
              latencyMs: summarize([5, 10]),
              responseBytes: summarize([100, 120]),
              queryEvents: summarize([4, 4]),
              expectedTotal: 2,
              expectedRowsPerRequest: 2,
              stageTiming: {
                requestsWithTimingEvent: 2,
                stages: { task_list_find_many_elapsed_ms: {
                  sampleCount: 2,
                  expectedSampleCount: 2,
                  latencyMs: summarize([5, 10]),
                } },
              },
            },
            {
              route: 'team' as const,
              request: {
                method: 'GET' as const,
                path: '/api/v1/tasks' as const,
                query: 'teamId=<fixture-team-id>&includeArchived=true&limit=100',
                actorRole: 'companyAdmin' as const,
              },
              effectiveLimit: 100 as const,
              dataset: 'synthetic one-team fixture',
              warmupPerEndpoint: 1,
              samplesPerRound: 2,
              rounds: 1,
              concurrency: 1 as const,
              coldRun: 'not measured' as const,
              queryPlan: 'reported in dataset query plans' as const,
              sampleCount: 2,
              latencyMs: summarize([6, 12]),
              responseBytes: summarize([110, 130]),
              queryEvents: summarize([4, 4]),
              expectedTotal: 2,
              expectedRowsPerRequest: 2,
              stageTiming: {
                requestsWithTimingEvent: 2,
                stages: { task_list_find_many_elapsed_ms: {
                  sampleCount: 2,
                  expectedSampleCount: 2,
                  latencyMs: summarize([6, 12]),
                } },
              },
            },
          ],
          queryPlans: [
            {
              sourceEndpoint: 'task-list/all-teams' as const,
              actorRole: 'companyAdmin' as const,
              replayActor: 'same fixture actor as captured request' as const,
              queryGroup: 'fingerprint-123',
              queryEvent: 1,
              parameterCount: 2,
              mode: 'estimated' as const,
              status: 'captured' as const,
              nodes: [{
                nodeType: 'Index Scan',
                relationName: 'Task',
                indexName: 'Task_tenantId_idx',
                planRows: 2,
                startupCost: 0.1,
                totalCost: 1.2,
              }],
            },
            {
              sourceEndpoint: 'aggregate/company' as const,
              actorRole: 'companyAdmin' as const,
              replayActor: 'same fixture actor as captured request' as const,
              queryGroup: 'fingerprint-456',
              queryEvent: 2,
              parameterCount: 0,
              mode: 'estimated' as const,
              status: 'skipped' as const,
              reason: 'captured parameters contain unsupported values',
            },
          ],
          taskListTenantControl: { status: 200, noForeignData: true, passed: true },
          taskListResponseCorrectness: {
            expectedTotal: 2,
            expectedRowsPerRequest: 2,
            maxRows: 100 as const,
            passed: true as const,
          },
          correctness: { crossTenantStatus: 404, noForeignData: true, passed: true },
        },
      ],
      decision: {
        investigationRequired: false,
        measuredTaskCounts: [2],
        unmeasuredDefaultTaskCounts: [100, 1000, 5000],
        persistentInvestigationRequired: false,
        optimizationJustified: false as const,
        rationale: 'keep current strategy',
      },
    } satisfies PerformanceReport;
    const outputDirectory = await mkdtemp(join(tmpdir(), 'phase10-report-'));
    try {
      const paths = await writeReportArtifacts(report, outputDirectory);
      const json = await readFile(paths.jsonPath, 'utf8');
      const markdown = await readFile(paths.markdownPath, 'utf8');
      expect(JSON.parse(json)).toMatchObject({ datasets: [{ taskCount: 2, eventCount: 10 }] });
      expect(JSON.parse(json).authentication).toHaveLength(3);
      expect(JSON.parse(json).datasets[0].taskLists[0].stageTiming.stages.task_list_find_many_elapsed_ms)
        .toMatchObject({ sampleCount: 2, expectedSampleCount: 2, latencyMs: { p50: 5, p95: 10 } });
      expect(markdown).toContain('| 2 | 10 | company |');
      expect(markdown).toContain('| Login | 2 | 5.0 / 10.0 |');
      expect(markdown).toContain('Dashboard task-list requests (separate from aggregates)');
      expect(markdown).toContain('GET /api/v1/tasks?includeArchived=true&limit=100 | companyAdmin | 1 | 2 | 1 | 1');
      expect(markdown).toContain('GET /api/v1/tasks?teamId=<fixture-team-id>&includeArchived=true&limit=100');
      expect(markdown).toContain('Worktree: test-revision (dirty)');
      expect(markdown).toContain('Captured SELECT plans');
      expect(markdown).toContain('Query plan mode: estimated');
      expect(markdown).toContain('Request stage timing enabled: true');
      expect(markdown).toContain('| - | auth/login | bcrypt_verify_ms | 2 | 2 | 2 / 2 | 5.0 / 10.0 |');
      expect(markdown).toContain('| 2 | tasks/all-teams | task_list_find_many_elapsed_ms | 2 | 2 | 2 / 2 | 5.0 / 10.0 |');
      expect(markdown).toContain('Task_tenantId_idx');
      expect(json).not.toContain('SELECT * FROM');
      expect(json).not.toContain('fixture-secret');
      expect(markdown).toContain('| Refresh with cookie | 2 | 8.0 / 16.0 |');
      expect(markdown).toContain('| Refresh without cookie (204) | 2 | 1.0 / 2.0 |');
      expect(buildMarkdownReport(report)).toContain('Decision: keep current strategy');
      const writtenPlan = JSON.parse(json).datasets[0].queryPlans[0];
      expect(writtenPlan).not.toHaveProperty('query');
      expect(writtenPlan).not.toHaveProperty('params');
      const writtenLoginStages = JSON.parse(json).authentication[0].stageTiming.stages;
      expect(writtenLoginStages.bcrypt_verify_ms).toMatchObject({
        sampleCount: 2,
        expectedSampleCount: 2,
        latencyMs: { p50: 5, p95: 10 },
      });
      expect(writtenLoginStages).not.toHaveProperty('password_verify_ms');
      expect(json).not.toContain('password_verify_ms');
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});
