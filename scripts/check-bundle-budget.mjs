import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

export const INITIAL_BUDGET = 200 * 1024;
export const ASYNC_BUDGET = 100 * 1024;

export function collectInitialFiles(manifest) {
  const files = new Set();
  const visited = new Set();
  const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry);

  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const chunk = manifest[name];
    if (!chunk) return;
    files.add(chunk.file);
    for (const imported of chunk.imports ?? []) visit(imported);
  }

  for (const [name] of entries) visit(name);
  return files;
}

export function evaluateBundleBudget({ manifest, readFile }) {
  const initialFiles = collectInitialFiles(manifest);
  const allFiles = new Set(Object.values(manifest).map((chunk) => chunk.file));
  const asyncFiles = [...allFiles].filter((file) => !initialFiles.has(file) && file.endsWith('.js'));
  const gzipSize = (file) => gzipSync(readFile(file)).byteLength;
  const initialSize = [...initialFiles]
    .filter((file) => file.endsWith('.js'))
    .reduce((total, file) => total + gzipSize(file), 0);
  const asyncSizes = asyncFiles.map((file) => ({ file, size: gzipSize(file) }));
  const failures = [];
  if (initialSize > INITIAL_BUDGET) {
    failures.push(`initial JavaScript gzip ${initialSize} bytes exceeds ${INITIAL_BUDGET} bytes`);
  }
  for (const { file, size } of asyncSizes) {
    if (size > ASYNC_BUDGET) {
      failures.push(`async JavaScript ${file} gzip ${size} bytes exceeds ${ASYNC_BUDGET} bytes`);
    }
  }
  return { initialFiles, asyncSizes, initialSize, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'check-bundle-budget.mjs')) {
  const distRoot = resolve(import.meta.dirname, '../frontend/dist');
  const manifestPath = resolve(distRoot, '.vite/manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const result = evaluateBundleBudget({
    manifest,
    readFile: (file) => readFileSync(resolve(distRoot, file)),
  });
  console.log(`initial gzip: ${result.initialSize} bytes / ${INITIAL_BUDGET}`);
  for (const item of result.asyncSizes) console.log(`async ${item.file}: ${item.size} bytes / ${ASYNC_BUDGET}`);
  if (result.failures.length) {
    for (const failure of result.failures) console.error(failure);
    process.exitCode = 1;
  }
}
