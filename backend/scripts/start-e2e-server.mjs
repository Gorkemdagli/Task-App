import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendRequire = createRequire(resolve(backendDir, 'package.json'));
const { parse } = backendRequire('dotenv');
const testEnv = parse(readFileSync(resolve(backendDir, '.env.test')));

function requireLocalUrl(value, name, port, database) {
  const url = new URL(value);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.port !== String(port) ||
    (database && url.pathname !== `/${database}`)
  ) {
    throw new Error(`${name} must target the local TaskFlow E2E test service`);
  }
  return url;
}

requireLocalUrl(testEnv.DATABASE_URL, 'DATABASE_URL', 5433, 'taskflow_test');
if (testEnv.APP_DATABASE_URL) {
  requireLocalUrl(testEnv.APP_DATABASE_URL, 'APP_DATABASE_URL', 5433, 'taskflow_test');
}
requireLocalUrl(testEnv.REDIS_URL, 'REDIS_URL', 6380);
if (testEnv.PORT && testEnv.PORT !== '3001') {
  throw new Error('PORT in backend/.env.test must be 3001 for E2E');
}
if (testEnv.CLIENT_URL && !['http://localhost:5173', 'http://127.0.0.1:5173'].includes(testEnv.CLIENT_URL)) {
  throw new Error('CLIENT_URL in backend/.env.test must target the local Vite E2E server');
}

const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: backendDir,
  env: { ...process.env, NODE_ENV: 'test' },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}
child.once('error', (error) => {
  console.error('Could not start guarded E2E backend:', error.message);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
