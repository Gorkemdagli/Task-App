import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CRITICAL_FILES = [
  'backend/src/middleware/auth.ts',
  'backend/src/lib/permissions.ts',
  'backend/src/http/runTenantRequest.ts',
  'backend/src/http/runUserRequest.ts',
];
export const DEFAULT_THRESHOLD = 85;

function normalize(value) {
  return value.replaceAll('\\', '/');
}

function findCoverageFile(coverage, requestedPath) {
  const wanted = normalize(requestedPath);
  return Object.entries(coverage).find(([filePath]) => {
    const normalized = normalize(filePath);
    return normalized === wanted || normalized.endsWith(`/${wanted}`);
  })?.[1];
}

function percent(values) {
  const counts = Object.values(values ?? {});
  const total = counts.length;
  if (total === 0) return null;
  const covered = counts.filter((count) => count > 0).length;
  return (covered / total) * 100;
}

function branchPercent(values) {
  const counts = Object.values(values ?? {}).flat();
  if (counts.length === 0) return null;
  const covered = counts.filter((count) => count > 0).length;
  return (covered / counts.length) * 100;
}

export function assertCriticalCoverage(coverage, criticalFiles, threshold = 100) {
  for (const requestedPath of criticalFiles) {
    const file = findCoverageFile(coverage, requestedPath);
    if (!file) throw new Error(`Missing critical coverage: ${requestedPath}`);

    const metrics = {
      statement: percent(file.s),
      function: percent(file.f),
      branch: branchPercent(file.b),
    };

    for (const [metric, actual] of Object.entries(metrics)) {
      if (actual !== null && actual < threshold) {
        throw new Error(
          `${requestedPath} ${metric} coverage ${actual.toFixed(1)}% is below ${threshold}%`,
        );
      }
    }
  }
}

export async function checkCriticalCoverage(
  coveragePath,
  criticalFiles = DEFAULT_CRITICAL_FILES,
  threshold = DEFAULT_THRESHOLD,
) {
  const raw = await readFile(coveragePath, 'utf8');
  const coverage = JSON.parse(raw);
  assertCriticalCoverage(coverage.result ?? coverage, criticalFiles, threshold);
  return { coveragePath, checkedFiles: criticalFiles.length, threshold };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const coveragePath = process.argv[2] ?? path.join('backend', 'coverage', 'coverage-final.json');
  const threshold = Number(process.env.CRITICAL_COVERAGE_THRESHOLD ?? DEFAULT_THRESHOLD);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error('CRITICAL_COVERAGE_THRESHOLD must be a number between 0 and 100');
  }
  const result = await checkCriticalCoverage(coveragePath, DEFAULT_CRITICAL_FILES, threshold);
  console.log(`critical coverage passed: ${result.checkedFiles} files at ${result.threshold}%`);
}
