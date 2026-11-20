import { matchPath } from 'react-router-dom';
import type { ProtectedRoute } from '../components/ProtectedRoute';
import type { AppShell } from '../components/layout/AppShell';
import type { DashboardPage } from '../pages/Dashboard';

type PreloadedDashboardModules = {
  ProtectedRoute: typeof ProtectedRoute;
  AppShell: typeof AppShell;
  DashboardPage: typeof DashboardPage;
};

let protectedRouteComponent: typeof ProtectedRoute | undefined;
let appShellComponent: typeof AppShell | undefined;
let dashboardPageComponent: typeof DashboardPage | undefined;

export function loadProtectedRouteModule() {
  return import('../components/ProtectedRoute').then((module) => {
    protectedRouteComponent = module.ProtectedRoute;
    return module;
  });
}

export function loadAppShellModule() {
  return import('../components/layout/AppShell').then((module) => {
    appShellComponent = module.AppShell;
    return module;
  });
}

export function loadDashboardRouteModule() {
  return import('../pages/Dashboard').then((module) => {
    dashboardPageComponent = module.DashboardPage;
    return module;
  });
}

export function getPreloadedDashboardModules(): PreloadedDashboardModules | undefined {
  if (!protectedRouteComponent || !appShellComponent || !dashboardPageComponent) return;
  return {
    ProtectedRoute: protectedRouteComponent,
    AppShell: appShellComponent,
    DashboardPage: dashboardPageComponent,
  };
}

const protectedRoutePatterns = [
  ['/dashboard', 'dashboard', loadDashboardRouteModule],
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
    loadProtectedRouteModule(),
    loadAppShellModule(),
    routeImport(),
  ]).then(() => undefined);
}

export const preloadDashboardRoute = () => preloadProtectedRoute('/dashboard');
