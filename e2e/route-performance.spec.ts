import { expect, test, type Request, type Response } from '@playwright/test';

const enabled = process.env.TASKFLOW_ROUTE_PERF === '1';
const profiles = [
  { role: 'member', prefix: 'TASKFLOW_PERF_MEMBER', fallbackPrefix: 'TASKFLOW_PERF' },
  { role: 'team-admin', prefix: 'TASKFLOW_PERF_TEAM_ADMIN' },
  { role: 'company-admin', prefix: 'TASKFLOW_PERF_COMPANY_ADMIN' },
].map(({ role, prefix, fallbackPrefix }) => ({
  role,
  email: process.env[`${prefix}_EMAIL`] ?? (fallbackPrefix ? process.env[`${fallbackPrefix}_EMAIL`] : undefined),
  password: process.env[`${prefix}_PASSWORD`] ?? (fallbackPrefix ? process.env[`${fallbackPrefix}_PASSWORD`] : undefined),
  taskId: process.env[`${prefix}_TASK_ID`] ?? process.env.TASKFLOW_PERF_TASK_ID,
  teamId: process.env[`${prefix}_TEAM_ID`] ?? process.env.TASKFLOW_PERF_TEAM_ID,
  chatId: process.env[`${prefix}_CHAT_ID`] ?? process.env.TASKFLOW_PERF_CHAT_ID,
}));
const repetitions = Number(process.env.TASKFLOW_PERF_REPETITIONS ?? 5);

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentileValue * sorted.length) - 1];
}

