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
