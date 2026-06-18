# ROADMAP.md — TaskFlow Geliştirme Yol Haritası

> Tek geliştirici, ürün seviyesinde kalite hedefiyle hazırlanmış adım adım plan.  
> Yaklaşım: **Dikey dilimleme** — her faz, bir önceki fazın üzerine sağlam basarak ilerler. Yarım kalan paralel iş yok; bir faz bitmeden sonrakine geçilmez.  
> Referans dökümanlar: `PROJECT.md` (iş kuralları), `FRONTEND.md` (tasarım sistemi), `CLAUDE.md` (geliştirme kuralları)

---

## Neden Bu Sıra?

Tek kişi olarak en büyük risk **context switching** ve **temelsiz inşa**dır. Bu yüzden roadmap şu mantıkla kurulu:

1. **Önce iskelet, sonra et:** Auth + tenant + temel layout olmadan hiçbir özellik gerçek anlamda test edilemez — her şey bunun üzerine oturuyor.
2. **Tek kullanıcı tipi akışı önce:** Kanban + görev yönetimi, mesajlaşmadan önce gelir çünkü PROJECT.md'nin çekirdek değer önerisi bu.
3. **Yetki karmaşıklığı kademeli eklenir:** Önce "tek rol gibi" çalışan bir sistem kurulur, sonra rol katmanları (Takım Admini, Şirket Admini) üzerine eklenir. Baştan üç rolü birden doğru kurmaya çalışmak hata riskini katlar.
4. **Gerçek zamanlılık (WebSocket) en sona:** En karmaşık ve debug'ı en zor katman; temel CRUD akışları sağlamlaşmadan eklenirse her hatayı ayırt etmek zorlaşır.
5. **Polish ve test her fazın içinde, sonunda değil:** Her faz "çalışıyor" + "temel testi var" + "tasarım sistemine uygun" olmadan kapanmaz.

---

## Faz 0 — Proje Temeli ve Altyapı

**Hedef:** Boş ama çalışan, deploy edilebilir bir iskelet.

| # | Görev | Doğrulama |
|---|---|---|
| 0.1 | Monorepo / klasör yapısı kurulumu (`/frontend`, `/backend`) | İki proje de ayrı ayrı çalışıyor |
| 0.2 | Backend: Express + TypeScript + temel klasör yapısı (routes, controllers, middleware, services) | `npm run dev` ile sunucu ayağa kalkıyor |
| 0.3 | Frontend: Vite + React + TypeScript + Tailwind kurulumu | Boş sayfa render oluyor |
| 0.4 | `PROJECT.md` §6 token'larını Tailwind config + CSS değişkenlerine işle | Dark tema renkleri tarayıcıda doğru görünüyor |
| 0.5 | shadcn/ui kurulumu, temel bileşenler eklenir (Button, Input, Dialog, Dropdown) | `FRONTEND.md` §4 kurallarına göre özelleştirilmiş |
| 0.6 | Supabase projesi oluşturma, Prisma kurulumu, ilk migration (boş şema) | `npx prisma studio` ile DB bağlantısı görülüyor |
| 0.7 | Redis kurulumu (lokal Docker + Railway/Render hazırlığı) | `redis-cli ping` → `PONG` |
| 0.8 | ESLint + Prettier + Husky pre-commit kurulumu | Commit öncesi otomatik format çalışıyor |
| 0.9 | Vercel (frontend) + Railway/Render (backend) ilk deploy | Boş ama canlı URL'ler çalışıyor |

**Faz 0 Çıkış Kriteri:** Boş bir "Hello TaskFlow" sayfası production'da görünüyor, backend health-check endpoint'i (`GET /health`) dönüyor, DB ve Redis bağlı.

---

## Faz 1 — Veritabanı Şeması ve Tenant Temeli

**Hedef:** Tüm veri modeli kurulu; multi-tenant izolasyon en alt katmanda garanti.

