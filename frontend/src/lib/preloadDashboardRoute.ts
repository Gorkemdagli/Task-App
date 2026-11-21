import { matchPath } from 'react-router-dom';
import type { ComponentType } from 'react';
import type { ProtectedRoute } from '../components/ProtectedRoute';
import type { AppShell } from '../components/layout/AppShell';
import type { DashboardPage } from '../pages/Dashboard';
import type { TeamsPage } from '../pages/Teams';
import type { TeamDetailPage } from '../pages/TeamDetail';
import type { TasksPage } from '../pages/Tasks';
import type { TaskDetailPage } from '../pages/TaskDetail';
import type { ProfilePage } from '../pages/Profile';
import type { PermissionsPage } from '../pages/Permissions';
import type { CompanyManagementPage } from '../pages/Company';

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
  ['/teams', 'teams', () => import('../pages/Teams'), (module) => (module as { TeamsPage: typeof TeamsPage }).TeamsPage],
  ['/teams/:id', 'team-detail', () => import('../pages/TeamDetail'), (module) => (module as { TeamDetailPage: typeof TeamDetailPage }).TeamDetailPage],
  ['/tasks', 'tasks', () => import('../pages/Tasks'), (module) => (module as { TasksPage: typeof TasksPage }).TasksPage],
  ['/tasks/:id', 'task-detail', () => import('../pages/TaskDetail'), (module) => (module as { TaskDetailPage: typeof TaskDetailPage }).TaskDetailPage],
  ['/notifications', 'notifications', () => import('../pages/Notifications')],
  ['/chat/:id', 'chat', () => import('../pages/Chat')],
  ['/profile', 'profile', () => import('../pages/Profile'), (module) => (module as { ProfilePage: typeof ProfilePage }).ProfilePage],
  ['/permissions', 'permissions', () => import('../pages/Permissions'), (module) => (module as { PermissionsPage: typeof PermissionsPage }).PermissionsPage],
  ['/company', 'company', () => import('../pages/Company'), (module) => (module as { CompanyManagementPage: typeof CompanyManagementPage }).CompanyManagementPage],
  ['/company/settings', 'company', () => import('../pages/Company'), (module) => (module as { CompanyManagementPage: typeof CompanyManagementPage }).CompanyManagementPage],
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
