import { QueryCache, QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { reportGlobalError } from './globalError';

/**
 * Tek instance — `main.tsx` içinde `QueryClientProvider`'a verilir.
 * staleTime: 30s — çoğu liste/detay için yeterli tazelik, gereksiz refetch'i keser.
 * retry: 1 — network glitch'leri tolere eder ama sonsuz döngüye düşmez.
 * refetchOnWindowFocus: false — task yönetiminde focus reflash UX'i bozar.
 * 401 durumu api.ts interceptor'ında handle edilir (token refresh); burada tekrar denemiyoruz.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const localTransientError =
        query.meta?.localTransientError === true &&
        isAxiosError(error) &&
        (!error.response || error.response.status >= 500);
      const unobservedSpeculativePrefetch =
        query.meta?.speculativeTaskDetailPrefetch === true && query.getObserversCount() === 0;
      if (query.state.data === undefined && !localTransientError && !unobservedSpeculativePrefetch)
        reportGlobalError(error);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
