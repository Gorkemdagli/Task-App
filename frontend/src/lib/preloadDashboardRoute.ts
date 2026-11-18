import { matchPath } from 'react-router-dom';

const protectedRoutePatterns = [
  ['/dashboard', 'dashboard', () => import('../pages/Dashboard')],
  ['/teams', 'teams', () => import('../pages/Teams')],
  ['/teams/:id', 'team-detail', () => import('../pages/TeamDetail')],
  ['/tasks', 'tasks', () => import('../pages/Tasks')],
  ['/tasks/:id', 'task-detail', () => import('../pages/TaskDetail')],
  ['/notifications', 'notifications', () => import('../pages/Notifications')],
  ['/chat/:id', 'chat', () => import('../pages/Chat')],
  ['/profile', 'profile', () => import('../pages/Profile')],
  ['/permissions', 'permissions', () => import('../pages/Permissions')],
  ['/company', 'company', () => import('../pages/Company')],
  ['/company/settings', 'company', () => import('../pages/Company')],
] as const;

export function getProtectedRouteChunk(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  return protectedRoutePatterns.find(([path]) =>
    matchPath({ path, caseSensitive: false, end: true }, normalizedPath),
  );
}

export function preloadProtectedRoute(pathname: string) {
  const routeImport = getProtectedRouteChunk(pathname)?.[2];

  if (!routeImport) return Promise.resolve();

  return Promise.allSettled([
    import('../components/ProtectedRoute'),
    import('../components/layout/AppShell'),
    routeImport(),
  ]).then(() => undefined);
}

export const preloadDashboardRoute = () => preloadProtectedRoute('/dashboard');