for (const profile of profiles) test(`reports opt-in route timings for ${profile.role}`, async ({ page }) => {
  test.skip(!enabled || !profile.email || !profile.password, `Skipped ${profile.role}: set TASKFLOW_ROUTE_PERF=1 and ${profile.role} local credentials.`);
  test.setTimeout(120_000);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20) {
    throw new Error('TASKFLOW_PERF_REPETITIONS must be between 1 and 20');
  }

  await page.goto('/login');
  await page.locator('#email').fill(profile.email!);
  await page.locator('#password').fill(profile.password!);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByTestId('dashboard-page')).toBeVisible();

  await page.addInitScript(() => {
    const state = { startedAt: performance.now(), headingAtMs: null as number | null, targetPath: sessionStorage.getItem('__taskflowPerfTargetPath'), intervals: [] as Array<{ marker: string; startMs: number; endMs?: number }> };
    Object.assign(window, { __taskflowPerf: state });
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0;
    };
    const sync = () => {
      const now = performance.now() - state.startedAt;
      if (state.headingAtMs === null && window.location.pathname === state.targetPath && [...document.querySelectorAll('main h1')].some(visible)) state.headingAtMs = Math.round(now);
      const active = new Set<string>();
      for (const marker of ['route-fallback', 'dashboard-route-skeleton', 'route-shell-skeleton', 'dashboard-content-skeleton', 'page-loading-skeleton']) {
        if ([...document.querySelectorAll(`[data-testid="${marker}"]`)].some(visible)) active.add(marker);
      }
      for (const marker of active) {
        if (!state.intervals.some((interval) => interval.marker === marker && interval.endMs === undefined)) state.intervals.push({ marker, startMs: Math.round(now) });
      }
      for (const interval of state.intervals) if (!active.has(interval.marker) && interval.endMs === undefined) interval.endMs = Math.round(now);
    };
    new MutationObserver(sync).observe(document, { childList: true, subtree: true, attributes: true });
    document.addEventListener('DOMContentLoaded', sync);
  });

  const samples: Array<Record<string, unknown>> = [];
  const routes = [
    '/dashboard', '/tasks', '/teams', '/permissions', '/notifications', '/profile', '/company', '/company/settings',
    profile.taskId && `/tasks/${profile.taskId}`,
    profile.teamId && `/teams/${profile.teamId}`,
    profile.chatId && `/chat/${profile.chatId}`,
  ].filter((route): route is string => Boolean(route));
  for (const route of routes) {
    const reloadTimes: number[] = [];
    const warmTimes: number[] = [];
    const requests: Request[] = [];
    const pendingRequests = new Set<Request>();
    const requestStartedAt = new Map<Request, number>();
    let refreshStartAfterNavigationMs: number | null = null;
    let refreshDurationMs: number | null = null;
    const refreshRequestStartedAt = new Map<Request, number>();
    const navigationStartedAt = { value: 0 };
    const onRequest = (request: Request) => {
      requests.push(request);
      if (request.url().includes('/api/v1/') && !request.url().includes('/notifications')) {
        pendingRequests.add(request);
        requestStartedAt.set(request, performance.now());
      }
      if (request.url().endsWith('/auth/refresh')) {
        refreshStartAfterNavigationMs = Date.now() - navigationStartedAt.value;
        refreshRequestStartedAt.set(request, performance.now());
      }
    };
    const onResponse = (response: Response) => {
      if (response.url().endsWith('/auth/refresh')) {
        const timing = response.request().timing();
        const measuredDuration = timing.responseEnd;
        refreshDurationMs = measuredDuration >= 0 ? Math.round(measuredDuration) : null;
      }
    };
    const onRequestDone = (request: Request) => pendingRequests.delete(request);
    const onRefreshDone = (request: Request) => {
      const startedAt = refreshRequestStartedAt.get(request);
      if (startedAt !== undefined) refreshDurationMs = Math.round(performance.now() - startedAt);
    };

    for (let iteration = 0; iteration < repetitions; iteration += 1) {
      requests.length = 0;
      refreshStartAfterNavigationMs = null;
      refreshDurationMs = null;
      page.on('request', onRequest);
      page.on('response', onResponse);
      page.on('requestfinished', onRequestDone);
      page.on('requestfailed', onRequestDone);
      page.on('requestfinished', onRefreshDone);
      page.on('requestfailed', onRefreshDone);
      const start = Date.now();
      navigationStartedAt.value = Date.now();
      await page.evaluate((targetPath) => sessionStorage.setItem('__taskflowPerfTargetPath', targetPath === '/company/settings' ? '/company' : targetPath), route);
      await page.evaluate(() => {
        const perf = (window as Window & { __taskflowPerf?: { startedAt: number; headingAtMs: number | null; intervals: unknown[] } }).__taskflowPerf;
        if (perf) { perf.startedAt = performance.now(); perf.headingAtMs = null; perf.intervals = []; }
      });
      await page.goto(route);
      await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
      const requestWaitStarted = Date.now();
      let idleSince = Date.now();
      while (Date.now() - requestWaitStarted < 5_000) {
        if (pendingRequests.size) idleSince = Date.now();
        if (pendingRequests.size === 0 && Date.now() - idleSince >= 150) break;
        await page.waitForTimeout(25);
      }
      const elapsedThroughApiQuiet = Date.now() - start;
      const expectedAlias = route === '/company/settings' && new URL(page.url()).pathname === '/company';
      const finalPath = new URL(page.url()).pathname;
      const redirectedToLogin = finalPath === '/login';
      const heading = page.locator('main h1').first();
      const headingVisible = await heading.isVisible().catch(() => false);
      const elapsedToHeadingMs = await page.evaluate(() => (window as Window & { __taskflowPerf?: { headingAtMs: number | null } }).__taskflowPerf?.headingAtMs ?? null);
      const routeMatched = finalPath === route || expectedAlias;
      if (routeMatched && headingVisible) reloadTimes.push(elapsedThroughApiQuiet);
      const apiCount = requests.filter((request) => request.url().includes('/api/v1/')).length;
      const perf = await page.evaluate(() => (window as Window & { __taskflowPerf?: { intervals: Array<{ marker: string; startMs: number; endMs?: number }> } }).__taskflowPerf);
      samples.push({ role: profile.role, route, type: 'hard-reload', iteration: iteration + 1, finalPath, aliasResolved: expectedAlias, redirected: !routeMatched, authOrHeadingReady: redirectedToLogin || headingVisible, requestQuietWaitTimedOut: pendingRequests.size > 0, elapsedThroughApiQuietMs: elapsedThroughApiQuiet, elapsedToMainHeadingMs: elapsedToHeadingMs, headingMetric: headingVisible ? 'first detected visible main h1 on target path' : 'unavailable', refreshMs: refreshDurationMs, refreshStartAfterNavigationMs, apiRequests: apiCount, observedSkeletonIntervals: perf?.intervals ?? [] });
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfinished', onRequestDone);
      page.off('requestfailed', onRequestDone);
      page.off('requestfinished', onRefreshDone);
      page.off('requestfailed', onRefreshDone);

      if (iteration === 0) {
        const parentRoute = route.startsWith('/tasks/') ? '/tasks'
          : route.startsWith('/teams/') ? '/teams'
            : route === '/company/settings' ? '/company'
              : '/dashboard';
        await page.goto(parentRoute);
        await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
        const link = page.locator(`a[href="${route}"]`).first();
        if (await link.count() && await link.isVisible().catch(() => false)) {
          for (let warmIteration = 0; warmIteration < repetitions; warmIteration += 1) {
          await page.goto(parentRoute);
            await page.evaluate(() => {
              const perf = (window as Window & { __taskflowPerf?: { startedAt: number; headingAtMs: number | null; targetPath: string | null; intervals: unknown[] } }).__taskflowPerf;
              if (perf) { perf.startedAt = performance.now(); perf.headingAtMs = null; perf.targetPath = window.location.pathname; perf.intervals = []; }
            });
            requests.length = 0;
            pendingRequests.clear();
            page.on('request', onRequest);
            page.on('response', onResponse);
            page.on('requestfinished', onRequestDone);
            page.on('requestfailed', onRequestDone);
            page.on('requestfinished', onRefreshDone);
            page.on('requestfailed', onRefreshDone);
            const warmStart = Date.now();
            await page.evaluate((targetPath) => {
              const perf = (window as Window & { __taskflowPerf?: { startedAt: number; headingAtMs: number | null; targetPath: string | null } }).__taskflowPerf;
              if (perf) { perf.startedAt = performance.now(); perf.headingAtMs = null; perf.targetPath = targetPath === '/company/settings' ? '/company' : targetPath; }
            }, route);
            await link.click();
            await page.waitForURL((url) => url.pathname === route || (route === '/company/settings' && url.pathname === '/company'), { timeout: 10_000 }).catch(() => undefined);
            const heading = page.locator('main h1').first();
            await heading.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
            const quietStartedAt = Date.now();
            let warmIdleSince = Date.now();
            while (Date.now() - quietStartedAt < 5_000) {
              if (pendingRequests.size) warmIdleSince = Date.now();
              if (pendingRequests.size === 0 && Date.now() - warmIdleSince >= 150) break;
              await page.waitForTimeout(25);
            }
            const elapsedThroughApiQuiet = Date.now() - warmStart;
            const finalPath = new URL(page.url()).pathname;
            const headingVisible = await heading.isVisible().catch(() => false);
            const aliasResolved = route === '/company/settings' && finalPath === '/company';
            const routeMatched = finalPath === route || aliasResolved;
            const requestQuietWaitTimedOut = pendingRequests.size > 0;
            if (routeMatched && headingVisible && !requestQuietWaitTimedOut) warmTimes.push(elapsedThroughApiQuiet);
            const perf = await page.evaluate(() => (window as Window & { __taskflowPerf?: { intervals: Array<{ marker: string; startMs: number; endMs?: number }> } }).__taskflowPerf);
            const elapsedToHeadingMs = await page.evaluate(() => (window as Window & { __taskflowPerf?: { headingAtMs: number | null } }).__taskflowPerf?.headingAtMs ?? null);
            samples.push({ role: profile.role, route, type: 'warm-link-navigation', iteration: warmIteration + 1, finalPath, aliasResolved, redirected: !routeMatched, authOrHeadingReady: headingVisible, requestQuietWaitTimedOut, elapsedThroughApiQuietMs: elapsedThroughApiQuiet, elapsedToMainHeadingMs: elapsedToHeadingMs, headingMetric: headingVisible ? 'first detected visible main h1 on target path' : 'unavailable', refreshMs: null, refreshStartAfterNavigationMs: null, apiRequests: requests.filter((request) => request.url().includes('/api/v1/')).length, observedSkeletonIntervals: perf?.intervals ?? [] });
            page.off('request', onRequest);
            page.off('response', onResponse);
            page.off('requestfinished', onRequestDone);
            page.off('requestfailed', onRequestDone);
            page.off('requestfinished', onRefreshDone);
            page.off('requestfailed', onRefreshDone);
          }
        } else {
          samples.push({ role: profile.role, route, type: 'warm-link-navigation', skipped: `No matching link from ${parentRoute}`, elapsedToHeadingMs: null, apiRequests: null });
        }
      }
    }
    samples.push({ role: profile.role, route, type: 'summary', repetitions, reloadP50Ms: reloadTimes.length ? percentile(reloadTimes, 0.5) : null, reloadP95Ms: reloadTimes.length ? percentile(reloadTimes, 0.95) : null, warmP50Ms: warmTimes.length ? percentile(warmTimes, 0.5) : null, warmP95Ms: warmTimes.length ? percentile(warmTimes, 0.95) : null });
  }

  console.log(`TASKFLOW_ROUTE_PERF ${JSON.stringify(samples)}`);
});
