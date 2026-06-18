# Faz 0 — Proje Temeli ve Altyapı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boş ama çalışan, deploy edilebilir bir TaskFlow iskeleti — production'da `GET /health` dönen backend, "Hello TaskFlow" sayfası gösteren frontend, token'lı tasarım sistemi, Supabase + Redis bağlantısı, CI lint zinciri.

**Architecture:** İki ayrı npm projesi (frontend Vite, backend Express) root `package.json` workspaces altında. Her ikisi de TypeScript. Tasarım token'ları `PROJECT.md` §6'dan Tailwind config + CSS değişkenlerine aktarılır; shadcn/ui bu token'lara göre özelleştirilir. Supabase Postgres + Prisma; Redis lokal Docker. Deploy: Vercel (frontend) + Railway (backend + Redis).

**Tech Stack:** React 18, Vite 5, TypeScript 5, Tailwind CSS 3, shadcn/ui, Node.js 20, Express 4, Prisma 5, Supabase JS, Redis 7, ESLint, Prettier, Husky, Vitest, Supertest.

**Reference Documents:**
- `CLAUDE.md` — geliştirme kuralları
- `PROJECT.md` §6 (token'lar), §7 (stack), §7.5 (deploy), §7.7 (rate limit)
- `FRONTEND.md` §2 (yoğunluk), §3 (animasyon), §4 (bileşen), §5 (a11y)
- `ROADMAP.md` Faz 0 çıkış kriteri
- Master plan: `docs/superpowers/plans/../claude-md-frontend-md-project-md-roadma-smooth-nebula.md`

---

## File Structure (Faz 0 sonunda)

```
TaskFlow/
├── CLAUDE.md                          (mevcut, korunur)
├── PROJECT.md                         (mevcut, korunur)
├── FRONTEND.md                        (mevcut, korunur)
├── ROADMAP.md                         (mevcut, korunur)
├── README.md                          (YENİ — proje girişi)
├── .gitignore                         (YENİ)
├── .nvmrc                             (YENİ — Node 20)
├── package.json                       (YENİ — root, workspaces)
├── .editorconfig                      (YENİ)
├── .prettierrc.json                   (YENİ)
├── .prettierignore                    (YENİ)
├── .eslintrc.cjs                      (YENİ — root)
├── .lintstagedrc.json                 (YENİ)
├── frontend/
│   ├── package.json                   (YENİ)
│   ├── vite.config.ts                 (YENİ)
│   ├── tsconfig.json                  (YENİ)
│   ├── tsconfig.node.json             (YENİ)
│   ├── tailwind.config.ts             (YENİ)
│   ├── postcss.config.js              (YENİ)
│   ├── components.json                (YENİ — shadcn config)
│   ├── index.html                     (YENİ)
│   ├── .env.example                   (YENİ)
│   ├── public/
│   │   └── favicon.svg                (YENİ)
│   └── src/
│       ├── main.tsx                   (YENİ)
│       ├── App.tsx                    (YENİ)
│       ├── index.css                  (YENİ — CSS değişkenleri + Tailwind)
│       ├── vite-env.d.ts              (YENİ)
│       ├── lib/
│       │   └── utils.ts               (YENİ — shadcn cn helper)
│       ├── components/
│       │   ├── ui/
│       │   │   └── button.tsx         (YENİ — shadcn)
│       │   └── HelloTaskFlow.tsx      (YENİ)
│       └── test/
│           ├── setup.ts               (YENİ)
│           └── HelloTaskFlow.test.tsx (YENİ)
├── backend/
│   ├── package.json                   (YENİ)
│   ├── tsconfig.json                  (YENİ)
│   ├── .env.example                   (YENİ)
│   ├── .dockerignore                  (YENİ)
│   ├── prisma/
│   │   └── schema.prisma              (YENİ — boş şema)
│   └── src/
│       ├── index.ts                   (YENİ — Express bootstrap)
│       ├── env.ts                     (YENİ — env validation)
│       ├── app.ts                     (YENİ — Express app factory)
│       ├── routes/
│       │   ├── index.ts               (YENİ)
│       │   └── health.ts              (YENİ)
│       ├── middleware/
│       │   ├── errorHandler.ts        (YENİ)
│       │   └── requestLogger.ts       (YENİ)
│       ├── lib/
│       │   ├── prisma.ts              (YENİ — Prisma client singleton)
│       │   └── redis.ts               (YENİ — Redis client singleton)
│       └── test/
│           ├── setup.ts               (YENİ)
│           └── health.test.ts         (YENİ)
└── docs/
    └── superpowers/
        └── plans/
            └── 2026-06-19-faz0-proje-temeli.md   (bu dosya)
```

---

## Task 0.1 — Root Proje ve Workspaces

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.editorconfig`
- Create: `README.md`

- [ ] **Step 1: .nvmrc oluştur (Node 20)**

`C:\Users\Gorkem\Desktop\Task\.nvmrc`:
```
20
```

- [ ] **Step 2: .gitignore oluştur**

`C:\Users\Gorkem\Desktop\Task\.gitignore`:
```
# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
build/
.next/
out/

# Environment
.env
.env.local
.env.*.local
!.env.example

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.vscode/
!.vscode/extensions.json
!.vscode/settings.json
.idea/
*.swp
*.swo
.DS_Store
Thumbs.db

# Test
coverage/
.nyc_output/

# Prisma
backend/prisma/migrations/dev.db*

# Misc
*.tsbuildinfo
.cache/
.turbo/
```

- [ ] **Step 3: .editorconfig oluştur**

`C:\Users\Gorkem\Desktop\Task\.editorconfig`:
```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Root package.json oluştur (workspaces)**

`C:\Users\Gorkem\Desktop\Task\package.json`:
```json
{
  "name": "taskflow",
  "version": "0.1.0",
  "private": true,
  "description": "Multi-tenant SaaS görev yönetimi uygulaması",
  "workspaces": [
    "frontend",
    "backend"
  ],
  "scripts": {
    "dev:frontend": "npm run dev --workspace=frontend",
    "dev:backend": "npm run dev --workspace=backend",
    "build:frontend": "npm run build --workspace=frontend",
    "build:backend": "npm run build --workspace=backend",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write \"**/*.{ts,tsx,json,md,css}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,json,md,css}\"",
    "test": "npm run test --workspaces --if-present",
    "prepare": "husky install"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "husky": "^9.0.11",
    "lint-staged": "^15.2.0",
    "prettier": "^3.2.5",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 5: README.md oluştur**

`C:\Users\Gorkem\Desktop\Task\README.md`:
```markdown
# TaskFlow

Multi-tenant SaaS görev yönetimi uygulaması.

## Stack

- Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui
- Backend: Node.js + Express + TypeScript + Prisma
- Veritabanı: Supabase (PostgreSQL)
- Cache: Redis
- Deploy: Vercel (FE) + Railway (BE + Redis)

## Geliştirme

```bash
# Tüm bağımlılıkları kur
npm install

# Backend'i başlat (port 3001)
npm run dev:backend

# Frontend'i başlat (port 5173)
npm run dev:frontend

# Lint
npm run lint

# Format
npm run format
```

## Dökümanlar

- `CLAUDE.md` — geliştirme kuralları
- `PROJECT.md` — iş kuralları, yetki matrisi, token'lar
- `FRONTEND.md` — tasarım sistemi, bileşen kuralları
- `ROADMAP.md` — geliştirme yol haritası
- `docs/superpowers/` — planlar ve spec'ler
```

- [ ] **Step 6: Bağımlılıkları kur ve doğrula**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm install
```

Expected: `node_modules/` oluşur, root `package-lock.json` yazılır, hata yok.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git init
git add .
git commit -m "chore: initialize monorepo with workspaces"
```

---

## Task 0.2 — Backend İskeleti (Express + TypeScript + Health Endpoint)

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.env.example`
- Create: `backend/.dockerignore`
- Create: `backend/src/index.ts`
- Create: `backend/src/env.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/routes/index.ts`
- Create: `backend/src/routes/health.ts`
- Create: `backend/src/middleware/errorHandler.ts`
- Create: `backend/src/middleware/requestLogger.ts`
- Create: `backend/src/lib/prisma.ts`
- Create: `backend/src/lib/redis.ts`
- Create: `backend/src/test/setup.ts`
- Create: `backend/src/test/health.test.ts`

- [ ] **Step 1: backend/package.json oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\package.json`:
```json
{
  "name": "@taskflow/backend",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "@prisma/client": "^5.10.0",
    "cors": "^2.8.5",
    "express": "^4.18.3",
    "helmet": "^7.1.0",
    "ioredis": "^5.3.2",
    "pino": "^8.19.0",
    "pino-http": "^9.0.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^6.3.4",
    "tsx": "^4.7.1",
    "typescript": "^5.4.0",
    "vitest": "^1.3.0"
  }
}
```

- [ ] **Step 2: backend/tsconfig.json oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "declaration": false,
    "sourceMap": true,
    "removeComments": false,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: backend/.env.example oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\.env.example`:
