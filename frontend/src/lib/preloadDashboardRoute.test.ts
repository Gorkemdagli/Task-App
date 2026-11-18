import { describe, expect, it, vi } from 'vitest';
import { getProtectedRouteChunk, preloadProtectedRoute } from './preloadDashboardRoute';

vi.mock('../components/ProtectedRoute', () => Promise.reject(new Error('chunk failed')));
vi.mock('../components/layout/AppShell', () => ({ AppShell: () => null }));

describe('preloadProtectedRoute', () => {
  it('absorbs route chunk failures so auth restoration can continue', async () => {
    await expect(preloadProtectedRoute('/dashboard')).resolves.toBeUndefined();
  });

  it.each([
    ['/dashboard', 'dashboard'], ['/teams', 'teams'], ['/teams/team-1', 'team-detail'],
    ['/tasks', 'tasks'], ['/tasks/task-1', 'task-detail'], ['/notifications', 'notifications'],
    ['/chat/thread-1', 'chat'], ['/profile', 'profile'], ['/permissions', 'permissions'],
    ['/company', 'company'], ['/company/settings', 'company'],
  ])('preloads the %s page chunk', async (pathname, expectedPage) => {
    expect(getProtectedRouteChunk(pathname)?.[1]).toBe(expectedPage);
    await expect(preloadProtectedRoute(pathname)).resolves.toBeUndefined();
  });

  it.each([
    ['/teams/team-1/', 'team-detail'], ['/TEAMS/team-1', 'team-detail'],
    ['/tasks/task-1/', 'task-detail'], ['/company/settings/', 'company'],
  ])('matches Router path behavior for %s', async (pathname, expectedPage) => {
    expect(getProtectedRouteChunk(pathname)?.[1]).toBe(expectedPage);
    await expect(preloadProtectedRoute(pathname)).resolves.toBeUndefined();
  });

  it.each(['/', '/login', '/register', '/unknown', '/teams/team-1/extra'])('skips non-route path %s', async (pathname) => {
    expect(getProtectedRouteChunk(pathname)).toBeUndefined();
    await expect(preloadProtectedRoute(pathname)).resolves.toBeUndefined();
  });
});
