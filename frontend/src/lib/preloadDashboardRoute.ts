export function preloadDashboardRoute() {
  return Promise.allSettled([
    import('../components/ProtectedRoute'),
    import('../components/layout/AppShell'),
    import('../pages/Dashboard'),
  ]).then(() => undefined);
}
