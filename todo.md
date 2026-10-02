# TaskFlow Optimize Roadmap — Mevcut Faz 0–6 Sonrası

## Mevcut Durum Denetimi

| Eski Faz          | Durum                        | Eksik / Risk                                                                        |
| ----------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| 0 — Altyapı       | Tamamlandı                   | CI/Husky var; build, lint ve 380 test yeşil                                     |
| 1 — Tenant/DB     | Tamamlandı                   | R1 güvenlik kapısı geçti; R2 rol ve yarış koşulları sonraki kapsam                  |
| 2 — Auth          | Kısmi                        | Akışlar çalışıyor; `/users/me` yok; tenantless kullanıcı yanlışlıkla `companyAdmin` |
| 3 — Layout        | Büyük ölçüde çalışıyor       | Route lazy-load yok; gerçek 403/404 yok; takım rolü frontend’de global hesaplanıyor |
| 4 — Teams         | İşlevsel, güvenlik açığı var | Üye çıkarma aktif görevleri bırakıyor; tenantless rolü korunuyor                    |
| 5 — Tasks         | Özellikli fakat no-ship      | Cross-tenant mutation, stale ack race, duplicate notification, eksik RLS            |
| 6 — Notifications | Kısmi                        | Tekil read yok; frontend enum drift; pagination sınırsız istek üretebilir           |

Doğrulanan taban:

- Frontend: `349/350` test geçiyor; 1 mevcut `HeroIllustration` testi kırık.
- Backend: full suite `351` test geçti; son deploy-gate hedefli testleri `8/8` geçti.
- Backend build: geçiyor.
- Lint: `0 error`, `0 warning`.
- Frontend bundle budget: geçti; initial gzip `136.29 kB`, API p95 read/write `30.0/34.6ms`.
- Kritik bulgular `review.md` içinde doğrulandı.
- Production DB yok; corrective migration kullanılabilir.

## Roadmap Yapısı

Eski Faz 0–6 silinmez. `ROADMAP.md` içinde “Implementation Ledger” olarak korunur. Yeni çalışma sırası release fazlarıyla devam eder.

## R0 — Yeşil Baseline

- [x] Backend build hatası ve tüm lint error’larını gider.
- [x] Frontend/backend testlerini değiştirmeden tekrar çalıştır.
- [x] React Router warning, test `act(...)` warning ve deprecated cookie kullanımını temizle.
- [x] CI ekle: frontend/backend build, lint, test.
- [x] Husky pre-commit hook ile lint-staged çalıştır.
- [x] Çıkış kapısı: `build + lint + 380 test` tamamen yeşil.

## R1 — Tenant ve Authorization Kurtarma — Tamamlandı

- [x] `withTenantContext` içinde güvenli, parametreli `set_config` kullan.
- [x] Tenant servislerine transaction client açıkça geçir.
- [x] Auth dışındaki tenant-scoped Prisma erişimlerini tenant transaction içinde çalıştır.
- [x] `task_assignees` ve `task_status_acks` için parent task/team üzerinden RLS policy ekle.
- [x] Task priority, fields, delete, ack, cancel ve status mutasyonlarında tenant guard’ı permission kontrolünden önce uygula.
- [x] Cross-tenant kaynakları `404`, aynı tenant içindeki yetkisiz işlemleri `403` döndür.
- [x] Task mutation ve ack için güncel takım üyeliğini zorunlu yap.
- [x] Mevcut migration dosyalarını değiştirme; forward corrective migration ekle.
- [x] SQL query parametre loglarını production’da kapat veya maskele.

Çıkış testleri:

- [x] Şirket Admini başka tenant task UUID’sini değiştiremez veya silemez.
- [x] Takım Admini başka takımda admin sayılmaz.
- [x] RLS doğrudan DB erişiminde assignee/ack verisini tenant dışına sızdırmaz.
- [x] Tenantless kullanıcı tenant endpoint’lerinde `403` alır.

## R2 — Rol ve Çoklu Assignee Modeli

- [x] `User.role` değerlerini `member | companyAdmin` ile sınırla.
- [x] Takım Admini yetkisini yalnız `team_members.role=teamAdmin` üzerinden hesapla.
- [x] Mevcut global `teamAdmin` kullanıcılarını `member` yap; takım üyelik rollerini koru.
- [x] Frontend selected-team yetkisini takım detayındaki üyelik rolünden hesapla.
- [x] `PATCH /api/v1/teams/:teamId/members/:userId/role` endpoint’ini ekle.
- [x] `/permissions` ekranında şirket rolünü; takım detayında takım rolünü yönet.
- [x] Tenantless kaydı varsayılan `member`; şirket oluşturan kullanıcıyı `companyAdmin` yap.
- [x] Tenantless mevcut `companyAdmin` kayıtlarını corrective migration ile `member` yap.
- [x] Aktif görev veya pending onayı bulunan takım üyesini çıkarmayı `409 MEMBER_HAS_ACTIVE_TASKS` ile engelle.