```env
# Server
NODE_ENV=development
PORT=3001

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/taskflow

# Redis
REDIS_URL=redis://localhost:6379

# Auth (Faz 2'de kullanılacak)
JWT_ACCESS_SECRET=replace-me-with-random-string
JWT_REFRESH_SECRET=replace-me-with-random-string

# CORS
CLIENT_URL=http://localhost:5173
```

- [ ] **Step 4: backend/.dockerignore oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\.dockerignore`:
```
node_modules
dist
.env
.env.local
*.log
coverage
```

- [ ] **Step 5: backend/src/env.ts oluştur (env validation)**

`C:\Users\Gorkem\Desktop\Task\backend\src\env.ts`:
```typescript
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  CLIENT_URL: z.string().url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
```

Not: dotenv eksik — `backend` `package.json`'a ekle:
```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm install dotenv --workspace=backend
```

- [ ] **Step 6: backend/src/lib/prisma.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\src\lib\prisma.ts`:
```typescript
import { PrismaClient } from '@prisma/client';
import { env } from '../env';

declare global {
  // eslint-disable-next-line no-var
  var prismaClient: PrismaClient | undefined;
}

export const prisma =
  global.prismaClient ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  global.prismaClient = prisma;
}
```

Not: `@prisma/client` henüz üretilmedi (boş şema). Prisma client sadece import edilebilir olmalı, çalışması için Faz 0.6'da `prisma generate` gerekli. Bu adımda dosyayı oluşturuyoruz; generate Task 0.6'da.

- [ ] **Step 7: backend/src/lib/redis.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\src\lib\redis.ts`:
```typescript
import Redis from 'ioredis';
import { env } from '../env';

declare global {
  // eslint-disable-next-line no-var
  var redisClient: Redis | undefined;
}

export const redis =
  global.redisClient ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

if (env.NODE_ENV !== 'production') {
  global.redisClient = redis;
}
```

- [ ] **Step 8: backend/src/middleware/errorHandler.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\src\middleware\errorHandler.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code ?? 'Error',
      message: err.message,
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Beklenmeyen bir hata oluştu',
  });
}
```

- [ ] **Step 9: backend/src/middleware/requestLogger.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\src\middleware\requestLogger.ts`:
```typescript
import { RequestHandler } from 'express';
import pinoHttp from 'pino-http';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export const requestLogger: RequestHandler[] = [
  pinoHttp({ logger }),
];
```

Not: `pino-pretty` eksik — ekle:
```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm install --save-dev pino-pretty --workspace=backend
```

- [ ] **Step 10: backend/src/routes/health.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\src\routes\health.ts`:
```typescript
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

export const healthRouter = Router();

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

healthRouter.get('/', async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => 'up' as const)
      .catch(() => 'down' as const),
    redis
      .ping()
      .then((r) => (r === 'PONG' ? 'up' as const : 'down' as const))
      .catch(() => 'down' as const),
  ]);

  const response: HealthResponse = {
    status: dbOk === 'up' && redisOk === 'up' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: dbOk,
      redis: redisOk,
    },
  };

  const statusCode = response.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(response);
});
```

