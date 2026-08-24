import { fileURLToPath } from 'node:url';

const SAFE_POST_PATHS = new Set(['/api/v1/auth/refresh', '/api/v1/internal/archive']);

function normalizeOrigin(value, name) {
  if (!value) throw new Error(`${name} is required`);
  const origin = new URL(value);
  if (
    origin.protocol !== 'https:' ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error(`${name} must be an HTTPS origin`);
  }
  return origin.origin;
}

function assertNoCredentials(options) {
  if (options.credentials || options.accessToken || options.cookie || options.authToken) {
    throw new Error('Production smoke credentials are forbidden');
  }
}

function assertAllowedScenarios(scenarios = []) {
  for (const scenario of scenarios) {
    const method = (scenario.method ?? 'GET').toUpperCase();
    if (method === 'POST' && SAFE_POST_PATHS.has(scenario.path)) continue;
    if (!['GET', 'HEAD'].includes(method)) {
      throw new Error('Mutating production smoke scenario is forbidden');
    }
  }
}

async function request(fetchImpl, origin, path, method = 'GET') {
  if (method === 'POST' && !SAFE_POST_PATHS.has(path)) {
    throw new Error(`Forbidden production smoke method: ${method} ${path}`);
  }
  if (!['GET', 'HEAD', 'POST'].includes(method)) {
    throw new Error(`Forbidden production smoke method: ${method} ${path}`);
  }
  return fetchImpl(`${origin}${path}`, { method, credentials: 'omit' });
}

async function readJson(response, label) {
  try {
    return JSON.parse(await response.text());
  } catch {
    throw new Error(`Malformed ${label} response`);
  }
}

function requireStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label} expected ${expected}, received ${response.status}`);
  }
}

export async function runProductionSmoke(options = {}) {
  assertNoCredentials(options);
  assertAllowedScenarios(options.scenarios);
  const vercelOrigin = normalizeOrigin(options.vercelOrigin, 'vercelOrigin');
  const renderOrigin = normalizeOrigin(options.renderOrigin, 'renderOrigin');
  const fetchImpl = options.fetchImpl ?? fetch;

  for (const path of ['/', '/login', '/dashboard']) {
    requireStatus(await request(fetchImpl, vercelOrigin, path), 200, `Vercel ${path}`);
  }

  requireStatus(
    await request(fetchImpl, vercelOrigin, '/api/v1/auth/refresh', 'POST'),
    204,
    'Auth refresh',
  );
  requireStatus(
    await request(fetchImpl, vercelOrigin, '/api/v1/auth/not-allowed'),
    404,
    'Auth proxy allowlist',
  );

  requireStatus(await request(fetchImpl, renderOrigin, '/'), 200, 'Render root');
  const healthResponse = await request(fetchImpl, renderOrigin, '/api/v1/health');
  requireStatus(healthResponse, 200, 'Render health');
  const health = await readJson(healthResponse, 'health');
  if (health.status !== 'ok' || (options.expectedRelease && health.release !== options.expectedRelease)) {
    throw new Error('Render health contract failed');
  }

  const readyResponse = await request(fetchImpl, renderOrigin, '/api/v1/ready');
  requireStatus(readyResponse, 200, 'Render readiness');
  const ready = await readJson(readyResponse, 'readiness');
  if (
    ready.status !== 'ready' ||
    ready.services?.database !== 'up' ||
    ready.services?.redis !== 'up'
  ) {
    throw new Error('Render readiness contract failed');
  }

  requireStatus(await request(fetchImpl, renderOrigin, '/api/v1/unknown'), 404, 'Backend 404');
  requireStatus(
    await request(fetchImpl, renderOrigin, '/api/v1/internal/archive', 'POST'),
    401,
    'Unsigned archive',
  );

  return { checked: 10, release: health.release ?? null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runProductionSmoke({
    vercelOrigin: process.env.VERCEL_ORIGIN,
    renderOrigin: process.env.RENDER_ORIGIN,
    expectedRelease: process.env.TARGET_RELEASE,
  });
  console.log('production smoke passed');
}
