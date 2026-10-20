import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { queryClient } from '@/lib/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';

interface PendingLogout {
  generation: number;
  promise: Promise<void>;
  resolve: () => void;
  originLocationKey: string;
  navigationRequested: boolean;
}

const LogoutContext = createContext<(() => Promise<void>) | null>(null);

export function LogoutCoordinatorProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionGeneration = useAuthStore((state) => state.sessionGeneration);
  const [pendingLogout, setPendingLogout] = useState<PendingLogout | null>(null);
  const pendingLogoutRef = useRef<PendingLogout | null>(null);

  const finishWithoutCleanup = useCallback((operation: PendingLogout) => {
    if (pendingLogoutRef.current === operation) {
      pendingLogoutRef.current = null;
      setPendingLogout(null);
    }
    operation.resolve();
  }, []);

  useLayoutEffect(() => {
    const operation = pendingLogoutRef.current;
    if (!operation) return;

    if (useAuthStore.getState().sessionGeneration !== operation.generation) {
      finishWithoutCleanup(operation);
      return;
    }

    if (pendingLogout !== operation) return;

    if (
      !operation.navigationRequested ||
      location.pathname !== '/' ||
      location.key === operation.originLocationKey
    ) return;

    pendingLogoutRef.current = null;
    setPendingLogout(null);
    queryClient.clear();
    useAuthStore.getState().clearAuth();
    useTeamStore.getState().clearActiveTeam();
    operation.resolve();
  }, [finishWithoutCleanup, location.key, location.pathname, pendingLogout, sessionGeneration]);

  const logout = useCallback(() => {
    const generation = useAuthStore.getState().sessionGeneration;
    const activeOperation = pendingLogoutRef.current;
    if (activeOperation?.generation === generation) return activeOperation.promise;
    if (activeOperation) finishWithoutCleanup(activeOperation);

    let resolveOperation!: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveOperation = resolve;
    });
    const operation: PendingLogout = {
      generation,
      promise,
      resolve: resolveOperation,
      originLocationKey: location.key,
      navigationRequested: false,
    };
    pendingLogoutRef.current = operation;

    void (async () => {
      try {
        await authApi.post('/logout');
      } catch {
        // Local cleanup still completes when the server session is already expired.
      }

      if (pendingLogoutRef.current !== operation) {
        operation.resolve();
        return;
      }
      if (useAuthStore.getState().sessionGeneration !== generation) {
        finishWithoutCleanup(operation);
        return;
      }

      operation.navigationRequested = true;
      setPendingLogout(operation);
      navigate('/', { replace: true });
    })();

    return promise;
  }, [finishWithoutCleanup, location.key, navigate]);

  return <LogoutContext.Provider value={logout}>{children}</LogoutContext.Provider>;
}

export function useLogout() {
  const logout = useContext(LogoutContext);
  if (!logout) throw new Error('useLogout must be used inside LogoutCoordinatorProvider');
  return logout;
}