- [ ] **Step 11: backend/src/routes/index.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\src\routes\index.ts`:
```typescript
import { Router } from 'express';
import { healthRouter } from './health';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
```

- [ ] **Step 12: backend/src/app.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\src\app.ts`:
```typescript
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  app.get('/', (_req, res) => {
    res.json({ name: 'TaskFlow API', version: '0.1.0' });
  });

  app.use('/api/v1', apiRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found', message: 'Endpoint bulunamadı' });
  });

  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 13: backend/src/index.ts oluştur (bootstrap)**

`C:\Users\Gorkem\Desktop\Task\backend\src\index.ts`:
```typescript
import { createApp } from './app';
import { env } from './env';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 TaskFlow API running on http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Health: http://localhost:${env.PORT}/api/v1/health`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

- [ ] **Step 14: backend/src/test/setup.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\src\test\setup.ts`:
```typescript
import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

beforeAll(async () => {
  // Test ortamı bağlantıları zaten env üzerinden kurulu
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});
```

- [ ] **Step 15: backend/src/test/health.test.ts oluştur (FALLING TEST)**

`C:\Users\Gorkem\Desktop\Task\backend\src\test\health.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import './setup';

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok when services are up', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      timestamp: expect.any(String),
      uptime: expect.any(Number),
      services: {
        database: expect.stringMatching(/^(up|down)$/),
        redis: expect.stringMatching(/^(up|down)$/),
      },
    });
  });

  it('returns JSON content type', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
```

Not: Bu test `env.ts` import ettiği için DB ve Redis URL'lerine ihtiyaç duyar. `.env.test` oluştur:

`C:\Users\Gorkem\Desktop\Task\backend\.env.test`:
```env
NODE_ENV=test
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/taskflow
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=test-access-secret-min-16-chars
JWT_REFRESH_SECRET=test-refresh-secret-min-16-chars
CLIENT_URL=http://localhost:5173
```

`backend/package.json`'a `test` script'inde env yükle:
```json
"test": "dotenv -e .env.test -- vitest run"
```

`dotenv-cli` kur:
```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm install --save-dev dotenv-cli --workspace=backend
```

- [ ] **Step 16: Prisma boş şema oluştur (henüz generate yok)**

`C:\Users\Gorkem\Desktop\Task\backend\prisma\schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Not: Boş şema, sadece generator + datasource. Tablolar Faz 1'de eklenecek.

- [ ] **Step 17: Bağımlılıkları kur**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm install
```

- [ ] **Step 18: Lokal .env oluştur (developer-specific)**

`C:\Users\Gorkem\Desktop\Task\backend\.env`:
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/taskflow
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=dev-only-access-secret-replace-in-prod
JWT_REFRESH_SECRET=dev-only-refresh-secret-replace-in-prod
CLIENT_URL=http://localhost:5173
```

- [ ] **Step 19: Prisma generate**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run prisma:generate --workspace=backend
```

Expected: `Generated Prisma Client (v5.x.x) to .\node_modules\@prisma\client` mesajı.

- [ ] **Step 20: Health test çalıştır (doğrula)**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run test --workspace=backend
```

Expected: Lokal Postgres + Redis yoksa test `degraded` döner ama **geçer** (test hem `ok` hem `degraded` kabul eder). Çıktıda "1 passed" veya "2 passed" görünmeli.

Eğer Postgres/Redis kuruluyse tam `ok` döner. **Testin kendisi fail olmamalı.**

- [ ] **Step 21: Manuel smoke test (opsiyonel, DB/Redis varsa)**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run dev:backend
```

Başka terminalde:
```bash
curl http://localhost:3001/api/v1/health
```

Expected: JSON response with `status`, `services`, vs.

`Ctrl+C` ile durdur.

- [ ] **Step 22: Commit**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add backend/
git commit -m "feat(backend): express + ts + health endpoint with db/redis ping"
```

---

## Task 0.3 — Frontend İskeleti (Vite + React + TypeScript)

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/index.html`
- Create: `frontend/.env.example`
- Create: `frontend/public/favicon.svg`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/vite-env.d.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/test/App.test.tsx`
- Create: `frontend/vitest.config.ts`

- [ ] **Step 1: frontend/package.json oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\package.json`:
```json
{
  "name": "@taskflow/frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext .ts,.tsx"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.28.0",
    "axios": "^1.6.7",
    "clsx": "^2.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "tailwind-merge": "^2.2.2",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^14.2.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.17",
    "jsdom": "^24.0.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.4.0",
    "vite": "^5.1.0",
    "vitest": "^1.3.0"
  }
}
```

- [ ] **Step 2: frontend/tsconfig.json oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: frontend/tsconfig.node.json oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: frontend/vite.config.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

Not: vite.config.ts'ın `test` config'i vite versiyonuyla çalışmaz. Ayrı `vitest.config.ts` oluştur:

- [ ] **Step 5: frontend/vitest.config.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

Vite config'den test bloğunu kaldır:

`C:\Users\Gorkem\Desktop\Task\frontend\vite.config.ts` (güncelle):
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

- [ ] **Step 6: frontend/index.html oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\index.html`:
```html
<!doctype html>
<html lang="tr" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TaskFlow</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: frontend/public/favicon.svg oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\public\favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#171717"/>
  <path d="M9 10h14M9 16h14M9 22h9" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 8: frontend/.env.example oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\.env.example`:
