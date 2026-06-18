# TaskFlow — Design Document v0.6

> Multi-tenant SaaS görev yönetimi uygulaması  
> Durum: Taslak · Versiyon: 0.6 · Son güncelleme: Haziran 2026

---

## İçindekiler

1. [Genel Bakış](#1-genel-bakış)
2. [Kullanıcı Rolleri ve Yetki Matrisi](#2-kullanıcı-rolleri-ve-yetki-matrisi)
3. [Uygulama Mimarisi ve Sayfa Yapısı](#3-uygulama-mimarisi-ve-sayfa-yapısı)
4. [Sayfalar ve Bileşenler](#4-sayfalar-ve-bileşenler)
   - 4.1 [Landing Page](#41-landing-page)
   - 4.2 [Kayıt ve Şirket Kurulum Akışı](#42-kayıt-ve-şirket-kurulum-akışı)
   - 4.3 [Ana Pano — Kanban](#43-ana-pano--kanban)
   - 4.4 [Takımlarım — /teams](#44-takımlarım----teams)
   - 4.5 [Takım Detay — /teams/:id](#45-takım-detay----teamsid)
   - 4.6 [Görevlerim — /tasks](#46-görevlerim----tasks)
   - 4.7 [Görev Detay — /tasks/:id](#47-görev-detay----tasksid)
   - 4.8 [Mesajlaşma — /chat/:id](#48-mesajlaşma----chatid)
   - 4.9 [Profil — /profile](#49-profil----profile)
   - 4.10 [Yetkiler — /permissions](#410-yetkiler----permissions)
   - 4.11 [Şirket Ayarları — /company/settings](#411-şirket-ayarları----companysettings)
5. [Global UI Bileşenleri](#5-global-ui-bileşenleri)
   - 5.1 [Sol Kenar Çubuğu (Sidebar)](#51-sol-kenar-çubuğu-sidebar)
   - 5.2 [Üst Navigasyon (Topbar)](#52-üst-navigasyon-topbar)
   - 5.3 [Görev Kartı](#53-görev-kartı)
   - 5.4 [Bildirim Paneli](#54-bildirim-paneli)
   - 5.5 [Profil Dropdown](#55-profil-dropdown)
   - 5.6 [Floating Chat Widget](#56-floating-chat-widget)
6. [Tasarım Dili](#6-tasarım-dili)
   - 6.1 [Renk Sistemi](#61-renk-sistemi)
   - 6.2 [Tipografi](#62-tipografi)
   - 6.3 [Spacing ve Radius](#63-spacing-ve-radius)
   - 6.4 [Gölge](#64-gölge)
7. [Teknoloji Stack'i](#7-teknoloji-stacki)
   - 7.1 [Frontend](#71-frontend)
   - 7.2 [Backend](#72-backend)
   - 7.3 [Veritabanı — Supabase](#73-veritabanı--supabase-postgresql)
   - 7.4 [Cache & Gerçek Zamanlı — Redis](#74-cache--gerçek-zamanlı--redis)
   - 7.5 [Deploy ve Altyapı](#75-deploy-ve-altyapı)
   - 7.6 [Geliştirme Araçları](#76-geliştirme-araçları)
   - 7.7 [API Rate Limiting](#77-api-rate-limiting)
   - 7.8 [Dosya Yükleme Kuralları](#78-dosya-yükleme-kuralları)
   - 7.9 [E-posta Servisi](#79-e-posta-servisi)
   - 7.10 [Test Coverage Hedefleri](#710-test-coverage-hedefleri)
8. [Multi-Tenant Mimarisi](#8-multi-tenant-mimarisi)
9. [İş Kuralları Özeti](#9-i̇ş-kuralları-özeti)

---

## 1. Genel Bakış

TaskFlow, birden fazla şirketin bağımsız olarak kullanabildiği (multi-tenant) bir görev ve ekip yönetimi SaaS uygulamasıdır. Her şirket kendi izole tenant'ına sahiptir; kullanıcılar, takımlar ve görevler tenant sınırları içinde kalır. Bir kullanıcı yalnızca tek bir şirkete dahil olabilir.

### Temel Değer Önerileri

- Kanban panosu ile görsel görev takibi (Yapılacak → Yapılıyor → Yapıldı)
- Takım bazlı organizasyon ve iletişim (DM + kanal mesajlaşması)
- Rol tabanlı yetki yönetimi (Şirket Admini → Takım Admini → Üye)
- Uygulama içi gerçek zamanlı bildirim sistemi (WebSocket)

### Kullanıcı Akışı (Üst Düzey)

```
Landing Page
    │
    ├── Kayıt Ol
    │       ├── [Opsiyonel] Şirket adı gir → Şirket Admini olarak /dashboard
    │       └── Şirket adı girme → Şirketsiz hesap → /dashboard
    │                                   │
    │                                   ├── Profil Dropdown → "Şirket Oluştur"
    │                                   └── Davet linki / user_id ile şirkete katıl
    │
    └── Giriş Yap → /dashboard (Kanban)
                        │
                        ├── /teams  →  /teams/:id
                        ├── /tasks  →  /tasks/:id
                        ├── /chat/:id
                        ├── /profile
                        ├── /permissions        (yalnızca Şirket Admini)
                        └── /company/settings   (yalnızca Şirket Admini)
```

---

## 2. Kullanıcı Rolleri ve Yetki Matrisi

| Yetki | Üye | Takım Admini | Şirket Admini |
|---|---|---|---|
| Görev görüntüleme | ✅ kendi takımları | ✅ yönettiği takımlar | ✅ tüm şirket |
| Görev oluşturma | ❌ | ✅ | ✅ |
| Görev atama | ❌ | ✅ | ✅ |
| Görev durumu güncelleme (Yapılacak/Yapılıyor/Yapıldı) | ✅ yalnızca kendi görevi | ✅ | ✅ |
| Görev önceliği güncelleme | ❌ | ✅ | ✅ |
| Görev silme | ❌ | ✅ | ✅ |
| Kanban kartı taşıma | ✅ yalnızca kendi görevi | ✅ tüm kartlar | ✅ tüm kartlar |
| Takım üyesi ekleme | ❌ | ✅ | ✅ |
| Takım üyesi çıkarma | ❌ | ✅ | ✅ |
| Takım oluşturma | ❌ | ❌ | ✅ |
| Kanal oluşturma | ❌ | ✅ | ✅ |
| Kullanıcı rolü güncelleme | ❌ | ❌ | ✅ |
| Yetkiler sayfası | ❌ | ❌ | ✅ |
| Şirket ayarları | ❌ | ❌ | ✅ |
| Profil güncelleme | ✅ | ✅ | ✅ |

> Takım Admini yetkisi yalnızca atandığı takım kapsamında geçerlidir.

---

## 3. Uygulama Mimarisi ve Sayfa Yapısı

### Layout Şeması

```
┌──────────────────────────────────────────────────────────────┐
│                        TOPBAR (sabit)                        │
├─────────────┬────────────────────────────────────────────────┤
│             │                                           │💬│  │
│   SIDEBAR   │          İÇERİK ALANI (değişen)           └─┘  │
│   (sabit)   │                                  (sağ alt köşe)│
│             │                                                 │
└─────────────┴────────────────────────────────────────────────┘
```

- **Topbar** ve **Sidebar** tüm sayfalarda sabittir.
- **Floating Chat Widget** (`💬`) sağ alt köşede sabit durur; `/chat/:id` sayfasında gizlenir.
- Sidebar genişliği: 260px (masaüstü), mobilde hamburger menüye dönüşür.

### Route Haritası

| Yol | Sayfa | Erişim |
|---|---|---|
| `/` | Landing Page | Herkese açık |
| `/login` | Giriş | Herkese açık |
| `/register` | Kayıt | Herkese açık |
| `/dashboard` | Ana Pano (Kanban) | Giriş gerekli |
| `/teams` | Takımlarım | Giriş gerekli |
| `/teams/:id` | Takım Detay | Giriş + takım üyesi |
| `/tasks` | Görevlerim | Giriş gerekli |
| `/tasks/:id` | Görev Detay | Giriş + ilgili kullanıcı |
| `/chat/:id` | Mesajlaşma | Giriş gerekli |
| `/profile` | Profil | Giriş gerekli |
| `/permissions` | Yetkiler | Yalnızca Şirket Admini |
| `/company/settings` | Şirket Ayarları | Yalnızca Şirket Admini |

---

## 4. Sayfalar ve Bileşenler

### 4.1 Landing Page

**Bölümler (yukarıdan aşağı):**

```
┌─────────────────────────────────────────────┐
│  NAV: Logo | Özellikler | Fiyatlandırma     │
│             [Giriş Yap] [Ücretsiz Başla]    │
├─────────────────────────────────────────────┤
│  HERO                                       │
│  Başlık + alt başlık + CTA                  │
│  Sağda: uygulama ekran görüntüsü            │
├─────────────────────────────────────────────┤
│  ÖZELLİKLER  (3 kart)                       │
│  Kanban | Mesajlaşma | Yetki Yönetimi       │
├─────────────────────────────────────────────┤
│  NASIL ÇALIŞIR  (adım adım)                 │
├─────────────────────────────────────────────┤
│  CTA BANDI                                  │
├─────────────────────────────────────────────┤
│  FOOTER                                     │
└─────────────────────────────────────────────┘
```

---

### 4.2 Kayıt ve Şirket Kurulum Akışı

#### `/register` — Hesap Bilgileri

```
┌─────────────────────────────────────────────┐
│  Ad Soyad        [________________]         │
│  E-posta         [________________]         │
│  Şifre           [________________]         │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ 🏢 Şirket adı (opsiyonel)           │    │
│  │  [________________________________] │    │
│  │  Benzersiz olmalıdır.               │    │
│  │  Boş bırakırsan sonradan            │    │
│  │  oluşturabilir ya da davete          │    │
│  │  katılabilirsin.                    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [Hesap Oluştur]                            │
└─────────────────────────────────────────────┘
```

**Kurallar:**
- Her kullanıcıya benzersiz bir `user_id` atanır (`#TF-XXXXX` formatı); `/profile`'dan görüntülenip kopyalanabilir.
- Şirket adı girilirse → benzersizlik kontrolü → kullanıcı `Şirket Admini` olarak yeni tenant'a bağlanır.
- Şirket adı girilmezse → şirketsiz hesapla `/dashboard`'a yönlendirilir.
- Bir kullanıcı yalnızca tek bir şirkette olabilir.

#### Şirketsiz Kullanıcı İçin İki Seçenek

1. **Şirket Oluştur:** Profil Dropdown → "Şirket Oluştur" → ad gir → `Şirket Admini` ol.
2. **Davete Katıl:** Şirket Admini'nin gönderdiği davet linki veya `user_id` ile şirkete eklenme.

> Bir şirkete dahil olan kullanıcı artık "Şirket Oluştur" seçeneğini göremez.

---

### 4.3 Ana Pano — Kanban `/dashboard`

```
┌─────────────┬────────────────────────────────────────────────┐
│   SIDEBAR   │  UX Takımı                    [+ Görev Ekle*]  │
│             ├───────────────┬───────────────┬────────────────┤
│  🏷 UX   ▼  │  YAPILACAK    │  YAPILIYOR    │   YAPILDI      │
│  ─────────  │               │               │                │
│  👤 Ali     │  [Kart]       │  [Kart]       │  [Kart]        │
│  👤 Selin   │  [Kart]       │               │                │
│  👤 Mert    │               │               │                │
│             │               │               │                │
│  💬 Mesajlar│               │               │                │
└─────────────┴───────────────┴───────────────┴────────────────┘
                                                       [💬] sağ alt
```

`[+ Görev Ekle]` → yalnızca Takım Admini ve Şirket Admini.

**Kolonlar (sabit, özelleştirilemeyen):**
- **Yapılacak** — başlanmamış görevler
- **Yapılıyor** — devam eden görevler
- **Yapıldı** — tamamlananlar; deadline geçince otomatik arşive taşınır

**Sürükle-Bırak Kuralları:**
- Üye → yalnızca kendi görevini taşıyabilir
- Takım Admini / Şirket Admini → tüm kartları taşıyabilir
- Hedef kolon sürükleme sırasında vurgulanır
- Bırakma sonrası kart yerleşme animasyonu gösterir

---

### 4.4 Takımlarım — `/teams`

```
┌─────────────┬────────────────────────────────────────────────┐
│   SIDEBAR   │  Takımlarım                    [+ Yeni Takım*] │
│             │  ──────────────────────────────────────────    │
│             │  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│             │  │ 🏷 UX    │  │🏷 Backend│  │🏷 Pazarlama│    │
│             │  │ 5 üye    │  │ 8 üye    │  │ 3 üye    │     │
│             │  │ 12 görev │  │ 24 görev │  │ 7 görev  │     │
│             │  └──────────┘  └──────────┘  └──────────┘     │
└─────────────┴────────────────────────────────────────────────┘
```

- Karta tıklamak → `/teams/:id`
- `[+ Yeni Takım]` → yalnızca Şirket Admini

---

### 4.5 Takım Detay — `/teams/:id`

```
┌─────────────┬────────────────────────────────────────────────┐
│   SIDEBAR   │  ← Takımlarım / UX Takımı                      │
│             │  ─────────────────────────────────────────     │
│             │  ÜYELER                        [+ Üye Ekle*]   │
│             │  ┌──────────────────────────────────────────┐  │
│             │  │ 👤 Ali Yılmaz  Takım Admini   [Çıkar*]  │  │
│             │  │ 👤 Selin Demir Üye             [Çıkar*]  │  │
│             │  └──────────────────────────────────────────┘  │
│             │                                                │
│             │  GÖREVLER                      [+ Görev Ata*]  │
│             │  ┌──────────────────────────────────────────┐  │
│             │  │ [Görev Kartı]  [Görev Kartı]             │  │
│             │  └──────────────────────────────────────────┘  │
└─────────────┴────────────────────────────────────────────────┘
```

- `[+ Üye Ekle]`, `[Çıkar]`, `[+ Görev Ata]` → Takım Admini ve Şirket Admini
- Üye ekleme: `user_id` (#TF-XXXXX) veya e-posta ile arama

---

### 4.6 Görevlerim — `/tasks`

```
┌─────────────┬────────────────────────────────────────────────┐
│   SIDEBAR   │  Görevlerim                                    │
│             │  [Durum ▼]  [Öncelik ▼]  [Takım ▼]  [Tarih ▼]│
│             │  ──────────────────────────────────────────    │
│             │  │ 🔴 Yüksek · Login sayfası düzelt           │
│             │  │ Takım: UX · Son: 16 Haz · Yapılıyor        │
│             │  ├──────────────────────────────────────────   │
│             │  │ 🟡 Orta   · API entegrasyonu               │
│             │  │ Takım: Backend · Son: 20 Haz · Yapılacak   │
│             │  ├──────────────────────────────────────────   │
│             │  │ 🟢 Düşük  · README güncelle                │
│             │  │ Takım: Backend · Son: 30 Haz · Arşiv       │
└─────────────┴────────────────────────────────────────────────┘
```

**Filtre Seçenekleri:**
- **Durum:** Yapılacak / Yapılıyor / Yapıldı / Arşiv / Tümü
- **Öncelik:** Düşük / Orta / Yüksek
- **Takım:** Kullanıcının dahil olduğu takımlar
- **Tarih:** Bu hafta / Bu ay / Özel aralık

**Admin Görünümü:**
- Takım Admini → kendi takımındaki tüm görevler
- Şirket Admini → tüm şirket görevleri, tüm takım filtreleri

Satıra tıklamak → `/tasks/:id`

---

### 4.7 Görev Detay — `/tasks/:id`

```
┌─────────────┬────────────────────────────────────────────────┐
│   SIDEBAR   │  ← Görevlerim / Login sayfası düzelt           │
│             │  ─────────────────────────────────────────     │
│             │  BAŞLIK: Login sayfası düzelt                  │
│             │  Durum: [Yapılıyor ▼]   Öncelik: [Yüksek ▼]   │
│             │  Son Tarih: 16 Haziran 2026                    │
│             │                                                │
│             │  Görevi Veren:  👤 Ali Yılmaz   [💬 Mesaj At] │
│             │  Görevi Alan:   👤 Selin Demir  [💬 Mesaj At] │
│             │                                                │
│             │  AÇIKLAMA                                      │
│             │  [Açıklama metni...]                           │
│             │                                                │
│             │  YORUMLAR                                      │
│             │  ─────────────────────────────────────────     │
│             │  👤 Ali:   "Mobil kısmına da bak"   14 Haz    │
│             │  👤 Selin: "Tamam, bakıyorum"        14 Haz    │
│             │                                                │
│             │  [Yorum yaz...                ]   [Gönder]    │
└─────────────┴────────────────────────────────────────────────┘
```

**Kurallar:**
- **Durum güncelleme** (Yapılacak / Yapılıyor / Yapıldı) → görevi atanan kişi (görevin sahibi), Takım Admini ve Şirket Admini yapabilir.
- **Öncelik güncelleme** → yalnızca Takım Admini ve Şirket Admini yapabilir.
- `[💬 Mesaj At]` → Floating Chat Widget açılır, ilgili kişiyle DM başlar.
- Yorum eklemek tüm ilgili kullanıcılara bildirim gönderir.
- Deadline geçmiş ve görev "Yapıldı" durumundaysa → otomatik olarak arşive alınır.

---

### 4.8 Mesajlaşma — `/chat/:id`

```
┌─────────────┬──────────────────────────────────────────────────┐
│   SIDEBAR   │ ┌────────────────┬─────────────────────────────┐ │
│   (normal)  │ │ SOHBET LİSTESİ │ MESAJ ALANI                 │ │
│             │ │                │                             │ │
│             │ │ KANALLAR       │  💬 Selin Demir             │ │
│             │ │ # genel        │  ───────────────────────    │ │
│             │ │ # tasarim      │  Bugün                      │ │
│             │ │ [+ Kanal*]     │  Selin: Tamam hallederim    │ │
│             │ │                │  Sen:   Teşekkürler  ✓✓     │ │
│             │ │ DM             │                             │ │
│             │ │ 👤 Selin  🔴  │  ───────────────────────    │ │
│             │ │ 👤 Mert        │  [Mesaj yaz...  ]  [→]     │ │
│             │ │ 👤 Ali         │                             │ │
│             │ └────────────────┴─────────────────────────────┘ │
└─────────────┴──────────────────────────────────────────────────┘
   (Floating Chat Widget bu sayfada GİZLİDİR)
```

**URL Yapısı:**
- `/chat/dm-:userId` → bire bir DM
- `/chat/channel-:channelId` → takım kanalı

**Sohbet Listesi Paneli:**
- Kanallar (`#`) ve DM listesi birlikte gösterilir
- `[+ Kanal]` → yalnızca Takım Admini ve Şirket Admini
- Okunmamış mesajlar kırmızı badge ile işaretlenir

**Mesaj Alanı:**
- Kendi mesajın sağda, karşı taraf solda
- Okundu bilgisi: tek `✓` iletildi, çift `✓✓` okundu
- Enter ile gönder, Shift+Enter ile yeni satır

---

### 4.9 Profil — `/profile`

```
┌─────────────┬────────────────────────────────────────────────┐
│   SIDEBAR   │  Profil                                        │
│             │  ─────────────────────────────────────────     │
│             │  [Profil Fotoğrafı]   [Değiştir]              │
│             │                                                │
│             │  Kullanıcı ID:  #TF-A3X9K2   📋               │
│             │  (Şirkete eklenirken bu ID kullanılır)         │
│             │                                                │
│             │  Ad Soyad   [Ali Yılmaz         ]             │
│             │  E-posta    [ali@ornek.com       ]             │
│             │  Şifre      [Şifreyi Değiştir   ]             │
│             │                                                │
│             │  BİLDİRİM TERCİHLERİ                          │
│             │  ☑ Görev atandığında                           │
│             │  ☑ Yorum geldiğinde                            │
│             │  ☑ Mesaj geldiğinde                            │
│             │                                                │
│             │  [Değişiklikleri Kaydet]                       │
└─────────────┴────────────────────────────────────────────────┘
```

- `user_id` kopyalanabilir (📋 ikonu).
- Bildirim tercihleri kullanıcı bazında kaydedilir.

---

### 4.10 Yetkiler — `/permissions`

**Erişim:** Yalnızca Profil Dropdown → "Yetkiler".

```
┌─────────────┬────────────────────────────────────────────────┐
│   SIDEBAR   │  Yetkiler                  [🔍 Kullanıcı Ara]  │
│             │  ─────────────────────────────────────────     │
│             │  ┌──────────────────────────────────────────┐  │
│             │  │ Kullanıcı        Rol               İşlem │  │
│             │  ├──────────────────────────────────────────┤  │
│             │  │ Ali Yılmaz  [Şirket Admini ▼]      [✓]  │  │
│             │  │ Selin Demir [Takım Admini  ▼]      [✓]  │  │
│             │  │ Mert Kaya   [Üye           ▼]      [✓]  │  │
│             │  └──────────────────────────────────────────┘  │
└─────────────┴────────────────────────────────────────────────┘
```

- Şirket Admini kendi rolünü değiştiremez (satır kilitli).
- Rol değişikliği anında uygulanır.

---

### 4.11 Şirket Ayarları — `/company/settings`

**Erişim:** Yalnızca Profil Dropdown → "Şirket Ayarları".

```
┌─────────────┬────────────────────────────────────────────────┐
│   SIDEBAR   │  Şirket Ayarları                               │
│             │  ─────────────────────────────────────────     │
│             │  ŞİRKET PROFİLİ                                │
│             │  [Şirket Logosu]   [Değiştir]                 │
│             │  Şirket Adı    [Acme Corp.         ]          │
│             │  Açıklama      [Yazılım şirketi... ]          │
│             │  [Kaydet]                                      │
│             │                                                │
│             │  ─────────────────────────────────────────     │
│             │  KULLANICI DAVET ET                            │
│             │  E-posta: [ornek@mail.com ] [Davet Gönder]    │
│             │  ID ile:  [#TF-A3X9K2    ] [Ekle]             │
│             │                                                │
│             │  Bekleyen Davetler                             │
│             │  selin@ornek.com  Gönderildi: 13 Haz [İptal] │
└─────────────┴────────────────────────────────────────────────┘
```

**Davet Yöntemleri:**
1. **E-posta:** Kayıtlı/kayıtsız kullanıcıya davet maili.
2. **user_id:** Sistemde hesabı olan kullanıcı direkt eklenir.

---

## 5. Global UI Bileşenleri

### 5.1 Sol Kenar Çubuğu (Sidebar)

```
┌──────────────────────┐
│  [Şirket Logosu]     │
│  Şirket Adı          │
├──────────────────────┤
│  🏷 UX Takımı    ▼  │  ← Takım seçici
├──────────────────────┤
│  ÜYELER              │
│  👤 Ali              │
│  👤 Selin            │
│  👤 Mert             │
├──────────────────────┤
│  💬 Mesajlar →       │  ← /chat/:id'ye yönlendirir
└──────────────────────┘
```

- Üye ismine tıklamak → Floating Chat Widget açılır, DM başlar.
- "💬 Mesajlar" → `/chat/:id` tam ekran sayfası.
- Takım seçicide farklı takım seçilince kanban ve üye listesi güncellenir.

---

### 5.2 Üst Navigasyon (Topbar)

```
┌──────────────────────────────────────────────────────────────────┐
│  [Logo]  Dashboard   Teams   Tasks                  🔔  🌙  [👤▼]│
└──────────────────────────────────────────────────────────────────┘
```

| Alan | Route | Detay |
|---|---|---|
| Logo | `/dashboard` | Ana Pano |
| Dashboard | `/dashboard` | Kanban |
| Teams | `/teams` | Takımlarım |
| Tasks | `/tasks` | Görevlerim |
| 🔔 | — | Bildirim paneli (okunmamış badge) |
| 🌙 | — | Dark / Light tema toggle |
| 👤 ▼ | — | Profil dropdown |

---

### 5.3 Görev Kartı

```
┌───────────────────────────────────┐
│ 🔴 Yüksek                   · · ·│
│ Login sayfası düzelt              │
│ Mobil tarafta hata var...         │
│                                   │
│ 📅 16 Haz              👤 Selin  │
└───────────────────────────────────┘
```

- 🔴 Yüksek → kırmızı sol kenar
- 🟡 Orta → sarı sol kenar
- 🟢 Düşük → yeşil sol kenar

**Etkileşimler:**
- Karta tıkla → `/tasks/:id`
- Sürükle → kolon değiştir (yetki kuralları geçerli)
- `· · ·` → Düzenle / Sil (yalnızca Takım Admini ve Şirket Admini)

---

### 5.4 Bildirim Paneli

Topbar 🔔 ikonuna tıklanınca açılır.

| Olay | Örnek Metin |
|---|---|
| Görev atandı | "Ali Yılmaz sana yeni bir görev atadı: Login sayfası düzelt" |
| Yorum yapıldı | "Selin Demir göreve yorum ekledi" |
| Mesaj alındı | "Mert Kaya sana mesaj gönderdi" |

- Bildirime tıklamak → ilgili görev veya mesaja yönlendirir.
- "Tümünü okundu işaretle" toplu aksiyon.
- Gerçek zamanlı güncelleme: WebSocket.

---

### 5.5 Profil Dropdown

```
┌──────────────────────────────┐
│  👤 Ali Yılmaz               │
│  ali@sirket.com              │
├──────────────────────────────┤
│  Profil          /profile    │
│  Şirket Oluştur*             │  ← yalnızca şirketsiz kullanıcı
│  Şirket Ayarları**           │  ← yalnızca Şirket Admini
│  Yetkiler**                  │  ← yalnızca Şirket Admini
├──────────────────────────────┤
│  Oturumu Kapat               │
└──────────────────────────────┘
```

`*` Şirketsiz → "Şirket Oluştur" görünür.  
`**` Şirket Admini → "Şirket Ayarları" + "Yetkiler" görünür; "Şirket Oluştur" gizlenir.

---

### 5.6 Floating Chat Widget

Sağ alt köşede sabit; `/chat/:id` dışındaki tüm sayfalarda görünür.

```
                         ┌─────────────────────────────┐
                         │  💬 Selin Demir         [×] │  ← Açık
                         │  ─────────────────────────  │
                         │  Selin: Tamam hallederim    │
                         │  Sen:   Teşekkürler   ✓✓   │
                         │  ─────────────────────────  │
                         │  [Mesaj yaz...  ]  [→]     │
                         │  [↗ Tam Ekran]              │
                         └─────────────────────────────┘
                                              [💬 2]    ← Kapalı (okunmamış badge)
```

**Davranış:**
- **Kapalı:** Sağ alt köşede `[💬]` ikonu; okunmamış mesaj sayısı badge'i.
- **Açılış:** Yukarı doğru kayarak açılır (animasyonlu).
- **Tek pencere:** Aynı anda yalnızca son sohbet görünür.
- **Tetikleyiciler:** Sidebar'da üye ismi, `/tasks/:id`'de "Mesaj At", bildirim tıklaması.
- **Tam ekran:** "↗ Tam Ekran" → `/chat/:id`'ye yönlendirir, widget kapanır.
- **`/chat/:id` sayfasında:** Widget tamamen gizlenir.
- **Okundu bilgisi:** `✓` iletildi, `✓✓` okundu.

---

## 6. Tasarım Dili

### 6.1 Renk Sistemi

Uygulama **dark-first** tasarlanmıştır. Tüm token değerleri aşağıda tanımlıdır.

```css
/* === MARKA === */
--color-primary:            #f59e0b;   /* Amber — CTA, aktif link, vurgu */
--color-primary-hover:      #d97706;   /* Amber koyu — hover hali */
--color-ring:               #f59e0b;   /* Focus ring */

/* === YÜZEYLER === */
--color-background:         #171717;   /* Sayfa arka planı */
--color-foreground:         #e5e5e5;   /* Ana metin */
--color-card:               #262626;   /* Kart, panel arka planı */
--color-card-foreground:    #e5e5e5;   /* Kart metin */

/* === İKİNCİL === */
--color-secondary:          #262626;
--color-secondary-foreground: #e5e5e5;

/* === SINIR / GİRDİ === */
--color-border:             #404040;
--color-input:              #404040;

/* === ÖNEMLİ DURUMLAR === */
--color-priority-high:      #ef4444;   /* Kırmızı */
--color-priority-medium:    #f59e0b;   /* Amber */
--color-priority-low:       #22c55e;   /* Yeşil */

/* === KOLON AKSANLARI === */
--color-status-todo:        #6b7280;   /* Gri */
--color-status-inprogress:  #f59e0b;   /* Amber */
--color-status-done:        #22c55e;   /* Yeşil */

/* === DARK MODE === */
/* Uygulama dark-first olduğu için yukarıdaki değerler varsayılan dark değerleridir.
   Light mode için :root[data-theme="light"] bloğunda override edilecektir. */
```

---

### 6.2 Tipografi

**Font Ailesi:** Geometric Sans — `Inter` (birincil), `DM Sans` (alternatif fallback).

```css
--font-display: 'Inter', 'DM Sans', sans-serif;
--font-body:    'Inter', 'DM Sans', sans-serif;
--font-ui:      'Inter', 'DM Sans', sans-serif;
--font-mono:    'JetBrains Mono', 'Fira Code', monospace;  /* user_id, kod */

/* === BOYUTLAR === */
--text-xs:   11px;   /* Badge, label */
--text-sm:   13px;   /* Yardımcı metin */
--text-base: 15px;   /* Ana gövde */
--text-lg:   18px;   /* Kart başlığı */
--text-xl:   22px;   /* Sayfa başlığı */
--text-2xl:  28px;   /* Bölüm başlığı */
--text-4xl:  40px;   /* Hero başlık */

/* === AĞIRLIK === */
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;
```

---

### 6.3 Spacing ve Radius

```css
/* === SPACING === */
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-6:  24px;
--space-8:  32px;
--space-12: 48px;
--space-16: 64px;

/* === RADIUS === */
--radius-sm: 4px;    /* Badge, tag */
--radius-md: 8px;    /* Kart, input, buton */
--radius-lg: 12px;   /* Modal, panel */
--radius-xl: 16px;   /* Büyük kart */
--radius-full: 9999px; /* Avatar, pill badge */
```

---

### 6.4 Gölge

```css
--shadow-card:   0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
--shadow-panel:  0 4px 12px rgba(0,0,0,0.5);
--shadow-modal:  0 8px 32px rgba(0,0,0,0.6);
--shadow-widget: 0 6px 20px rgba(0,0,0,0.55);  /* Floating chat widget */
```

---

## 7. Teknoloji Stack'i

### Genel Bakış

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                 │
│   React + Vite  ·  Tailwind CSS  ·  shadcn/ui                  │
│   Zustand (UI state)  ·  React Query (server state)            │
├─────────────────────────────────────────────────────────────────┤
│                         BACKEND                                 │
│   Node.js + Express  ·  WebSocket (ws)  ·  JWT Auth            │
├───────────────────┬─────────────────────────────────────────────┤
│    Supabase       │              Redis                          │
│  PostgreSQL + Auth│  JWT Blacklist · Rate Limit · Session Cache │
└───────────────────┴─────────────────────────────────────────────┘
         ↑ Deploy                              ↑ Deploy
    Vercel (frontend)            Railway / Render (backend + Redis)
```

---

### 7.1 Frontend

| Katman | Teknoloji | Kullanım Amacı |
|---|---|---|
| Framework | **React** (Vite) | UI bileşenleri ve sayfa yapısı |
| Dil | **TypeScript** | Tip güvenliği |
| Stil | **Tailwind CSS** | Token tabanlı utility-first styling |
| Bileşen Kütüphanesi | **shadcn/ui** | Hazır, özelleştirilebilir UI bileşenleri |
| Server State | **React Query (TanStack)** | API cache, refetch, loading/error yönetimi |
| Client State | **Zustand** | UI state (aktif takım, modal, widget durumu) |
| Routing | **React Router v6** | Client-side routing |
| WebSocket | **native WebSocket API** | Gerçek zamanlı bildirim ve mesajlaşma |
| Form | **React Hook Form + Zod** | Form yönetimi ve validasyon |
| Sürükle-Bırak | **dnd-kit** | Kanban kart taşıma |
| HTTP Client | **Axios** | API istekleri |
| Tarih | **date-fns** | Deadline formatı ve hesaplama |

**Zustand vs React Query — Sorumluluk Ayrımı:**

```
React Query → Sunucudan gelen veri
  - Görev listesi, takım üyeleri, bildirimler
  - Otomatik cache, background refetch, stale time

Zustand → UI'a özgü state
  - Seçili takım ID'si
  - Floating widget açık/kapalı + aktif sohbet
  - Sidebar collapse durumu
  - Dark/light tema tercihi
```

---

### 7.2 Backend

| Katman | Teknoloji | Kullanım Amacı |
|---|---|---|
| Runtime | **Node.js** | JavaScript runtime |
| Framework | **Express.js** | HTTP API ve middleware |
| Dil | **TypeScript** | Tip güvenliği |
| WebSocket | **ws** kütüphanesi | Gerçek zamanlı bağlantı sunucusu |
| Auth | **JWT** (access + refresh token) | Kimlik doğrulama |
| Validasyon | **Zod** | Request body validasyonu |
| ORM | **Prisma** | Veritabanı sorgu katmanı |
| API Stili | **REST** | Tüm endpoint'ler RESTful |

**Token Stratejisi:**
```
Access Token  → kısa ömürlü (15 dk), her istekte header'da gönderilir
Refresh Token → uzun ömürlü (7 gün), httpOnly cookie olarak saklanır
Blacklist     → logout sonrası access token Redis'e yazılır, geçersizleştirilir
```

---

### 7.3 Veritabanı — Supabase (PostgreSQL)

| Özellik | Kullanım |
|---|---|
| **PostgreSQL** | Ana veritabanı; tüm uygulama verisi |
| **Supabase Auth** | Kullanıcı kaydı ve oturum altyapısı (opsiyonel kullanım) |
| **Row Level Security (RLS)** | Tenant yalıtımı için satır bazlı erişim kontrolü |
| **Supabase Storage** | Profil fotoğrafı ve şirket logosu yükleme |

**Temel Tablolar (özet):**

```
tenants          → şirket tenant'ları
users            → kullanıcılar (tenant_id FK)
teams            → takımlar (tenant_id FK)
team_members     → takım-kullanıcı ilişkisi + rol
tasks            → görevler (team_id, assignee_id, assigner_id)
task_comments    → görev yorumları
channels         → mesaj kanalları (team_id)
messages         → mesajlar (channel_id veya dm: sender_id + receiver_id)
notifications    → bildirimler (user_id)
```

---

### 7.4 Cache & Gerçek Zamanlı — Redis

| Kullanım Alanı | Detay |
|---|---|
| **JWT Blacklist** | Logout olan kullanıcının access token'ı TTL ile saklanır |
| **Rate Limiting** | IP ve kullanıcı bazlı istek sınırı (express-rate-limit + Redis store) |
| **Session Cache** | Sık erişilen kullanıcı/tenant verisi geçici olarak cache'lenir |
| **WebSocket Pub/Sub** | Birden fazla backend instance'ında mesaj dağıtımı (ileride ölçeklenirse) |

**JWT Blacklist Akışı:**
```
Kullanıcı logout eder
      │
      ▼
Access token'ın kalan TTL'i hesaplanır
      │
      ▼
Redis'e SET token_jti "revoked" EX <kalan_saniye> yazılır
      │
      ▼
Sonraki isteklerde middleware Redis'i kontrol eder
→ bulunursa 401 döner
→ bulunmazsa normal akış devam eder
```

---

### 7.5 Deploy ve Altyapı

| Katman | Platform | Detay |
|---|---|---|
| **Frontend** | **Vercel** | React uygulaması; otomatik CI/CD, CDN |
| **Backend** | **Railway** veya **Render** | Node.js + Express; WebSocket desteği mevcut |
| **Veritabanı** | **Supabase** (yönetilen) | PostgreSQL; Supabase dashboard üzerinden yönetim |
| **Redis** | **Railway** veya **Render** | Backend ile aynı platformda, düşük latency |
| **Dosya Depolama** | **Supabase Storage** | Avatar ve logo yükleme |

**CI/CD Akışı:**
```
Git push → main branch
    │
    ├── Vercel → otomatik frontend deploy
    └── Railway/Render → otomatik backend deploy
```

**Ortam Değişkenleri (`.env`):**
```env
# Backend
DATABASE_URL=          # Supabase PostgreSQL bağlantı URL'i
DIRECT_URL=            # Prisma direct connection (migration için)
JWT_ACCESS_SECRET=     # Access token imzalama anahtarı
JWT_REFRESH_SECRET=    # Refresh token imzalama anahtarı
REDIS_URL=             # Redis bağlantı URL'i
CLIENT_URL=            # Frontend URL (CORS için)

# Frontend
VITE_API_URL=          # Backend API URL'i
VITE_WS_URL=           # WebSocket URL'i
VITE_SUPABASE_URL=     # Supabase proje URL'i (storage için)
VITE_SUPABASE_ANON_KEY= # Supabase public key
```

---

### 7.6 Geliştirme Araçları

| Araç | Amaç |
|---|---|
| **ESLint + Prettier** | Kod stili ve lint kuralları |
| **Husky + lint-staged** | Commit öncesi otomatik lint/format |
| **Vitest** | Frontend unit testleri |
| **Supertest** | Backend API testleri |
| **Prisma Studio** | Veritabanı görsel yönetimi (geliştirme ortamı) |

---

### 7.7 API Rate Limiting

Tüm API endpoint'leri için `express-rate-limit` + Redis store kombinasyonu kullanılır.

**Genel Kural:**

```
Her IP adresi → dakikada maksimum 10 istek
Aşımda       → 429 Too Many Requests
```

**Endpoint Bazlı Limitler:**

| Endpoint Grubu | Limit | Pencere | Notlar |
|---|---|---|---|
| `POST /auth/login` | 10 istek | 1 dakika | Brute force koruması |
| `POST /auth/register` | 10 istek | 1 dakika | Spam kaydı önleme |
| `POST /auth/refresh` | 10 istek | 1 dakika | Token yenileme |
| Diğer tüm endpoint'ler | 10 istek | 1 dakika | Genel limit |

**429 Yanıt Formatı:**
```json
{
  "error": "Too Many Requests",
  "message": "Çok fazla istek gönderdiniz. Lütfen 1 dakika bekleyin.",
  "retryAfter": 60
}
```

> Rate limit sayaçları Redis'te saklanır; backend yeniden başlatılsa bile sayaçlar korunur.

---

### 7.8 Dosya Yükleme Kuralları

Supabase Storage üzerinde profil fotoğrafı ve şirket logosu yükleme için geçerli kurallar:

| Kural | Değer |
|---|---|
| **Maksimum dosya boyutu** | 25 MB |
| **İzin verilen formatlar** | `.jpg`, `.jpeg`, `.png`, `.webp` |
| **Depolama klasörü** | `avatars/:userId` / `logos/:tenantId` |
| **Erişim** | Public URL (CDN üzerinden) |

**Backend Middleware:**
```
Dosya yükleme isteği gelir
      │
      ▼
Boyut kontrolü → 25 MB üstü → 413 Payload Too Large
      │
      ▼
Format kontrolü → izin verilmeyenler → 415 Unsupported Media Type
      │
      ▼
Supabase Storage'a yükle → public URL döndür
```

---

### 7.9 E-posta Servisi

> **Durum: İleride implement edilecek.** Aşağıdaki plan referans amaçlıdır.

**Kullanım Alanları:**
- Şirkete davet e-postası
- Şifre sıfırlama
- (İleride) görev bildirimleri e-posta özeti

**Planlanan Servis:** Resend veya SendGrid (karar verilmedi)

**`.env` Değişkeni (şimdilik boş bırakılacak):**
```env
EMAIL_API_KEY=       # Resend / SendGrid API anahtarı
EMAIL_FROM=          # noreply@taskflow.app
```

---

### 7.10 Test Coverage Hedefleri

**Strateji:** Kritik iş mantığını güvence altına alan, pragmatik test yaklaşımı. 100% coverage hedefi yerine yüksek değerli alanlar önceliklendirilir.

#### Backend — Hedef: %70+ coverage

| Test Kategorisi | Araç | Öncelik | Kapsam |
|---|---|---|---|
| Auth endpoint'leri | Supertest | 🔴 Kritik | Login, register, refresh, logout, JWT blacklist |
| Yetki middleware | Vitest / Supertest | 🔴 Kritik | Rol bazlı erişim kontrolleri |
| Görev CRUD | Supertest | 🔴 Kritik | Oluşturma, güncelleme, silme, arşivleme |
| Tenant yalıtımı | Supertest | 🔴 Kritik | Farklı tenant verisi erişilemiyor olmalı |
| Rate limiting | Supertest | 🟡 Önemli | 10+ istek sonrası 429 dönmeli |
| Dosya yükleme | Supertest | 🟡 Önemli | Boyut ve format kontrolü |
| WebSocket mesajlaşma | — | 🟢 İleride | v2'de eklenebilir |

**Zorunlu Test Senaryoları (backend):**
```
✓ Üye, başkasının görevini taşıyamaz
✓ Üye, görev oluşturamaz
✓ Farklı tenant'ın verisi 403 döner
✓ Süresi dolmuş token 401 döner
✓ Blacklist'teki token 401 döner
✓ 11. istekte 429 döner
✓ 26 MB dosya yükleme 413 döner
```

#### Frontend — Hedef: %50+ coverage

| Test Kategorisi | Araç | Öncelik | Kapsam |
|---|---|---|---|
| Yetki bazlı render | Vitest + Testing Library | 🔴 Kritik | Admin butonları üyeye görünmemeli |
| Form validasyonları | Vitest + Testing Library | 🔴 Kritik | Kayıt, görev oluşturma formları |
| Zustand store | Vitest | 🟡 Önemli | State geçişleri doğru çalışmalı |
| Görev kartı bileşeni | Vitest + Testing Library | 🟡 Önemli | Öncelik rengi, deadline gösterimi |
| Kanban sürükle-bırak | — | 🟢 İleride | E2E testine bırakılabilir |

#### E2E — Kritik Akışlar (Playwright önerilir, ileride)

```
✓ Kayıt → şirket oluştur → dashboard
✓ Davet linki ile katılım
✓ Görev oluştur → kanban'da taşı → arşive git
✓ DM gönder → floating widget'ta görün
```

---

## 8. Multi-Tenant Mimarisi

### Tenant Yalıtımı

- Her şirket benzersiz `tenant_id` ile tanımlanır.
- Tüm veri sorgularına `tenant_id` filtresi eklenir.
- Şirket adı sistem genelinde `UNIQUE` kısıta tabidir.
- Bir kullanıcı yalnızca tek bir tenant'a ait olabilir.

### Kullanıcı Kimliği

- Format: `#TF-XXXXX` (sistem tarafından, değişmez)
- `/profile` sayfasında görüntülenir ve kopyalanabilir
- Şirket Admini, kullanıcıları bu ID veya e-posta ile ekler

### Şirket Oluşturma ve Davet Akışı

```
[Kayıt sırasında]              [Kayıt sonrasında — şirketsiz]
Şirket adı gir (opsiyonel)          │
         │                          ├── Profil Dropdown → "Şirket Oluştur"
         ▼                          │         └── Ad gir → Şirket Admini ol
  Yeni tenant oluşur                │
  Kullanıcı = Şirket Admini         └── Davet (e-posta veya user_id)
                                              └── Şirkete Üye olarak katıl
```

### Gerçek Zamanlı Altyapı

- **Protokol:** WebSocket (iki yönlü, kalıcı bağlantı)
- **Kapsam:** Bildirimler, mesajlaşma, kanban kart taşıma
- **Bağlantı yönetimi:** Yeniden bağlanma (reconnect) mantığı zorunlu

### URL Yapısı

- **Başlangıç:** Path prefix — `taskflow.app/dashboard`
- **İleride:** Subdomain'e geçiş mümkün — `acme.taskflow.app/dashboard`

### Responsive

- Yaklaşım: **Mobile-first responsive web**
- Native mobil uygulama planlanmıyor
- Sidebar mobilde hamburger menüye dönüşür
- Kanban kolonları mobilde yatay kaydırılabilir

---

## 9. İş Kuralları Özeti

| # | Kural |
|---|---|
| 1 | Bir kullanıcı yalnızca **tek bir şirkette** olabilir |
| 2 | İlk kayıtta veya sonradan şirket oluşturan kullanıcı otomatik **Şirket Admini** olur |
| 3 | Şirkete dahil olan kullanıcı artık "Şirket Oluştur" seçeneğini **göremez** |
| 4 | **Üye** görev oluşturamaz, atayamaz, güncelleyemez veya silemez |
| 5 | **Üye** yalnızca kendi görevini kanban'da taşıyabilir |
| 6 | Kanban kolonları **sabittir**: Yapılacak / Yapılıyor / Yapıldı |
| 7 | "Yapıldı" durumundaki görev **deadline geçince otomatik arşive** taşınır |
| 8 | Görev **durumu** atanan kişi (görev sahibi), Takım Admini veya Şirket Admini tarafından güncellenebilir; görev **önceliği** yalnızca **Takım Admini ve Şirket Admini** tarafından güncellenebilir |
| 9 | Kanal oluşturma yalnızca **Takım Admini ve Şirket Admini** yapabilir |
| 10 | Şirket Admini **kendi rolünü değiştiremez** |
| 11 | Floating Chat Widget `/chat/:id` sayfasında **gizlenir** |
| 12 | Widget'ta aynı anda **tek sohbet** görünür (en son açılan) |
| 13 | Mesajlarda **okundu bilgisi** gösterilir: `✓` iletildi, `✓✓` okundu |
| 14 | Kullanıcı daveti **e-posta** veya **user_id** (#TF-XXXXX) ile yapılır |
| 15 | `user_id` değişmezdir; kullanıcı `/profile`'dan kopyalayabilir |

---

*Bu doküman yaşayan bir belgedir. Her major karar verildiğinde güncellenmelidir.*