Çoklu durum onayı:

- [x] Tek assignee için yetkili assignee/admin doğrudan status uygulasın.
- [x] Çoklu assignee için assignee veya admin teklif oluştursun.
- [x] Assignee proposer otomatik onaylansın.
- [x] Takım dışı admin proposer onay sayılmasın; tüm mevcut assignee’ler onaylasın.
- [x] Pending teklif deadline’da otomatik uygulanmasın veya silinmesin.
- [x] Teklifi proposer, takım admini veya şirket admini iptal edebilsin.
- [x] `pendingVersion` ekle; ack’i bu version’a bağla.
- [x] Ack/apply işlemini `Serializable` transaction ve task row lock ile yap.
- [x] Eski version ack’inin yeni teklifi uygulamasını engelle.
- [x] Status değişimi ve notification’ı yalnız bir kez üret.
- [x] `applyExpiredPendingStatuses` cron’unu kaldır; completed+expired archive cron’unu koru.

## R3 — Faz 2–6 Eksiklerini Kapatma

### Auth

- [x] `GET /api/v1/users/me` ekle.
- [x] Auth bootstrap refresh sonrası `/users/me` ile canonical kullanıcı durumunu doğrula.
- [x] Refresh rotation, blacklist ve session testlerini koru.
- [x] Risk bazlı rate limits uygula:
  - Register: `5/dk`
  - Login: `10/dk`
  - Refresh: `30/dk`
  - Authenticated read: `120/dk`
  - Write: `30/dk`
  - Upload: `10/dk`

### Teams ve Tasks

- [x] Aktif takım seçimini tek store kaynağından yönet; Dashboard ve Sidebar ayrı state tutmasın.
- [x] Deadline takvim tarihini timezone kayması üretmeyen `DD-MM-YYYY` sözleşmesiyle yönet.
- [x] Task list pagination UI’ını tamamla.
- [x] Kullanılmayan `@dnd-kit/sortable` ve `@dnd-kit/utilities` bağımlılıklarını kaldır.
- [x] Mevcut kolonlar arası drag davranışını koru.
- [x] Optimistic task mutation’da ilgili liste/detail cache’lerini güncelle; hatada rollback yap.

### Notifications

- [x] `PATCH /api/v1/notifications/:id/read` ekle.
- [x] Backend enum ve frontend DTO’da şu tipleri eşle:
  - `task_assigned`
  - `task_commented`
  - `message_received`
  - `task_status_pending`
  - `task_status_changed`
- [x] Notification sayfasındaki `limit=1` cursor zincirini kaldır.
- [x] Sonraki cursor isteğini yalnız kullanıcı “Daha fazla” seçtiğinde yap.
- [x] Topbar ve tam sayfada aynı pagination/cache katmanını kullan.
- [x] Polling’i yalnız görünür sekmede `30s` çalıştır.
- [x] Çıkış kapısı: panel, tam sayfa, tekil read, mark-all, cursor pagination ve tüm notification tipleri çalışır.

## R4 — Frontend Performans Temeli

### R4 Uygulama Durumu

- [x] Route splitting, eager AppShell, tenant/team query cache scope.
- [x] 100 DOM record cap, lazy dimensioned images, Topbar identity key.
- [x] Bundle/Lighthouse/API p95 gates and performance CI job.
- [ ] INP `250ms`: R6 field gate; R4 lab gate uses TBT.

- [x] Landing, auth ve protected route’ları `React.lazy` + `Suspense` ile ayır.
- [x] App shell’i eager; sayfa modüllerini lazy tut.
- [x] Route splitting sonrası bütçe geçti; ortak vendor chunk gerekmedi.
- [x] Query-key factory ekle.
- [x] Tenant değişince tüm tenant cache’ini; takım değişince takım-scoped cache’i temizle.
- [x] Liste başına en fazla 100 DOM kayıt kullan; küçük ekip ölçeğinde virtualization ekleme.
- [x] Görselleri `loading="lazy"` ve sabit boyutla render et.
- [x] Topbar effect içindeki senkron state reset’i kaldır; kullanıcı kimliğiyle keyed pagination state kullan.
- [x] Bundle ve Lighthouse bütçelerini CI’da zorunlu yap:
  - [x] İlk route JS ≤ `200 kB gzip`
  - [x] Async route chunk ≤ `100 kB gzip`
  - [x] LCP ≤ `3s`
  - [ ] INP ≤ `250ms` (R6 field gate)
  - [x] CLS ≤ `0.1`
  - [x] API p95 read ≤ `300ms`
  - [x] API p95 write ≤ `500ms`