| # | Görev | Doğrulama |
|---|---|---|
| 1.1 | Prisma şeması: `tenants`, `users`, `teams`, `team_members` tabloları | Migration hatasız çalışıyor |
| 1.2 | Prisma şeması: `tasks`, `task_comments` tabloları (FK: `team_id`, `assignee_id`, `assigner_id`) | İlişkiler doğru kuruluyor |
| 1.3 | Prisma şeması: `channels`, `messages`, `notifications` tabloları | Şema tam (PROJECT.md §7.3 referans) |
| 1.4 | Supabase RLS politikaları: her tablo için `tenant_id` bazlı satır erişimi | Farklı tenant'ın verisi RLS ile bloklanıyor (manuel test) |
| 1.5 | Seed script: test verisi (2 tenant, her birinde 2 takım, 5 kullanıcı, 10 görev) | `npm run seed` çalışıp veri oluşturuyor |

**Faz 1 Çıkış Kriteri:** Prisma Studio'da tüm tablolar görünüyor, seed verisiyle dolu, RLS ile bir tenant'ın verisi diğerine sızmıyor.

> ⚠️ Bu faz atlanmaz veya hafife alınmaz — `CLAUDE.md`'de belirtildiği gibi tenant izolasyonu hatası kritik güvenlik açığıdır. Faz 1 bitmeden Faz 2'ye geçilmez.

---

## Faz 2 — Auth ve Kayıt Akışı

**Hedef:** Kullanıcı kayıt olabiliyor, giriş yapabiliyor, opsiyonel şirket kurabiliyor.

