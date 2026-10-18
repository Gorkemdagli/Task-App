import { describe, expect, it, vi } from 'vitest';
import { preloadDashboardRoute } from './dashboardRouteModules';

vi.mock('../components/ProtectedRoute', () => Promise.reject(new Error('chunk failed')));
vi.mock('../components/layout/AppShell', () => ({ AppShell: () => null }));
vi.mock('../pages/Dashboard', () => ({ DashboardPage: () => null }));

describe('preloadDashboardRoute', () => {
  it('absorbs route chunk failures so login can continue', async () => {
    await expect(preloadDashboardRoute()).resolves.toBeUndefined();
  });
});
