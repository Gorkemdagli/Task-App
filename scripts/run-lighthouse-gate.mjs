import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function assertLocalOrigin(value) {
  const origin = new URL(value);
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname)) {
    throw new Error('Lighthouse gate is local-only');
  }
  return origin.origin;
}

export function getLighthousePaths(publicOnly) {
  return publicOnly ? ['/', '/login'] : ['/', '/login', '/dashboard'];
}

function commandName() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else if (code !== 0) reject(new Error(`${command} exited with ${code}`));
      else resolve();
    });
  });
}

async function waitFor(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function runLighthouseGate({ origin = 'http://127.0.0.1:4173', publicOnly = true } = {}) {
  const localOrigin = assertLocalOrigin(origin);
  const env = { ...process.env, LIGHTHOUSE_PUBLIC_ONLY: publicOnly ? '1' : '0' };
  const npm = commandName();

  await run(npm, ['run', 'build:frontend'], env);
  const preview = spawn(
    npm,
    ['run', 'preview', '--workspace=frontend', '--', '--host', '127.0.0.1', '--port', '4173'],
    { env, cwd: process.cwd(), stdio: 'inherit', shell: process.platform === 'win32' },
  );

  try {
    await waitFor(`${localOrigin}/`);
    await run(npm, ['exec', '--', 'lhci', 'autorun', '--config=./lighthouserc.cjs'], env);
  } finally {
    preview.kill('SIGTERM');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runLighthouseGate({
    origin: process.env.LIGHTHOUSE_ORIGIN ?? 'http://127.0.0.1:4173',
    publicOnly: process.env.LIGHTHOUSE_PUBLIC_ONLY !== '0',
  });
  console.log('local Lighthouse gate passed');
}