| # | Görev | Doğrulama |
|---|---|---|
| 2.1 | Backend: `POST /auth/register` (şirket adı opsiyonel) | Şirketli ve şirketsiz kayıt ikisi de çalışıyor |
| 2.2 | Backend: `POST /auth/login`, JWT access+refresh token üretimi | Login sonrası iki token dönüyor |
| 2.3 | Backend: Auth middleware (access token doğrulama) | Token'sız istek 401 dönüyor |
| 2.4 | Backend: `POST /auth/refresh`, `POST /auth/logout` + Redis JWT blacklist | Logout sonrası eski token 401 dönüyor |
| 2.5 | Backend: Rate limiting middleware (dakikada 10 istek, Redis store) | 11. istek 429 dönüyor |
| 2.6 | Frontend: `/register` sayfası (şirket adı alanı dahil) | Form gönderimi backend'e ulaşıyor |
| 2.7 | Frontend: `/login` sayfası | Başarılı login sonrası token saklanıyor (memory + httpOnly refresh cookie) |
| 2.8 | Frontend: Protected route wrapper (auth yoksa `/login`'e yönlendir) | Token'sız `/dashboard` erişimi engelleniyor |
| 2.9 | Frontend: Axios interceptor — access token süresi dolunca otomatik refresh | Manuel test: token süresini kısaltıp doğrula |

**Faz 2 Çıkış Kriteri:** Bir kullanıcı kayıt olup giriş yapabiliyor, sayfa yenilenince oturum korunuyor, yetkisiz erişim engelleniyor.

---

## Faz 3 — Temel Layout ve Navigasyon

**Hedef:** Sabit Topbar + Sidebar iskeleti; içerik alanı henüz boş ama yapı doğru.

| # | Görev | Doğrulama |
|---|---|---|
| 3.1 | Frontend: Layout bileşeni (Topbar + Sidebar sabit, içerik alanı `<Outlet />`) | Sayfa geçişlerinde Topbar/Sidebar yeniden render olmuyor |
| 3.2 | Frontend: Topbar — logo, Dashboard/Teams/Tasks linkleri, placeholder ikonlar (🔔🌙👤) | `FRONTEND.md` §2 sıkı yoğunluk kurallarına uygun |
| 3.3 | Frontend: Sidebar — şirket adı, takım seçici (henüz statik), üye listesi (henüz statik) | Responsive: mobilde hamburger menüye dönüyor |
| 3.4 | Frontend: Dark mode toggle (Zustand store + localStorage yerine bellek state — ama tema CSS class toggle) | Tema değişimi anında uygulanıyor |
| 3.5 | Frontend: React Router route haritası kurulumu (tüm route'lar, PROJECT.md §3) | Tüm route'lar boş placeholder sayfalarla çalışıyor |
| 3.6 | Backend: `GET /users/me` endpoint'i (giriş yapan kullanıcı bilgisi + rol + tenant) | Sidebar'a gerçek kullanıcı adı bağlanabiliyor |

**Faz 3 Çıkış Kriteri:** Giriş yapan kullanıcı, tüm sayfalar arasında sabit Topbar/Sidebar ile gezinebiliyor; her route boş ama erişilebilir.

---

## Faz 4 — Takımlar (Teams) — Tek Rol Varsayımıyla

**Hedef:** Takım oluşturma, listeleme, detay görüntüleme. Bu fazda yetki kontrolü henüz basit (sadece "giriş yapmış mı" seviyesinde); rol bazlı kısıtlama Faz 7'de eklenecek.

| # | Görev | Doğrulama |
|---|---|---|
| 4.1 | Backend: `POST /teams`, `GET /teams` (kullanıcının dahil olduğu takımlar) | Seed verisiyle liste dönüyor |
| 4.2 | Backend: `GET /teams/:id` (üyeler + görev sayısı) | Tenant izolasyonu korunuyor |
| 4.3 | Backend: `POST /teams/:id/members`, `DELETE /teams/:id/members/:userId` | Üye ekleme/çıkarma çalışıyor |
| 4.4 | Frontend: `/teams` sayfası — takım kartları | `FRONTEND.md` §4.6 genel kart kurallarına uygun |
| 4.5 | Frontend: `/teams/:id` sayfası — üye listesi + görev listesi (görev kartları henüz statik) | Üye ekle/çıkar modalı çalışıyor (§4.3 modal kuralları) |
| 4.6 | Frontend: Sidebar'daki takım seçici gerçek veriyle bağlanıyor | Takım değiştirince ilgili veri güncelleniyor |

**Faz 4 Çıkış Kriteri:** Kullanıcı kendi takımlarını görebiliyor, takım detayına girip üyeleri görebiliyor.

---

## Faz 5 — Görevler (Tasks) ve Kanban — Çekirdek Değer Önerisi

**Hedef:** Uygulamanın asıl kalbi. Görev CRUD + Kanban sürükle-bırak + filtreleme + detay sayfası.

| # | Görev | Doğrulama |
|---|---|---|
| 5.1 | Backend: `POST /tasks` (başlık, açıklama, deadline, öncelik, atanan kişi) | Görev oluşturma çalışıyor |
| 5.2 | Backend: `GET /tasks` (kullanıcıya atanmış + filtre query param'ları) | Durum/öncelik/takım/tarih filtreleri çalışıyor |
| 5.3 | Backend: `GET /tasks/:id`, `PATCH /tasks/:id/status`, `PATCH /tasks/:id/priority` (ayrı endpoint'ler — PROJECT.md §2) | Durum güncelleme ile öncelik güncelleme ayrı yetki kontrolüne sahip |
| 5.4 | Backend: `POST /tasks/:id/comments`, `GET /tasks/:id/comments` | Yorum ekleme/listeleme çalışıyor |
| 5.5 | Backend: Arşivleme cron/job — deadline geçmiş + "Yapıldı" görevler arşive taşınıyor | Manuel tetiklenebilir test job'ı |
| 5.6 | Frontend: `/dashboard` Kanban — 3 sabit kolon, görev kartları | `dnd-kit` ile sürükle-bırak çalışıyor |
| 5.7 | Frontend: Sürükle-bırak → `PATCH /tasks/:id/status` çağrısı + optimistic update (React Query) | Sürükleme sonrası anlık UI güncellenmesi, hata olursa geri alınıyor |
| 5.8 | Frontend: `/tasks` sayfası — liste + filtre çubuğu | Filtreler URL query param'a yansıyor (paylaşılabilir link) |
| 5.9 | Frontend: `/tasks/:id` sayfası — detay, durum/öncelik dropdown, yorum bölümü | `FRONTEND.md` §4.2 form kuralları, §4.4 dropdown kuralları uygulanmış |
| 5.10 | Frontend: Görev Kartı bileşeni (öncelik rengi, deadline, avatar) | `PROJECT.md` §5.3 + `FRONTEND.md` §4.6 kurallarına tam uyum |

**Faz 5 Çıkış Kriteri:** Bir kullanıcı görev oluşturabiliyor, kanban'da sürükleyip durumunu değiştirebiliyor, filtreleyip detayına girip yorum yapabiliyor. **Bu noktada ürün "kullanılabilir" durumda.**

---

## Faz 6 — Bildirimler (Polling Versiyonu)

**Hedef:** Bildirim sistemi önce basit polling ile çalışır hale getirilir; WebSocket Faz 9'da eklenecek. Bu, karmaşıklığı erken katmamak için bilinçli bir ara adım.

| # | Görev | Doğrulama |
|---|---|---|
| 6.1 | Backend: `notifications` tablosuna yazma tetikleyicileri (görev atandı, yorum geldi) | Görev atayınca bildirim satırı oluşuyor |
| 6.2 | Backend: `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` | Okundu işaretleme çalışıyor |
| 6.3 | Frontend: Bildirim paneli (Topbar 🔔) — React Query ile 30 saniyede bir polling | `FRONTEND.md` §4.4 dropdown kurallarına uygun |
| 6.4 | Frontend: Okunmamış sayısı badge'i | Topbar ikonunda doğru sayı görünüyor |

**Faz 6 Çıkış Kriteri:** Kullanıcı görev atandığında veya yorum geldiğinde bildirim görüyor (gerçek zamanlı değil ama çalışıyor).

---

## Faz 7 — Yetki Sistemi (Rol Katmanlarının Eklenmesi)

**Hedef:** Şimdiye kadar "her giriş yapan kullanıcı her şeyi yapabiliyordu" varsayımı kaldırılır; gerçek rol bazlı kısıtlamalar eklenir. Bu fazın geç gelmesi bilinçli: önce akışların doğru çalıştığından emin olunur, sonra üzerine kısıtlama eklenir.

| # | Görev | Doğrulama |
|---|---|---|
| 7.1 | Backend: Rol bazlı yetki middleware (`requireRole(['admin', 'companyAdmin'])`) | `PROJECT.md` §2 tam yetki matrisine göre her endpoint'e uygulanıyor |
| 7.2 | Backend: Faz 4-5'teki tüm endpoint'lere yetki middleware'i geri dönüp ekleniyor | Üye, görev oluşturma denediğinde 403 alıyor (CLAUDE.md §4 doğrulama checklist'i) |
| 7.3 | Backend: `PATCH /tasks/:id/status` → sahip OR admin kontrolü; `PATCH /tasks/:id/priority` → yalnızca admin | İkisi ayrı test senaryosuyla doğrulanıyor |
| 7.4 | Backend: `/permissions` endpoint'leri — `GET /company/users`, `PATCH /users/:id/role` | Şirket Admini kendi rolünü değiştiremiyor (kilitli) |
| 7.5 | Backend: `/company/settings` endpoint'leri — şirket profili güncelleme, davet (e-posta + user_id) | Davet sonrası `invitations` tablosuna satır düşüyor |
| 7.6 | Frontend: Yetkiye bağlı UI elemanlarının koşullu render'ı (`+ Görev Ekle`, `Çıkar` vb.) | Üye girişinde admin butonları hiç görünmüyor |
| 7.7 | Frontend: `/permissions` sayfası | Rol dropdown + kaydet akışı çalışıyor |
| 7.8 | Frontend: `/company/settings` sayfası | Logo yükleme (max 25MB, jpg/png/webp — PROJECT.md §7.8) çalışıyor |
| 7.9 | Frontend: Profil Dropdown'da şartlı menü öğeleri (Şirket Oluştur / Şirket Ayarları / Yetkiler) | Şirketsiz kullanıcıda doğru, Admin'de doğru görünüyor |

**Faz 7 Çıkış Kriteri:** CLAUDE.md §4'teki doğrulama checklist'inin tüm satırları manuel test edilip geçiyor. Üç rol de gerçek davranış farkı gösteriyor.

---

## Faz 8 — Mesajlaşma (REST Versiyonu, WebSocket Olmadan)

**Hedef:** Chat sayfası ve floating widget; önce REST polling ile, gerçek zamanlılık olmadan.

| # | Görev | Doğrulama |
|---|---|---|
| 8.1 | Backend: `POST /channels` (yalnızca admin rolleri), `GET /channels` | Kanal oluşturma yetki kontrolü doğru |
| 8.2 | Backend: `POST /messages` (DM veya kanal), `GET /messages?channelId=` veya `?dmUserId=` | Mesaj geçmişi doğru sıralı dönüyor |
| 8.3 | Backend: Mesaj okundu durumu (`read_at` alanı) | Okundu işaretleme endpoint'i çalışıyor |
| 8.4 | Frontend: `/chat/:id` sayfası — sol sohbet listesi + sağ mesaj alanı | `FRONTEND.md` §2 sıkı/ferah kurallarına uygun |
| 8.5 | Frontend: Floating Chat Widget — kapalı/açık state (Zustand), `/chat/:id` dışında görünür | `FRONTEND.md` §3 animasyon kurallarına uygun (slide-up) |
| 8.6 | Frontend: Sidebar "💬 Mesajlar" linki, Görev Detay'daki "Mesaj At" butonları widget'ı tetikliyor | Doğru kullanıcıyla DM açılıyor |
| 8.7 | Frontend: Okundu bilgisi göstergesi (✓ / ✓✓) | PROJECT.md §9 madde 13'e uygun |

**Faz 8 Çıkış Kriteri:** Kullanıcılar birbirine mesaj gönderebiliyor, kanal ve DM ayrımı çalışıyor — ama sayfa yenilemeden yeni mesaj görünmüyor (bu normal, Faz 9'da çözülecek).

---

## Faz 9 — Gerçek Zamanlılık (WebSocket)

**Hedef:** Faz 6 (bildirim) ve Faz 8'i (mesajlaşma) polling'den gerçek zamanlıya yükseltmek. En son gelmesi bilinçli: REST üzerinde her şey çalıştığı kanıtlandıktan sonra üzerine WebSocket eklemek, debug yapılabilirliği çok artırır.

| # | Görev | Doğrulama |
|---|---|---|
| 9.1 | Backend: `ws` kütüphanesi ile WebSocket sunucusu, JWT ile bağlantı doğrulama | Bağlantı kurulurken token kontrolü yapılıyor |
| 9.2 | Backend: Mesaj gönderince ilgili kullanıcıya WebSocket event'i push | İki tarayıcı sekmesinde anlık mesaj görünüyor |
| 9.3 | Backend: Bildirim oluşunca WebSocket event'i push | Bildirim polling'e gerek kalmadan anlık geliyor |
| 9.4 | Backend: Kanban kart durumu değişince diğer açık sekmelere event push (opsiyonel ama PROJECT.md'de belirtilmiş) | İki sekmede kanban senkron kalıyor |
| 9.5 | Frontend: WebSocket client kurulumu, reconnect mantığı | Bağlantı kesilince otomatik yeniden bağlanıyor |
| 9.6 | Frontend: Bildirim paneli polling'den WebSocket dinleyicisine geçiriliyor | Faz 6'daki polling kodu kaldırılıyor |
| 9.7 | Frontend: Chat sayfası ve widget WebSocket dinleyicisine geçiriliyor | Mesaj anlık görünüyor, okundu durumu anlık güncelleniyor |

**Faz 9 Çıkış Kriteri:** Hiçbir sayfa yenilemeden bildirim ve mesaj anlık geliyor; bağlantı kesintisi sorunsuz iyileşiyor.

---

## Faz 10 — Landing Page ve Genel Cila

**Hedef:** Halka açık yüz ve ürün genelinde son rötuşlar. Bilinçli olarak sona bırakıldı çünkü asıl ürün mantığı kanıtlanmadan pazarlama sayfasına zaman harcamak verimsiz.

| # | Görev | Doğrulama |
|---|---|---|
| 10.1 | Frontend: `/` landing page (Hero, Özellikler, Nasıl Çalışır, CTA, Footer) | PROJECT.md §4.1 yapısına uygun |
| 10.2 | Frontend: Tüm sayfalarda loading skeleton'lar (spinner yerine) | `FRONTEND.md` §3 — dekoratif loading animasyonu yasak kuralına uygun |
| 10.3 | Frontend: Boş durum (empty state) tasarımları — görev yok, takım yok, mesaj yok | "Empty state davetkâr olmalı" prensibi uygulanmış |
| 10.4 | Frontend: Hata sayfaları (404, 403, genel hata) | Kullanıcı dostu, yönlendirici mesajlar |
| 10.5 | Erişilebilirlik geçişi: `FRONTEND.md` §5 tüm maddeleri tek tek kontrol | Klavye-only navigasyon ile tüm akış tamamlanabiliyor |
| 10.6 | Responsive geçişi: `FRONTEND.md` §6 tüm breakpoint'ler manuel test | Mobil, tablet, masaüstü üçünde de kullanılabilir |

**Faz 10 Çıkış Kriteri:** Ürün dışarıya gösterilebilir, yeni bir kullanıcı landing page'den kayıt olup tüm akışı sorunsuz tamamlayabiliyor.

---

## Faz 11 — Test Sıkılaştırma ve Production Hazırlığı

**Hedef:** PROJECT.md §7.10'daki test coverage hedeflerine ulaşmak ve production'a güvenle çıkmak.

| # | Görev | Doğrulama |
|---|---|---|
| 11.1 | Backend: Auth + yetki middleware + tenant izolasyonu testleri (Supertest) | PROJECT.md §7.10'daki 7 zorunlu senaryo geçiyor |
| 11.2 | Backend: Görev CRUD + rate limit + dosya yükleme testleri | %70+ coverage hedefine yaklaşılıyor |
| 11.3 | Frontend: Yetki bazlı render + form validasyon testleri (Vitest + Testing Library) | %50+ coverage hedefine yaklaşılıyor |
| 11.4 | E2E: Playwright ile 4 kritik akış (PROJECT.md §7.10) | Kayıt→dashboard, davet, görev akışı, mesajlaşma senaryoları geçiyor |
| 11.5 | Production ortam değişkenleri gözden geçirme, secret rotation | `.env` production değerleri ayrı ve güvenli |
| 11.6 | Monitoring/log temel kurulumu (en azından hata logu) | Production hatası fark edilebiliyor |

**Faz 11 Çıkış Kriteri:** Test suite yeşil, production deploy güvenle yapılabiliyor.

---

## Roadmap Sonrası — Bilinçli Olarak Dışarıda Tutulanlar

Aşağıdakiler bu roadmap'in kapsamı dışında; `PROJECT.md` §7.9 ve §8'de "ileride" olarak işaretli, bu yüzden roadmap'e dahil edilmedi:

- E-posta servisi entegrasyonu (Resend/SendGrid)
- Subdomain bazlı multi-tenant routing
- Native mobil uygulama
- Kanban kolon özelleştirme

---

## Faz Takip Tablosu

| Faz | Konu | Durum |
|---|---|---|
| 0 | Proje Temeli ve Altyapı | ⬜ Başlanmadı |
| 1 | Veritabanı Şeması ve Tenant Temeli | ⬜ Başlanmadı |
| 2 | Auth ve Kayıt Akışı | ⬜ Başlanmadı |
| 3 | Temel Layout ve Navigasyon | ⬜ Başlanmadı |
| 4 | Takımlar (Tek Rol Varsayımıyla) | ⬜ Başlanmadı |
| 5 | Görevler ve Kanban | ⬜ Başlanmadı |
| 6 | Bildirimler (Polling) | ⬜ Başlanmadı |
| 7 | Yetki Sistemi | ⬜ Başlanmadı |
| 8 | Mesajlaşma (REST) | ⬜ Başlanmadı |
| 9 | Gerçek Zamanlılık (WebSocket) | ⬜ Başlanmadı |
| 10 | Landing Page ve Cila | ⬜ Başlanmadı |
| 11 | Test Sıkılaştırma | ⬜ Başlanmadı |

> Her faz bitince bu tabloda durumu güncelle: ⬜ Başlanmadı → 🟡 Devam Ediyor → ✅ Tamamlandı.

---

*Bu doküman `PROJECT.md`, `FRONTEND.md` ve `CLAUDE.md` ile birlikte yaşar. Roadmap'te bir faz değişirse (atlanır, sıralama değişir vb.) burası güncellenmeli.*