## R5 — Production Çekirdek Ekranları

### Profil

- [x] `GET/PATCH /api/v1/users/me` ekle.
- [x] `POST /api/v1/users/me/avatar` ekle.
- [x] Ad, avatar, display ID, şifre ve üç bildirim tercihini tamamla.
- [x] User modeline varsayılan `true` üç boolean notification preference ekle.

### Şirket

- [x] `GET/PATCH /api/v1/company/settings` ekle.
- [x] `POST /api/v1/company/settings/logo` ekle.
- [x] `GET /api/v1/company/users` ekle.
- [x] `POST /api/v1/company/users` — `{ displayId }` ekle.
- [x] `PATCH /api/v1/users/:id/role` ekle.
- [x] Şirket Admininin kendi rolünü değiştirmesini engelle.
- [x] Global rol + çoklu takım rolü değişikliklerini satır bazlı taslak, X/✓ ve confirmation dialog ile atomic uygula.

### Davet

- [x] Tenant-scoped `Invitation` modeli ekle.
- [x] Davet geçerliliğini `7 gün` yap.
- [x] Admin iptal akışını ekle.
- [x] E-posta olmadan in-app notification davet akışını ekle.
- [x] Başka tenant ve eksik kullanıcı için aynı `404 USER_NOT_FOUND` yanıtını döndür.

### Görseller

- [x] Maksimum input boyutunu `25 MB` yap.
- [x] Backend’de MIME ve dosya imzasını doğrula.
- [x] Avatarı `512×512 WebP` üret.
- [x] Logoyu en uzun kenar `1024px` olacak şekilde WebP üret.
- [x] Supabase Storage yollarını tenant/user scoped yap.
- [x] Yeni obje başarıyla yazılmadan eski objeyi silme.

## R6 — QA ve Production

- [ ] Gerçek 403, 404, genel error boundary, retryable error ve offline state ekle.
- [ ] Skeleton, empty state, keyboard navigation, focus trap, reduced motion ve WCAG AA kontrollerini tamamla.
- [ ] Playwright akışları ekle:
  - Kayıt ve şirket oluşturma
  - Davet kabulü
  - Rol ve tenant engelleri
  - Görev oluşturma, multi-assignee teklif/onay, drag, yorum ve arşiv
  - Üye yeniden atama ve çıkarma
  - Profil ve şirket ayarları
  - Bildirim read, mark-all ve pagination
- [ ] Coverage hedefleri: backend ≥ `%70`, frontend ≥ `%50`, kritik authorization branch’leri `%100`.
- [ ] Vercel Hobby frontend project ve dar auth proxy kur; production branch'i `main` olarak ayarla, Preview ortamını production secret/verilerinden ayır.
- [ ] Render Free tek web service + Upstash Redis/QStash production kur; production branch'i `main` yap ve auto-deploy'u yalnızca CI kontrolleri geçtikten sonra çalışacak şekilde ayarla.
- [ ] `main` için PR, bağımsız review ve gerekli CI status check korumalarını etkinleştir; Render'ın atlanan kontrolleri başarılı sayabilmesini hesaba kat.
- [ ] Render ve Vercel production deploy'larının aynı tam SHA'dan çıktığını doğrula. Tek migration sahibi ve provider'da uygulanabilir migration sırasını belirle; geçişin eski ve yeni uygulama sürümüyle uyumluluğunu kanıtla. Sıra veya uyumluluk doğrulanamıyorsa release BLOCKED.
- [ ] Sentry frontend/backend release ve source map entegrasyonunu kur.
- [ ] Render structured log, readiness, health check ve alert ekle.
- [ ] Production kapısı: encrypted backup, migration dry-run, test, typecheck, lint, build, bundle budget, Lighthouse, read-only smoke, Render/Vercel deploy SHA eşleşmesi ve rollback/restore kontrolleri tamamen yeşil.
- [ ] Free-tier deployment'ın sıfır maliyetli public MVP olduğu ve provider SLA'sı vermediği release handoff'ta açıkça belirtilsin.

### R6D - Free-tier deploy production gate (2026-08-24)