```env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 9: frontend/src/vite-env.d.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\src\vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 10: frontend/src/main.tsx oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\src\main.tsx`:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 11: frontend/src/App.tsx oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\src\App.tsx`:
```typescript
function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary mb-2">TaskFlow</h1>
        <p className="text-secondary-foreground">Hello from TaskFlow</p>
      </div>
    </div>
  );
}

export default App;
```

Not: Bu adımda `index.css` henüz yok (Task 0.4'te). Tailwind class'ları şu an render edilmez; sadece JSX/test amaçlı.

- [ ] **Step 12: frontend/src/test/setup.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\src\test\setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 13: frontend/src/test/App.test.tsx oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\src\test\App.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('renders TaskFlow heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /TaskFlow/i })).toBeInTheDocument();
  });

  it('renders hello message', () => {
    render(<App />);
    expect(screen.getByText(/Hello from TaskFlow/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 14: Boş index.css oluştur (henüz token yok)**

`C:\Users\Gorkem\Desktop\Task\frontend\src\index.css`:
```css
/* Tokens will be added in Task 0.4 */
```

- [ ] **Step 15: Bağımlılıkları kur**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm install
```

- [ ] **Step 16: Test çalıştır**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run test --workspace=frontend
```

Expected: `2 passed (App.test.tsx)`.

- [ ] **Step 17: Build çalıştır (TypeScript + Vite)**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run build:frontend
```

Expected: `dist/` klasörü oluşur, hata yok.

- [ ] **Step 18: Commit**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add frontend/
git commit -m "feat(frontend): vite + react + ts with hello app"
```

---

## Task 0.4 — Tasarım Token'ları (Tailwind + CSS Değişkenleri)

**Files:**
- Modify: `frontend/src/index.css` (full rewrite)
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Modify: `frontend/src/App.tsx` (token demo)
- Modify: `frontend/src/test/App.test.tsx` (token class doğrulama)

Bu görev `PROJECT.md` §6'daki tüm token'ları (renk, tipografi, spacing, radius, gölge) Tailwind config + CSS değişkenlerine aktarır.

- [ ] **Step 1: frontend/tailwind.config.ts oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        card: {
          DEFAULT: 'var(--color-card)',
          foreground: 'var(--color-card-foreground)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
        },
        ring: 'var(--color-ring)',
        secondary: {
          DEFAULT: 'var(--color-secondary)',
          foreground: 'var(--color-secondary-foreground)',
        },
        border: 'var(--color-border)',
        input: 'var(--color-input)',
        overlay: 'var(--color-overlay)',
        priority: {
          high: 'var(--color-priority-high)',
          medium: 'var(--color-priority-medium)',
          low: 'var(--color-priority-low)',
        },
        status: {
          todo: 'var(--color-status-todo)',
          inprogress: 'var(--color-status-inprogress)',
          done: 'var(--color-status-done)',
        },
      },
      fontFamily: {
        display: ['Inter', 'DM Sans', 'sans-serif'],
        body: ['Inter', 'DM Sans', 'sans-serif'],
        ui: ['Inter', 'DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['15px', { lineHeight: '22px' }],
        lg: ['18px', { lineHeight: '26px' }],
        xl: ['22px', { lineHeight: '30px' }],
        '2xl': ['28px', { lineHeight: '36px' }],
        '4xl': ['40px', { lineHeight: '48px' }],
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        6: '24px',
        8: '32px',
        12: '48px',
        16: '64px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        panel: '0 4px 12px rgba(0,0,0,0.5)',
        modal: '0 8px 32px rgba(0,0,0,0.6)',
        widget: '0 6px 20px rgba(0,0,0,0.55)',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: frontend/postcss.config.js oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\postcss.config.js`:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: frontend/src/index.css oluştur (full token system)**

`C:\Users\Gorkem\Desktop\Task\frontend\src\index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* === TASKFLOW DESIGN TOKENS ===
     Source: PROJECT.md §6
     Dark mode default; light mode override below. */

  :root,
  [data-theme='dark'] {
    /* Brand */
    --color-primary: #f59e0b;
    --color-primary-hover: #d97706;
    --color-ring: #f59e0b;

    /* Surfaces */
    --color-background: #171717;
    --color-foreground: #e5e5e5;
    --color-card: #262626;
    --color-card-foreground: #e5e5e5;
    --color-overlay: rgba(0, 0, 0, 0.6);

    /* Secondary */
    --color-secondary: #262626;
    --color-secondary-foreground: #e5e5e5;

    /* Border / input */
    --color-border: #404040;
    --color-input: #404040;

    /* Priority */
    --color-priority-high: #ef4444;
    --color-priority-medium: #f59e0b;
    --color-priority-low: #22c55e;

    /* Status (kanban columns) */
    --color-status-todo: #6b7280;
    --color-status-inprogress: #f59e0b;
    --color-status-done: #22c55e;
  }

  [data-theme='light'] {
    --color-primary: #f59e0b;
    --color-primary-hover: #d97706;
    --color-ring: #f59e0b;

    --color-background: #fafafa;
    --color-foreground: #171717;
    --color-card: #ffffff;
    --color-card-foreground: #171717;
    --color-overlay: rgba(0, 0, 0, 0.4);

    --color-secondary: #f5f5f5;
    --color-secondary-foreground: #171717;

    --color-border: #e5e5e5;
    --color-input: #e5e5e5;

    --color-priority-high: #ef4444;
    --color-priority-medium: #f59e0b;
    --color-priority-low: #22c55e;

    --color-status-todo: #6b7280;
    --color-status-inprogress: #f59e0b;
    --color-status-done: #22c55e;
  }

  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: 'Inter', 'DM Sans', sans-serif;
    font-size: 15px;
    line-height: 22px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  *:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
}
```

- [ ] **Step 4: Inter font ekle (Google Fonts CDN)**

`C:\Users\Gorkem\Desktop\Task\frontend\index.html` (güncelle, `<head>` içine):
```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <title>TaskFlow</title>
```

