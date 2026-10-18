export const loadProtectedRoute = () => import('../components/ProtectedRoute');
export const loadAppShell = () => import('../components/layout/AppShell');
export const loadDashboardPage = () => import('../pages/Dashboard');

export function preloadDashboardRoute() {
  return Promise.allSettled([loadProtectedRoute(), loadAppShell(), loadDashboardPage()]).then(() => undefined);
}
