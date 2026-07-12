import { QueryClient } from '@tanstack/react-query';

/**
 * Tek instance — `main.tsx` içinde `QueryClientProvider`'a verilir.
 * staleTime: 30s — çoğu liste/detay için yeterli tazelik, gereksiz refetch'i keser.
 * retry: 1 — network glitch'leri tolere eder ama sonsuz döngüye düşmez.
 * refetchOnWindowFocus: false — task yönetiminde focus reflash UX'i bozar.
 * 401 durumu api.ts interceptor'ında handle edilir (token refresh); burada tekrar denemiyoruz.
 */
export const queryClient = new QueryClient({
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