Tam dosya:
```html
<!doctype html>
<html lang="tr" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <title>TaskFlow</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: App.tsx'i token'larla güncelle**

`C:\Users\Gorkem\Desktop\Task\frontend\src\App.tsx`:
```typescript
import { HelloTaskFlow } from './components/HelloTaskFlow';

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <HelloTaskFlow />
    </div>
  );
}

export default App;
```

- [ ] **Step 6: HelloTaskFlow bileşeni oluştur (token kullanımı gösterir)**

`C:\Users\Gorkem\Desktop\Task\frontend\src\components\HelloTaskFlow.tsx`:
```typescript
export function HelloTaskFlow() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded-lg bg-card p-8 shadow-card">
        <h1 className="text-4xl font-bold text-primary">TaskFlow</h1>
        <p className="mt-2 text-secondary-foreground">
          Hello from TaskFlow
        </p>
        <div className="mt-4 flex gap-2">
          <span
            className="rounded-sm bg-priority-high px-2 py-1 text-xs font-medium text-white"
            aria-label="Yüksek öncelik"
          >
            Yüksek
          </span>
          <span
            className="rounded-sm bg-priority-medium px-2 py-1 text-xs font-medium text-black"
            aria-label="Orta öncelik"
          >
            Orta
          </span>
          <span
            className="rounded-sm bg-priority-low px-2 py-1 text-xs font-medium text-white"
            aria-label="Düşük öncelik"
          >
            Düşük
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Test'i güncelle (token sınıfları doğrula)**

`C:\Users\Gorkem\Desktop\Task\frontend\src\test\App.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('renders TaskFlow heading with primary color class', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: /TaskFlow/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass('text-primary');
  });

  it('renders card with background token class', () => {
    const { container } = render(<App />);
    const card = container.querySelector('.bg-card');
    expect(card).toBeInTheDocument();
  });

  it('renders priority badges with token classes', () => {
    render(<App />);
    expect(screen.getByText('Yüksek')).toHaveClass('bg-priority-high');
    expect(screen.getByText('Orta')).toHaveClass('bg-priority-medium');
    expect(screen.getByText('Düşük')).toHaveClass('bg-priority-low');
  });
});
```

- [ ] **Step 8: Build doğrula**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run build:frontend
```

Expected: TypeScript hatası yok, `dist/` oluşur, CSS çıktısı token'ları içerir.

- [ ] **Step 9: Test çalıştır**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run test --workspace=frontend
```

Expected: `3 passed`.

- [ ] **Step 10: Manuel görsel doğrulama (opsiyonel)**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run dev:frontend
```

Tarayıcıda `http://localhost:5173` aç. Gör:
- Koyu arka plan (#171717)
- Amber başlık
- Kart içinde öncelik badge'leri (kırmızı, amber, yeşil)

`Ctrl+C` ile durdur.

- [ ] **Step 11: Commit**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add frontend/
git commit -m "feat(frontend): design tokens from PROJECT.md §6 with dark+light themes"
```

---

## Task 0.5 — shadcn/ui Kurulumu

**Files:**
- Create: `frontend/components.json`
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/components/ui/button.tsx`
- Create: `frontend/src/test/Button.test.tsx`
- Modify: `frontend/src/components/HelloTaskFlow.tsx` (shadcn button demo)

- [ ] **Step 1: components.json oluştur (shadcn config)**

`C:\Users\Gorkem\Desktop\Task\frontend\components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 2: shadcn cn helper oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\src\lib\utils.ts`:
```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Button bileşeni oluştur (shadcn, TaskFlow tokens ile özelleştirilmiş)**

`C:\Users\Gorkem\Desktop\Task\frontend\src\components\ui\button.tsx`:
```typescript
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-black hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-card',
        ghost: 'hover:bg-secondary',
        destructive: 'bg-priority-high text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

Not: `class-variance-authority` eksik — kur:
```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm install class-variance-authority --workspace=frontend
```

- [ ] **Step 4: Button test yaz**

`C:\Users\Gorkem\Desktop\Task\frontend\src\test\Button.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../components/ui/button';

describe('Button', () => {
  it('renders with default primary variant', () => {
    render(<Button>Tıkla</Button>);
    const button = screen.getByRole('button', { name: /Tıkla/i });
    expect(button).toHaveClass('bg-primary');
  });

  it('renders secondary variant', () => {
    render(<Button variant="secondary">İptal</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-secondary');
  });

  it('renders destructive variant', () => {
    render(<Button variant="destructive">Sil</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-priority-high');
  });

  it('shows loading state with spinner', () => {
    render(<Button loading>Yükleniyor</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button.querySelector('span[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Tıkla</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Pasif</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

Not: `@testing-library/user-event` eksik — kur:
```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm install --save-dev @testing-library/user-event --workspace=frontend
```

- [ ] **Step 5: HelloTaskFlow'a shadcn button ekle**

`C:\Users\Gorkem\Desktop\Task\frontend\src\components\HelloTaskFlow.tsx`:
```typescript
import { Button } from './ui/button';

export function HelloTaskFlow() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded-lg bg-card p-8 shadow-card">
        <h1 className="text-4xl font-bold text-primary">TaskFlow</h1>
        <p className="mt-2 text-secondary-foreground">Hello from TaskFlow</p>
        <div className="mt-4 flex gap-2">
          <span
            className="rounded-sm bg-priority-high px-2 py-1 text-xs font-medium text-white"
            aria-label="Yüksek öncelik"
          >
            Yüksek
          </span>
          <span
            className="rounded-sm bg-priority-medium px-2 py-1 text-xs font-medium text-black"
            aria-label="Orta öncelik"
          >
            Orta
          </span>
          <span
            className="rounded-sm bg-priority-low px-2 py-1 text-xs font-medium text-white"
            aria-label="Düşük öncelik"
          >
            Düşük
          </span>
        </div>
        <div className="mt-6 flex gap-2">
          <Button>Ana Aksiyon</Button>
          <Button variant="secondary">İkincil</Button>
          <Button variant="destructive">Sil</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Tüm testleri çalıştır**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run test --workspace=frontend
```

Expected: `9 passed` (App: 3, Button: 6).

- [ ] **Step 7: Build doğrula**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run build:frontend
```

Expected: Hata yok.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add frontend/
git commit -m "feat(frontend): shadcn/ui setup with TaskFlow-themed Button variants"
```

---

## Task 0.6 — Supabase Projesi ve Prisma Şeması

**Files:**
- Modify: `backend/prisma/schema.prisma` (placeholder model ekle — Faz 1'de genişleyecek)
- Modify: `backend/.env.example` (Supabase URL'leri eklendi)
- Modify: `backend/.env` (kullanıcı kendi Supabase URL'lerini yazacak)
- Create: `backend/.env.local.example` (Supabase-specific env)

Bu görev Supabase projesi oluşturma + Prisma'nın bağlanabildiğini doğrulama adımlarını içerir. **Supabase projesi kullanıcı tarafından Supabase Dashboard'da oluşturulmalıdır; bu adım otomatize edilemez.**

- [ ] **Step 1: Kullanıcı: Supabase projesi oluştur**

Bu adım kullanıcının Supabase Dashboard'da yapması gereken işlemdir:

1. https://supabase.com/dashboard adresine git
2. "New Project" tıkla
3. Name: `taskflow-dev` (veya istediğin isim)
4. Database Password: güçlü bir şifre seç ve **sakla** (production'da da gerekli)
5. Region: en yakın bölge
6. Plan: Free (geliştirme için yeterli)
7. "Create new project" tıkla (2-3 dakika sürer)

- [ ] **Step 2: Kullanıcı: DATABASE_URL al**

Supabase Dashboard → Project → Settings → Database → Connection string → **Transaction pooler** (port 6543) veya **Direct connection** (port 5432).

İkisini de kopyala:
- `DATABASE_URL` (uygulama bağlantısı için — Transaction pooler önerilir)
- `DIRECT_URL` (Prisma migration için — Direct connection)

`.env`'e ekle:
```env
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].supabase.com:5432/postgres
```

- [ ] **Step 3: backend/.env.example'ı güncelle (Supabase + Prisma yapılandırması)**

`C:\Users\Gorkem\Desktop\Task\backend\.env.example`:
```env
# Server
NODE_ENV=development
PORT=3001

