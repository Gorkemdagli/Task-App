# FRONTEND.md — TaskFlow Tasarım Sistemi

> Bu dosya, `PROJECT.md` §6'daki ham token'ları (renk, tipografi, spacing) **nasıl** kullanacağımızı tanımlar. Token değerleri için kaynak `PROJECT.md`'dir; burada tekrar edilmez, sadece referans verilir. Bu dosya bileşen davranışı, yoğunluk kuralları ve etkileşim prensipleri içindir.

---

## İçindekiler

1. [Tasarım Felsefesi](#1-tasarım-felsefesi)
2. [Yoğunluk Sistemi](#2-yoğunluk-sistemi)
3. [Hareket ve Animasyon Kuralları](#3-hareket-ve-animasyon-kuralları)
4. [Bileşen Kuralları](#4-bileşen-kuralları)
   - 4.1 [Buton](#41-buton)
   - 4.2 [Input / Form Alanı](#42-input--form-alanı)
   - 4.3 [Modal](#43-modal)
   - 4.4 [Dropdown](#44-dropdown)
   - 4.5 [Badge / Etiket](#45-badge--etiket)
   - 4.6 [Kart](#46-kart)
5. [Erişilebilirlik Tabanı](#5-erişilebilirlik-tabanı)
6. [Responsive Kurallar](#6-responsive-kurallar)
7. [İmza Öğesi](#7-i̇mza-öğesi)
8. [Sayfa Tasarımları Referansı](#8-sayfa-tasarımları-referansı)

---

## 1. Tasarım Felsefesi

TaskFlow, koyu temalı, amber vurgulu, **sakin ama net** bir araç hissi vermeli. Kullanıcı burada günün büyük bölümünü geçirecek — göz yormayan kontrast, gürültüsüz arayüz, ama önemli sinyaller (öncelik, deadline, durum) asla kaybolmamalı.

**Üç kelime:** Sakin · Net · Hızlı.

Bu, "minimal = sıkıcı" anlamına gelmez. Amber rengi (`--color-primary: #f59e0b`) tek başına yeterince karakterli; bu yüzden geri kalan her şey onun etrafında disiplinli kalır. Renk, gölge veya animasyon **gösteriş için** kullanılmaz — yalnızca bir hiyerarşiyi netleştirmek veya bir durumu iletmek için kullanılır.

---

## 2. Yoğunluk Sistemi

TaskFlow tek bir yoğunlukla tasarlanmaz. Alan, kullanım amacına göre **sıkı** veya **ferah** olur:

```
┌─────────────────────────────────────────────────────────┐
│ TOPBAR — sıkı (48-56px yükseklik)                        │
├──────────┬──────────────────────────────────────────────┤
│          │                                               │
│ SIDEBAR  │  İÇERİK ALANI — ferah                        │
│ sıkı     │  (sayfa başlıkları, kanban, görev detay,      │
│ (260px)  │   ayar sayfaları)                              │
│          │                                               │
└──────────┴──────────────────────────────────────────────┘
```

### Sıkı Bölgeler (Topbar, Sidebar)

Bu alanlar sürekli görünür ve ekran alanını "kullanıcının asıl işi" için boşaltmalıdır.

- Dikey padding: `--space-2` / `--space-3`
- Satır yüksekliği kompakt: liste öğeleri 36-40px
- İkon + metin yan yana, gereksiz boşluk yok
- Üye avatarları küçük (28-32px)

### Ferah Bölgeler (İçerik Alanı)

Kullanıcının odaklanması gereken yer; nefes alan boşluk okunabilirliği ve karar verme hızını artırır.

- Sayfa kenar boşluğu: `--space-8` (masaüstü)
- Bölümler arası boşluk: `--space-8` / `--space-12`
- Kanban kolon iç boşluğu: `--space-4`
- Görev kartları arası: `--space-3`
- Form alanları arası (görev detay, profil): `--space-6`

**Kural:** Yeni bir bileşen eklerken önce "bu sürekli görünen bir navigasyon parçası mı, yoksa kullanıcının odaklandığı içerik mi?" diye sor. Cevaba göre sıkı veya ferah kuralını uygula — ortada bir şey icat etme.

---

## 3. Hareket ve Animasyon Kuralları

**Minimal ve amaçlı.** Animasyon süslemek için değil, bir durumu anlaşılır kılmak için var. Şüphe anında: animasyonu kaldır.

### İzin Verilen Animasyon Noktaları

| Yer | Animasyon | Süre |
|---|---|---|
| Buton / kart hover | `background-color`, `border-color` geçişi | 120-150ms |
| Kanban kart sürükleme | Sürüklenen kart hafif büyür + gölge artar; hedef kolon highlight | sürükleme boyunca |
| Kart bırakma | Yerleşme (settle) animasyonu | 150-200ms ease-out |
| Floating chat widget açılış | Alttan yukarı kayma (slide-up) + fade-in | 200ms ease-out |
| Dropdown / Bildirim paneli açılış | Fade-in + 4px yukarı kayma | 120ms |
| Modal açılış | Fade-in (arka plan) + scale 0.96→1 (içerik) | 150ms |
| Sayfa içi route geçişi | Yok — anında render | — |
| Toast / bildirim mesajı | Sağdan kayma + fade | 200ms |

### Yasak Olanlar

- Sayfa geçişlerinde büyük orkestrasyonlu animasyon yok.
- Scroll-triggered reveal yok (TaskFlow bir üretkenlik aracı, pazarlama sitesi değil — landing page hariç).
- Bekleme süresini uzatan dekoratif loading animasyonları yok; skeleton kullan.
- Hover'da büyüme/döndürme gibi "eğlenceli" mikro-etkileşimler yok — bu bir iş aracı.

### Easing

```css
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);   /* genel geçişler */
--ease-out: cubic-bezier(0, 0, 0.2, 1);         /* açılış / giriş */
--ease-in: cubic-bezier(0.4, 0, 1, 1);          /* kapanış / çıkış */
```

`prefers-reduced-motion: reduce` her zaman saygı görür — bu durumda yukarıdaki tüm geçişler kaldırılır, anında durum değişimi olur.

---

## 4. Bileşen Kuralları

> Tüm renkler `PROJECT.md` §6.1'deki token isimleriyle referans verilir. Burada hex değer tekrar yazılmaz.

### 4.1 Buton

**Varyantlar:**

| Varyant | Kullanım | Görünüm |
|---|---|---|
| `primary` | Ana aksiyon (Görev Ekle, Kaydet, Hesap Oluştur) | `bg-primary`, `text-black` (foreground siyah, kontrast için) |
| `secondary` | İkincil aksiyon (İptal, Vazgeç) | `bg-secondary`, `text-secondary-foreground`, `border-border` |
| `ghost` | Düşük öncelikli aksiyon (· · · menü, ikon butonlar) | Şeffaf arka plan, hover'da `bg-secondary` |
| `destructive` | Silme, çıkarma aksiyonları | `bg-priority-high` tonunda, beyaz metin |

**Boyutlar:**
- `sm`: 32px yükseklik — sidebar, tablo içi aksiyonlar
- `md`: 40px yükseklik — varsayılan, form ve sayfa aksiyonları
- `lg`: 48px yükseklik — landing page CTA

**Durum kuralları:**
- `disabled`: opaklık %50, `cursor: not-allowed`, hover efekti yok
- `loading`: buton metni yerine spinner, buton genişliği sabit kalır (layout shift olmaz)
- Focus: `ring-2 ring-primary ring-offset-2` (klavye navigasyonu için zorunlu)

**Yazım kuralı:** Buton metni eylemi net söyler — "Kaydet" değil "Değişiklikleri Kaydet", "Gönder" değil "Davet Gönder". Buton tıklanınca üretilen sonuç (toast, bildirim) aynı fiili kullanır.

---

### 4.2 Input / Form Alanı

```
┌─────────────────────────────┐
│ Label                        │
│ ┌───────────────────────┐   │
│ │ Placeholder metni      │   │
│ └───────────────────────┘   │
│ Yardımcı metin / hata        │
└─────────────────────────────┘
```

- Yükseklik: 40px (buton `md` ile hizalı)
- Border: `border-input`, focus'ta `ring-primary`
- Hata durumunda: border `priority-high` rengine döner, alt satırda kırmızı hata metni
- Placeholder her zaman örnek değer gösterir, talimat değil ("ornek@sirket.com" — "E-postanızı girin" değil)
- Zorunlu alan işareti: label yanında `*` (kırmızı değil, `text-secondary` tonunda — gürültü yapmasın)

**Textarea (görev açıklaması, yorum, şirket açıklaması):**
- Minimum 3 satır yükseklik, kullanıcı genişletebilir (`resize: vertical`)
- Karakter sınırı varsa sağ alt köşede sayaç (örn. "240/500")

---

### 4.3 Modal

Kullanım alanları: Yeni takım oluşturma, üye ekleme, görev silme onayı, şirket oluşturma.

```
┌─────────────────────────────────┐
│  Başlık                    [×] │
│  ─────────────────────────────  │
│                                 │
│  İçerik alanı                  │
│                                 │
│  ─────────────────────────────  │
│           [İptal] [Onayla]     │
└─────────────────────────────────┘
```

- Arka plan overlay: `bg-overlay`, %60 opaklık, blur yok (performans)
- Modal genişliği: içerik tipine göre `sm` (400px, onay diyalogları) veya `md` (560px, formlar)
- Kapatma: `[×]` ikonu, `Esc` tuşu, overlay'e tıklama — üçü de çalışmalı
- Yıkıcı aksiyonlar (görev silme, üye çıkarma) her zaman onay modalı ister; tek tıkla silme yok
- Onay modalında birincil buton `destructive`, ikincil buton `secondary` olarak konumlanır; varsayılan focus **iptal** butonunda olur (yanlışlıkla silmeyi önlemek için)

---

### 4.4 Dropdown

Kullanım alanları: Takım seçici, profil menüsü, bildirim paneli, rol seçimi (Yetkiler sayfası), filtre menüleri.

- Açılış: tetikleyici elemandan `--space-1` boşlukla, hizalı kenar
- Maksimum yükseklik: 320px, taşarsa scroll
- Liste öğesi yüksekliği: 36px (sıkı yoğunluk — dropdown her zaman sidebar/topbar mantığına uyar, içerik alanında olsa bile)
- Seçili öğe: sol kenarda `--color-primary` ince çizgi + hafif arka plan tonu
- Ayraç çizgileri (`--color-border`) mantıksal grupları ayırır (örn. Profil Dropdown'da "Profil" ile "Oturumu Kapat" arası)

---

### 4.5 Badge / Etiket

Kullanım alanları: Öncelik etiketi, durum etiketi, okunmamış sayısı, rol etiketi.

| Tip | Örnek | Stil |
|---|---|---|
| Öncelik | 🔴 Yüksek | Dolgu arka plan, `radius-sm`, `text-xs`, `font-medium` |
| Durum | Yapılıyor | Outline stil (sadece border + metin rengi), kolon rengiyle eşleşir |
| Sayaç | `[💬 2]` | Dairesel (`radius-full`), `--color-primary` arka plan, siyah metin, `text-xs` `font-semibold` |
| Rol | Takım Admini | Nötr `secondary` arka plan, `text-xs` |

Badge asla tek başına bir aksiyonun tek göstergesi olmaz — renk körü kullanıcılar için yanında her zaman metin bulunur (sadece renk noktası değil).

---

### 4.6 Kart

İki temel kart tipi var: **Görev Kartı** (kanban/liste) ve **Genel Kart** (takım kartı, istatistik kartı vb.)

**Genel Kart kuralları:**
- Arka plan: `--color-card`
- Border: `--color-border`, 1px
- Radius: `--radius-md`
- Gölge: `--shadow-card` (hafif, sadece ayırt edicilik için — derinlik göstergesi değil)
- İç boşluk: `--space-4` (sıkı içerik, örn. mini istatistik) veya `--space-6` (ferah içerik, örn. takım kartı)
- Hover (tıklanabilir kartlarda): border rengi `--color-primary`'ye hafif yaklaşır, gölge bir tık artar — `--shadow-panel`

Görev Kartı'na özel kurallar `PROJECT.md` §5.3'te tanımlı; bu dosyadaki genel kart kuralları onunla çelişmez, tamamlar.

---

## 5. Erişilebilirlik Tabanı

Bu, "süslemeden önce" karşılanması gereken zemin — opsiyonel değil.

- Tüm interaktif elemanlarda görünür klavye focus hâli (`ring-primary`) zorunlu; `outline: none` yazıp geri koymamak yasak.
- Renk kontrastı: metin/arka plan en az WCAG AA (4.5:1 normal metin, 3:1 büyük metin/başlık).
- Öncelik ve durum bilgisi rengin yanında her zaman metinle de verilir (bkz. §4.5).
- `prefers-reduced-motion` saygı görür (bkz. §3).
- Tüm görsel ikonlar (📋 kopyala, 💬 mesaj vb.) yanında `aria-label` taşır; sadece emoji ile anlam taşınmaz.
- Modal açıldığında focus modal içine taşınır (focus trap); kapanınca tetikleyici elemana geri döner.

---

## 6. Responsive Kurallar

`PROJECT.md` §8'deki genel responsive yaklaşımla uyumlu (mobile-first responsive web, native app yok).

| Breakpoint | Genişlik | Davranış |
|---|---|---|
| Mobile | < 768px | Sidebar hamburger menüye döner; kanban kolonları yatay scroll; floating widget tam genişlik açılır |
| Tablet | 768-1024px | Sidebar daraltılabilir (sadece ikon), içerik alanı genişler |
| Desktop | > 1024px | Tam layout: sidebar 260px sabit + içerik alanı |

- Kanban'da mobilde 3 kolon yan yana sığmaz → her kolon ekran genişliğinin ~85'i, yatay snap-scroll.
- Görev Detay sayfasında mobilde "Görevi Veren / Görevi Alan" satırları üst üste yığılır (yan yana değil).
- Floating Chat Widget mobilde sağ alt köşede kalır ama açılınca ekranın tamamını kaplar (mini pencere değil).

---

## 7. İmza Öğesi

Her TaskFlow ekranında tekrar eden, ürünü tanımlayan tek bir görsel imza: **amber sol kenar çizgisi.**

Öncelik etiketlerinde, aktif kolon vurgusunda, seçili dropdown öğesinde ve aktif nav linkinde aynı dil tekrar eder — ince (3-4px) bir `--color-primary` çizgi, sol kenarda. Bu, kullanıcının "şu an neye bakıyorum, ne aktif" sorusunu tek bir görsel dilde, tüm uygulama boyunca tutarlı şekilde cevaplar.

```
│ 🔴 Yüksek                    ← görev kartı, öncelik
│ Dashboard                    ← topbar, aktif sayfa
│ 🏷 UX Takımı                ← sidebar, seçili takım
```

Bu çizgi dışında dekoratif gradyan, gölge oyunu veya ekstra vurgu efekti kullanılmaz — boldluk burada, tek bir yerde toplanır.

---

## 8. Sayfa Tasarımları Referansı

Bu dosya token ve bileşen prensiplerini tanımlar. Sayfa/bileşen düzeyindeki ASCII şemalar `PROJECT.md`'de yaşar — tekrar kopyalanmaz, drift riski olmaması için aşağıdaki tablo kaynak gösterir.

| Konu | Kaynak |
|---|---|
| Genel layout şeması (Topbar / Sidebar / İçerik) | `PROJECT.md` §3 — Layout Şeması |
| Landing Page | `PROJECT.md` §4.1 |
| Kayıt ve Şirket Kurulum Akışı (`/register`) | `PROJECT.md` §4.2 |
| Ana Pano — Kanban (`/dashboard`) | `PROJECT.md` §4.3 |
| Takımlarım (`/teams`) | `PROJECT.md` §4.4 |
| Takım Detay (`/teams/:id`) | `PROJECT.md` §4.5 |
| Görevlerim (`/tasks`) | `PROJECT.md` §4.6 |
| Görev Detay (`/tasks/:id`) | `PROJECT.md` §4.7 |
| Mesajlaşma (`/chat/:id`) | `PROJECT.md` §4.8 |
| Profil (`/profile`) | `PROJECT.md` §4.9 |
| Yetkiler (`/permissions`) | `PROJECT.md` §4.10 |
| Şirket Ayarları (`/company/settings`) | `PROJECT.md` §4.11 |
| Sol Kenar Çubuğu (Sidebar) | `PROJECT.md` §5.1 |
| Üst Navigasyon (Topbar) | `PROJECT.md` §5.2 |
| Görev Kartı | `PROJECT.md` §5.3 |
| Profil Dropdown | `PROJECT.md` §5.5 |
| Floating Chat Widget | `PROJECT.md` §5.6 |

**Kural:** Bir sayfanın veya global bileşenin ASCII şemasına ihtiyaç varsa önce `PROJECT.md`ye bak. Şemadaki içerik değişirse `PROJECT.md`de güncellenir; buraya kopyalanmaz.

---

*Bu doküman `PROJECT.md` ile birlikte yaşar. Token değeri değişirse `PROJECT.md` §6 güncellenir; bu dosyadaki kurallar değişmez kalır çünkü token'a değil prensibe referans verir.*
