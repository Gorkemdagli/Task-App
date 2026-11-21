import { matchPath } from 'react-router-dom';
import type { ComponentType } from 'react';
import type { ProtectedRoute } from '../components/ProtectedRoute';
import type { AppShell } from '../components/layout/AppShell';
import type { DashboardPage } from '../pages/Dashboard';

type PreloadedDashboardModules = {
  ProtectedRoute: typeof ProtectedRoute;
  AppShell: typeof AppShell;
  DashboardPage: typeof DashboardPage;
};
type ProtectedRoutePage = ComponentType;
type ProtectedRoutePageSelector = (module: unknown) => ProtectedRoutePage;
type ProtectedRoutePattern = [string, string, () => Promise<unknown>, ProtectedRoutePageSelector?];

let protectedRouteComponent: typeof ProtectedRoute | undefined;
let appShellComponent: typeof AppShell | undefined;
let dashboardPageComponent: typeof DashboardPage | undefined;
const protectedRoutePages = new Map<string, ProtectedRoutePage>();
const reusableRouteKeys = new Set([
  'teams', 'team-detail', 'tasks', 'task-detail', 'permissions', 'profile', 'company',
]);

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

export function getPreloadedProtectedRouteModules(pathname: string) {
  const routeKey = getProtectedRouteChunk(pathname)?.[1];
  if (!routeKey || !reusableRouteKeys.has(routeKey)) return;
  const Page = protectedRoutePages.get(routeKey);
  if (!protectedRouteComponent && !appShellComponent && !Page) return;
  return { ProtectedRoute: protectedRouteComponent, AppShell: appShellComponent, Page };
}

const protectedRoutePatterns: ReadonlyArray<ProtectedRoutePattern> = [
  ['/dashboard', 'dashboard', loadDashboardRouteModule],
  ['/teams', 'teams', () => import('../pages/Teams'), (module) => (module as typeof import('../pages/Teams')).TeamsPage],
  ['/teams/:id', 'team-detail', () => import('../pages/TeamDetail'), (module) => (module as typeof import('../pages/TeamDetail')).TeamDetailPage],
  ['/tasks', 'tasks', () => import('../pages/Tasks'), (module) => (module as typeof import('../pages/Tasks')).TasksPage],
  ['/tasks/:id', 'task-detail', () => import('../pages/TaskDetail'), (module) => (module as typeof import('../pages/TaskDetail')).TaskDetailPage],
  ['/notifications', 'notifications', () => import('../pages/Notifications')],
  ['/chat/:id', 'chat', () => import('../pages/Chat')],
  ['/profile', 'profile', () => import('../pages/Profile'), (module) => (module as typeof import('../pages/Profile')).ProfilePage],
  ['/permissions', 'permissions', () => import('../pages/Permissions'), (module) => (module as typeof import('../pages/Permissions')).PermissionsPage],
  ['/company', 'company', () => import('../pages/Company'), (module) => (module as typeof import('../pages/Company')).CompanyManagementPage],
  ['/company/settings', 'company', () => import('../pages/Company'), (module) => (module as typeof import('../pages/Company')).CompanyManagementPage],
];

export function getProtectedRouteChunk(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  return protectedRoutePatterns.find(([path]) =>
    matchPath({ path, caseSensitive: false, end: true }, normalizedPath),
  );
}

export function preloadProtectedRoute(pathname: string) {
  const route = getProtectedRouteChunk(pathname);

  if (!route) return Promise.resolve();

  return Promise.allSettled([
    loadProtectedRouteModule(),
    loadAppShellModule(),
    route[2]().then((module) => {
      if (route[3] && reusableRouteKeys.has(route[1])) {
        protectedRoutePages.set(route[1], route[3](module));
      }
    }),
  ]).then(() => undefined);
}

export const preloadDashboardRoute = () => preloadProtectedRoute('/dashboard');
