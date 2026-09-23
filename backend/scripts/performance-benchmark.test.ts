import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMarkdownReport,
  classifyP95,
  evaluateCrossTenantControl,
  parsePerformanceConfig,
  percentile,
  request,
  retryAfterMilliseconds,
  requiredSessionCount,
  redactSensitive,
  summarize,
  writeReportArtifacts,
  type PerformanceReport,
} from './performance-benchmark';

describe('percentile', () => {
  it('uses nearest-rank percentile', () => {
    expect(percentile([5, 1, 4, 2, 3], 0.95)).toBe(5);
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
  });
});

describe('performance measurement helpers', () => {
  it('parses repeatable defaults and overrides', () => {
    expect(parsePerformanceConfig({})).toMatchObject({
      taskCounts: [100, 1000, 5000],
      eventsPerTask: 5,
      warmup: 3,
      samples: 30,
      rounds: 3,
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
      }),
    ).toMatchObject({
      taskCounts: [2, 4],
      eventsPerTask: 0,
      warmup: 0,
      samples: 2,
      rounds: 1,
      p95Signals: { investigate: 20, high: 40 },
    });
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
      config: {
        taskCounts: [2],
        eventsPerTask: 5,
        warmup: 1,
        samples: 2,
        rounds: 1,
        p95Signals: { investigate: 500, high: 800 },
      },
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
            },
          ],
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
      expect(markdown).toContain('| 2 | 10 | company |');
      expect(buildMarkdownReport(report)).toContain('Decision: keep current strategy');
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});