Uygulanan local isler:

- [x] Auth API ile direct Render API istemcisini ayir.
- [x] Yalniz `/api/v1/auth/*` icin fixed-origin Vercel proxy ekle.
- [x] Render Free tek web service blueprint, env contract ve `/health` + `/ready` ekle.
- [x] QStash signed hourly archive endpoint, raw-body verification ve internal rate limit ekle.
- [x] Encrypted `pg_dump` ve restore verification scriptlerini ekle.
- [x] Read-only production smoke ve exact-release verification scriptlerini ekle.
- [x] Exact-SHA, backup, migration, Render, Vercel ve read-only smoke için yerel release-workflow prototipini ve kontrollerini ekle; GitHub Actions release workflow'u seçilen yayın yolu değildir ve production'da kullanılmaz.
- [x] Render `RENDER_GIT_COMMIT` ile health release kontrolunu bagla.
- [x] Local production runbook hazirla. Push edilmedi.

Kontrol sonucu:

- [x] Backend full suite + V8 coverage: `365` test gecti; toplam coverage `79.00/75.45/77.90/80.55` (stmt/branch/func/line).
- [x] Critical authorization coverage gate: 4 dosya, minimum `%85`, gecti.
- [x] Latest stable toolchain: `vitest@4.1.11`, `@vitest/coverage-v8@4.1.11`, `@playwright/test@1.62.1`.
- [x] Frontend full suite + V8 coverage: `352` test gecti; `73.55/63.72/68.12/76.85` coverage.
- [x] Yeni deploy-gate testleri: `8/8` gecti.
- [x] Lint, backend/frontend build, bundle budget ve API p95 gecti.
- [x] Release/backup/smoke static testleri: `8/8` gecti.
- [ ] Global Prettier check yesil degil: mevcut/user dosyalarinda `17` format uyarisi.

Kalan R6D isleri:

- [ ] Upstash Redis/QStash gercek hesap, TLS URL, current/next signing key ve hourly schedule kur.
- [ ] Vercel, Render, Supabase ve QStash production ayarlarını sağlayıcı panellerinde doğrula; GitHub `production` Actions environment'ı provider-native deploy'ları korumaz ve bu akışta kullanılmaz.
- [ ] Sentry frontend/backend release-source-map ve tek Uptime monitor kur.
- [x] Coverage scriptleri/critical coverage gate ve local-only Playwright E2E gate ekle; E2E `2/2` gecti.
- [x] Lighthouse gate'i preview server + local Chrome ile calistir; `2 URL x 3 run` gecti.
- [x] Encrypted backup'i disposable DB'ye restore ederek rehearsal yap; dump/checksum/restore-list gecti.
- [x] Provider preflight ve release workflow job'ı için yerel kontroller eklendi; bu prototip deploy yolu değildir. Canlı provider ayarları ve deploy yetkileri henüz doğrulanmadı.
- [ ] Vercel/Render rollback ve restore drill yap.
- [ ] Gercek production read-only smoke calistir.
- [ ] Provider dashboard kanitlarini ve final release gate'ini tamamla.

## V2 — Chat ve Realtime

- [ ] Önce tenant-scoped REST chat geliştir.
- [ ] Sonra kısa ömürlü tek kullanımlık WebSocket ticket ekle.
- [ ] Reconnect için jitter’lı exponential backoff `1–30s` kullan.
- [ ] Reconnect sonrası React Query resync yap.
- [ ] Bildirim/chat polling’i WebSocket kararlı olduktan sonra kaldır.
- [ ] Redis Pub/Sub’ı yalnız birden fazla backend instance olduğunda ekle.

## Doküman Güncellemeleri

- [ ] `ROADMAP.md`: eski faz ledger + yeni R0–R6/V2.
- [ ] `PROJECT.md`: takım-scoped admin, çoklu assignee onayı, rate limits, invitation ve yeni route’lar.
- [ ] `FRONTEND.md`: performans bütçeleri, pagination, loading/error ve large-list kuralları.
- [ ] `AGENTS.md`: sabit `10/dk` yerine `PROJECT.md` risk profili.

## Sabit Varsayımlar

- Production DB ve gerçek kullanıcı verisi yok.
- Çoklu assignee + oybirliği korunur.
- Pending teklif deadline’da bekler.
- Aktif görevi olan üye çıkarılmaz.
- Team Admin yalnız takım üyeliği rolüdür.
- v1 chat/WebSocket içermez.
- Hedef: tenant başına ≤100 kullanıcı, takım başına ≤1.000 görev.