# Database — Supabase Postgres
# Pooler (runtime):  postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres
# Direct (migrate):  postgresql://postgres.[ref]:[pass]@aws-0-[region].supabase.com:5432/postgres
DATABASE_URL=
DIRECT_URL=

# Redis
REDIS_URL=redis://localhost:6379

# Auth (Faz 2'de kullanılacak)
JWT_ACCESS_SECRET=replace-me-with-random-string-min-16-chars
JWT_REFRESH_SECRET=replace-me-with-random-string-min-16-chars

# CORS
CLIENT_URL=http://localhost:5173
```

- [ ] **Step 4: Prisma schema'yı DIRECT_URL ile güncelle**

`C:\Users\Gorkem\Desktop\Task\backend\prisma\schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// Health-check placeholder modeli (Faz 1'de kaldırılacak)
model _HealthCheck {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  @@map("_health_checks")
}
```

- [ ] **Step 5: Kullanıcı: backend/.env'i güncelle (gerçek Supabase URL'leri)**

`C:\Users\Gorkem\Desktop\Task\backend\.env` (kendi değerlerini yaz):
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres.xxxx:xxxx@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.xxxx:xxxx@aws-0-eu-central-1.supabase.com:5432/postgres
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=dev-only-access-secret-replace-in-prod
JWT_REFRESH_SECRET=dev-only-refresh-secret-replace-in-prod
CLIENT_URL=http://localhost:5173
```

- [ ] **Step 6: İlk migration oluştur ve uygula**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run prisma:migrate --workspace=backend -- --name init
```

Expected: `Migration succeeded` mesajı. Supabase Dashboard → Table Editor'da `_health_checks` tablosu görünmeli.

- [ ] **Step 7: Prisma client generate**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run prisma:generate --workspace=backend
```

- [ ] **Step 8: Health endpoint test'i çalıştır (Supabase bağlantısı doğrulanır)**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run test --workspace=backend
```

Expected: `services.database` = `"up"`.

- [ ] **Step 9: Manuel doğrulama**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run dev:backend
```

Başka terminalde:
```bash
curl http://localhost:3001/api/v1/health
```

Expected JSON:
```json
{
  "status": "ok",
  "timestamp": "2026-06-19T...",
  "uptime": 1.234,
  "services": {
    "database": "up",
    "redis": "up"
  }
}
```

