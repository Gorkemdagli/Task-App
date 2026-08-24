import { fileURLToPath } from 'node:url';

async function readJson(response, label) {
  try {
    return JSON.parse(await response.text());
  } catch {
    throw new Error(`Malformed ${label} response`);
  }
}

function delay(milliseconds) {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();
}

function assertHttpsEndpoint(value, name) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(`${name} must use HTTPS`);
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
    throw new Error(`${name} must use HTTPS`);
  }
  return endpoint.href;
}

export async function verifyRelease(options) {
  const {
    healthUrl,
    readyUrl,
    targetRelease,
    fetchImpl = fetch,
    pollIntervalMs = 2_000,
    timeoutMs = 120_000,
  } = options;
  if (!healthUrl || !readyUrl || !targetRelease) throw new Error('Release verification inputs are required');
  const validatedHealthUrl = assertHttpsEndpoint(healthUrl, 'healthUrl');
  const validatedReadyUrl = assertHttpsEndpoint(readyUrl, 'readyUrl');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const healthResponse = await fetchImpl(validatedHealthUrl, { method: 'GET', credentials: 'omit' });
    if (healthResponse.status === 200) {
      const health = await readJson(healthResponse, 'health');
      if (health.status === 'ok' && health.release === targetRelease) {
        const readyResponse = await fetchImpl(validatedReadyUrl, { method: 'GET', credentials: 'omit' });
        if (readyResponse.status !== 200) {
          throw new Error(`Readiness expected 200, received ${readyResponse.status}`);
        }
        const ready = await readJson(readyResponse, 'readiness');
        if (
          ready.status !== 'ready' ||
          ready.services?.database !== 'up' ||
          ready.services?.redis !== 'up'
        ) {
          throw new Error('Readiness dependency contract failed');
        }
        return { release: health.release, ready: true };
      }
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(pollIntervalMs, remaining));
  }

  throw new Error(`Timed out waiting for release ${targetRelease}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await verifyRelease({
    healthUrl: `${process.env.RENDER_ORIGIN}/api/v1/health`,
    readyUrl: `${process.env.RENDER_ORIGIN}/api/v1/ready`,
    targetRelease: process.env.TARGET_RELEASE,
  });
  console.log('release verified');
}
