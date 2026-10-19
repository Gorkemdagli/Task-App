import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

type ReadinessPhase = 'open' | 'teams' | 'team-detail' | 'tasks' | 'summary' | 'badges';
type SequencedPhase = Exclude<ReadinessPhase, 'open' | 'badges'>;
type ReadinessMode = 'open' | 'team-dashboard' | 'company-dashboard' | 'company-page';

function phaseAt(mode: ReadinessMode, index: number): ReadinessPhase {
  if (mode === 'open') return 'open';
  if (mode === 'team-dashboard') {
    if (index === 0) return 'teams';
    if (index === 1) return 'team-detail';
    if (index === 2) return 'tasks';
    return 'badges';
  }
  if (index >= 2) return 'badges';
  if (mode === 'company-dashboard') return index === 0 ? 'tasks' : 'teams';
  return index === 0 ? 'summary' : 'teams';
}

interface RouteDataReadiness {
  phase: ReadinessPhase;
  teamsEnabled: boolean;
  tasksEnabled: boolean;
  badgesEnabled: boolean;
  teamTasksRequired: boolean;
  completePhase: (expectedPhase: SequencedPhase, skipToBadges?: boolean) => void;
  completeInitialPhase: () => void;
}

const openReadiness: RouteDataReadiness = {
  phase: 'open',
  teamsEnabled: true,
  tasksEnabled: true,
  badgesEnabled: true,
  teamTasksRequired: false,
  completePhase: () => undefined,
  completeInitialPhase: () => undefined,
};

const RouteDataReadinessContext = createContext(openReadiness);

export function RouteDataReadinessProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const tenantId = useAuthStore((state) => state.user?.tenantId ?? null);
  const role = useAuthStore((state) => state.user?.role ?? null);
  const sessionGeneration = useAuthStore((state) => state.sessionGeneration);
  const routeKey = `${pathname}:${userId ?? 'none'}:${tenantId ?? 'none'}:${role ?? 'none'}:${sessionGeneration}`;
  const mode: ReadinessMode =
    pathname === '/dashboard'
      ? tenantId && role === 'companyAdmin'
        ? 'company-dashboard'
        : tenantId && role === 'member'
          ? 'team-dashboard'
          : 'open'
      : pathname === '/company' && tenantId && role === 'companyAdmin'
        ? 'company-page'
        : 'open';
  const [progress, setProgress] = useState({ routeKey, index: 0 });
  if (progress.routeKey !== routeKey) setProgress({ routeKey, index: 0 });
  const index = progress.routeKey === routeKey ? progress.index : 0;

  const completePhase = useCallback((expectedPhase: SequencedPhase, skipToBadges = false) => {
    setProgress((current) => {
      if (
        current.routeKey !== routeKey ||
        phaseAt(mode, current.index) !== expectedPhase
      ) return current;
      const lastIndex = mode === 'team-dashboard' ? 3 : 2;
      return {
        routeKey,
        index: Math.min(lastIndex, skipToBadges ? lastIndex : current.index + 1),
      };
    });
  }, [mode, routeKey]);

  const completeInitialPhase = useCallback(() => {
    setProgress((current) => {
      if (mode !== 'company-page' || current.routeKey !== routeKey || current.index !== 0) return current;
      return { routeKey, index: 1 };
    });
  }, [mode, routeKey]);

  const phase = phaseAt(mode, index);

  const value = useMemo<RouteDataReadiness>(() => ({
    phase,
    teamsEnabled: mode === 'open' || mode === 'team-dashboard' || index >= 1,
    tasksEnabled:
      mode === 'open' || mode === 'company-dashboard' || (mode === 'team-dashboard' && index >= 2),
    badgesEnabled:
      mode === 'open' || (mode === 'team-dashboard' ? index >= 3 : index >= 2),
    teamTasksRequired: mode === 'team-dashboard',
    completePhase,
    completeInitialPhase,
  }), [completeInitialPhase, completePhase, index, mode, phase]);

  return (
    <RouteDataReadinessContext.Provider value={value}>
      {children}
    </RouteDataReadinessContext.Provider>
  );
}

export function useRouteDataReadiness() {
  return useContext(RouteDataReadinessContext);
}