(Redis henüz kurulmadıysa `redis: "down"` döner, status `"degraded"` olur. Bu kabul edilebilir — Redis Task 0.7'de kurulacak.)

`Ctrl+C` ile durdur.

- [ ] **Step 10: Commit**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add backend/prisma/ backend/.env.example
git commit -m "feat(backend): prisma + supabase connection with init migration"
```

Not: `backend/.env` git'e commit edilmez (.gitignore'da). Sadece `.env.example` ve migration dosyaları commit edilir.

---

## Task 0.7 — Redis Kurulumu (Lokal Docker)

**Files:**
- Create: `docker-compose.yml` (root)
- Create: `backend/.env` (REDIS_URL güncellemesi — kullanıcı)
- Modify: `docker-compose.yml` (Redis service)

- [ ] **Step 1: Docker kurulu mu kontrol et**

```bash
docker --version
```

Expected: `Docker version 20.x` veya üzeri. Yoksa https://www.docker.com/products/docker-desktop/ adresinden kur.

- [ ] **Step 2: docker-compose.yml oluştur (root)**

`C:\Users\Gorkem\Desktop\Task\docker-compose.yml`:
```yaml
version: '3.9'

services:
  redis:
    image: redis:7-alpine
    container_name: taskflow-redis
    restart: unless-stopped
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 3s
      retries: 3

volumes:
  redis-data:
```

- [ ] **Step 3: Redis container başlat**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
docker compose up -d
```

Expected: `Container taskflow-redis Started`.

- [ ] **Step 4: Redis bağlantısını doğrula**

```bash
docker compose exec redis redis-cli ping
```

Expected: `PONG`.

- [ ] **Step 5: Health endpoint test (Redis bağlantısı)**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run test --workspace=backend
```

Expected: `services.redis` = `"up"`, `status` = `"ok"`.

- [ ] **Step 6: Manuel doğrulama**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run dev:backend
```

Başka terminalde:
```bash
curl http://localhost:3001/api/v1/health
```

Expected: `services.redis: "up"`.

`Ctrl+C` ile durdur.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add docker-compose.yml
git commit -m "feat(infra): redis 7 via docker compose for local development"
```

---

## Task 0.8 — ESLint + Prettier + Husky (Pre-commit Zinciri)

**Files:**
- Create: `.eslintrc.cjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.lintstagedrc.json`
- Create: `.husky/pre-commit`

- [ ] **Step 1: .prettierrc.json oluştur**

`C:\Users\Gorkem\Desktop\Task\.prettierrc.json`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 2: .prettierignore oluştur**

`C:\Users\Gorkem\Desktop\Task\.prettierignore`:
```
node_modules
dist
build
coverage
*.lock
package-lock.json
backend/prisma/migrations
```

- [ ] **Step 3: .eslintrc.cjs oluştur (root, monorepo için paylaşılan kurallar)**

`C:\Users\Gorkem\Desktop\Task\.eslintrc.cjs`:
```javascript
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  ignorePatterns: ['dist', 'build', 'node_modules', 'coverage', '*.config.js', '*.config.ts'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': 'error',
  },
};
```

- [ ] **Step 4: Frontend'e React hook plugin ekle**

`C:\Users\Gorkem\Desktop\Task\frontend\.eslintrc.cjs`:
```javascript
module.exports = {
  root: false,
  extends: [
    '../../.eslintrc.cjs',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  ignorePatterns: ['dist', 'node_modules', 'coverage'],
};
```

`eslint-plugin-react-hooks` kur:
```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm install --save-dev eslint-plugin-react-hooks --workspace=frontend
```

- [ ] **Step 5: .lintstagedrc.json oluştur**

`C:\Users\Gorkem\Desktop\Task\.lintstagedrc.json`:
```json
{
  "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,css}": ["prettier --write"]
}
```

- [ ] **Step 6: Husky kur ve pre-commit hook oluştur**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run prepare
npx husky add .husky/pre-commit "npx lint-staged"
```

Expected: `.husky/pre-commit` dosyası oluşur, içeriği:
```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

Dosya executable olmalı (Unix sistemlerde). Windows'ta Git Bash zaten hook'u okur; eğer hata olursa manuel olarak:
```bash
cd "C:/Users/Gorkem/Desktop/Task"
chmod +x .husky/pre-commit
```

- [ ] **Step 7: Format + lint doğrula**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
npm run format
npm run lint
```

Expected: Format uygulanır (zaten formatlıysa no-op), lint hatası yok.

- [ ] **Step 8: Pre-commit hook test et (küçük bir değişiklik yap)**

`C:\Users\Gorkem\Desktop\Task\frontend\src\App.tsx`'e geçici olarak kötü formatlı bir satır ekle:
```typescript
const    x  =  1  ;
```

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add frontend/src/App.tsx
git commit -m "test: pre-commit hook"
```

Expected: lint-staged çalışır, dosyayı otomatik formatlar. Commit başarılı olur veya format sonrası tekrar commit ister.

Eğer commit başarısız olursa (format sonrası değişiklik), tekrar:
```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add frontend/src/App.tsx
git commit -m "test: pre-commit hook"
```

Şimdi başarılı olmalı.

Test satırını kaldır:
```typescript
// geçici test satırı kaldırıldı
```

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add frontend/src/App.tsx
git commit -m "chore: remove pre-commit test line"
```

- [ ] **Step 9: Commit (lint/format/husky setup)**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add .eslintrc.cjs .prettierrc.json .prettierignore .lintstagedrc.json frontend/.eslintrc.cjs
git commit -m "chore: eslint + prettier + husky pre-commit chain"
```

---

## Task 0.9 — İlk Deploy (Vercel + Railway)

**Files:**
- Modify: `backend/src/index.ts` (PORT environment binding)
- Create: `backend/Procfile` (Railway için)
- Create: `backend/railway.json` (Railway config)
- Create: `frontend/vercel.json` (Vercel config)

Bu görev kullanıcının Vercel + Railway hesaplarını bağlamasını ve ilk deploy'u yapmasını içerir. **Bu adımlar otomatize edilemez — kullanıcı dashboard'dan yapmalı.**

- [ ] **Step 1: Backend Procfile oluştur (Railway)**

`C:\Users\Gorkem\Desktop\Task\backend\Procfile`:
```
web: npm run build && npm run start
```

- [ ] **Step 2: Backend railway.json oluştur**

`C:\Users\Gorkem\Desktop\Task\backend\railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/api/v1/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 3: Frontend vercel.json oluştur**

`C:\Users\Gorkem\Desktop\Task\frontend\vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 4: GitHub repo oluştur ve push**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git remote add origin https://github.com/[kullanıcı]/taskflow.git
git branch -M main
git push -u origin main
```

- [ ] **Step 5: Railway'de backend deploy**

1. https://railway.app adresine git, GitHub ile giriş yap
2. "New Project" → "Deploy from GitHub repo" → `taskflow` repo'sunu seç
3. Root Directory: `backend`
4. "Add variables" — backend/.env'deki tüm değişkenleri ekle:
   - `NODE_ENV=production`
   - `PORT=3001` (Railway otomatik atar, override etme)
   - `DATABASE_URL=...` (production Supabase)
   - `DIRECT_URL=...`
   - `REDIS_URL=...` (Faz 0'da lokal; production için Railway'de Redis eklenecek — Faz 9'da)
   - `JWT_ACCESS_SECRET=...` (yeni rastgele 32+ karakter)
   - `JWT_REFRESH_SECRET=...` (yeni rastgele 32+ karakter)
   - `CLIENT_URL=https://taskflow.vercel.app` (Vercel URL'i tahmini)
5. Deploy başla
6. Deploy URL'ini not al: `https://taskflow-backend.up.railway.app`

- [ ] **Step 6: Vercel'de frontend deploy**

1. https://vercel.com adresine git, GitHub ile giriş yap
2. "Add New Project" → `taskflow` repo'sunu seç
3. Root Directory: `frontend`
4. Framework: Vite (otomatik algılanır)
5. "Environment Variables" — frontend env'leri ekle:
   - `VITE_API_URL=https://taskflow-backend.up.railway.app`
   - `VITE_WS_URL=wss://taskflow-backend.up.railway.app`
   - `VITE_SUPABASE_URL=...` (henüz kullanılmıyor, Faz 1'de gerekli)
   - `VITE_SUPABASE_ANON_KEY=...`
6. "Deploy" tıkla
7. URL: `https://taskflow.vercel.app`

- [ ] **Step 7: CORS ayarı (backend .env)**

Railway'de backend env'inde `CLIENT_URL`'i Vercel URL'i ile güncelle:
```
CLIENT_URL=https://taskflow.vercel.app
```

Redeploy tetikle (veya `railway up` ile).

- [ ] **Step 8: Production doğrulama**

Tarayıcıda `https://taskflow.vercel.app` aç. Gör: "TaskFlow" başlığı, amber renkte, koyu temada.

`https://taskflow-backend.up.railway.app/api/v1/health` adresine git. JSON:
```json
{
  "status": "ok" | "degraded",
  "services": {
    "database": "up",
    "redis": "down"  // Faz 0'da production Redis yok
  }
}
```

`status: "degraded"` bu faz için kabul edilebilir (Redis production'da henüz yok).

- [ ] **Step 9: Commit (deploy config)**

```bash
cd "C:/Users/Gorkem/Desktop/Task"
git add backend/Procfile backend/railway.json frontend/vercel.json
git commit -m "chore(infra): vercel + railway deploy config"
git push
```

- [ ] **Step 10: Faz 0 çıkış kriteri doğrulama**

Tüm `ROADMAP.md` Faz 0 çıkış kriteri:

```
✓ "Hello TaskFlow" sayfası production'da görünüyor (Vercel URL)
✓ Backend health-check endpoint'i dönüyor (Railway URL)
✓ DB bağlı (Supabase)
✓ Redis lokalde çalışıyor (Docker)
✓ CI lint zinciri kurulu (ESLint + Prettier + Husky)
```

---

## Verification (Faz 0 Sonu)

Tüm Faz 0 görevleri tamamlandığında:

```bash
# Root'tan
cd "C:/Users/Gorkem/Desktop/Task"

# Tüm testler
npm run test

# Tüm build
npm run build:backend
npm run build:frontend

# Lint + format check
npm run lint
npm run format:check

# Backend smoke test (lokal)
npm run dev:backend &
sleep 3
curl http://localhost:3001/api/v1/health
# Beklenen: status: "ok" | "degraded" (Redis lokalde varsa "ok")
kill %1

# Frontend smoke test (lokal)
npm run dev:frontend &
sleep 3
curl -s http://localhost:5173 | grep -i "taskflow"
# Beklenen: HTML çıktısında "TaskFlow" görünür
kill %1

# Production doğrulama (deploy sonrası)
curl https://taskflow-backend.up.railway.app/api/v1/health
# Beklenen: 200, status: "ok" | "degraded"
```

**Faz 0 çıkış kriteri:** Tüm yukarıdaki komutlar başarılı, production URL'lerinden en az biri (Vercel veya Railway) canlı yanıt veriyor, lint zinciri commit'lerde otomatik çalışıyor.

---

## Faz 1'e Geçiş Koşulu

Faz 0 kapandıktan sonra Faz 1'e (Veritabanı Şeması ve Tenant Temeli) geçiş:

1. `ROADMAP.md` tablosunda Faz 0 durumunu `✅ Tamamlandı` olarak güncelle
2. Master plan'daki `G1` decision gate'i (Faz 1 sonu) için not al
3. Faz 1 için ayrı bir writing-plans çağrısı yap (bu plan tekrar yazılmaz)

---

## Notlar

- **Environment dosyaları:** `.env` git'e commit edilmez. Sadece `.env.example` commit edilir. Supabase URL'leri kullanıcıya özel.
- **Redis production:** Faz 0'da lokal Docker. Production Redis Railway'de Faz 9'da eklenecek (Faz 6/8 polling + Faz 9 WebSocket için gerekli).
- **JWT secrets:** Geliştirmede placeholder kullanılabilir ama production'da **mutlaka** güçlü rastgele değerler olmalı (32+ karakter).
- **Prisma:** Faz 0'da sadece `_health_checks` placeholder tablosu var. Tüm iş modelleri Faz 1'de.
- **shadcn:** İlk bileşen Button. Diğer bileşenler (Dialog, Dropdown, Input) Faz 3'te ihtiyaç oldukça eklenecek — YAGNI.

---

*Bu plan `ROADMAP.md` Faz 0 ile birebir eşleşir. Master plan: `docs/superpowers/plans/claude-md-frontend-md-project-md-roadma-smooth-nebula.md`.*
