import { defineConfig } from 'vitest/config';

// Auth service + requireAuth test dosyaları aynı PG instance'ı paylaşıyor ve
// cleanDb() çağrıları yarışıyor. Auth testleri güvenilir olsun diye dosya
// paralelliğini kapatıyoruz — dosyalar arası race koşulu ortadan kalkar.
// Tek dosya içindeki testler yine paralel çalışır (hâlâ hızlı).
export default defineConfig({
  test: {
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    isolate: true,
    globalSetup: ['./test/globalSetup.ts'],
    env: {
      NODE_ENV: 'test',
    },
  },
});
