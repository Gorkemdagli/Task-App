# CLAUDE.md — TaskFlow

Bu dosya, TaskFlow projesinde Claude Code ile çalışırken geçerli olan davranış kurallarını ve proje context'ini içerir. Bu dosya iki referans dökümanın yerini tutmaz, onlara işaret eder:
- **`PROJECT.md`** — iş kuralları, yetki matrisi, route'lar, stack, ham tasarım token'ları
- **`FRONTEND.md`** — bu token'ların bileşen seviyesinde nasıl kullanılacağı (buton, modal, dropdown, animasyon, yoğunluk kuralları)

**Tradeoff:** Bu kurallar hız yerine dikkatliliği önceliklendirir. Basit/triviyal işler için makul ölçüde esneklik kullan.

---

## 0. Proje Context'i (Hızlı Referans)

TaskFlow, multi-tenant SaaS görev yönetimi uygulaması. Her kod değişikliği öncesi bu kısıtları akılda tut:

**Stack:** React + Vite + TS · Tailwind + shadcn/ui · Zustand (UI state) + React Query (server state) · Node.js + Express + TS · Prisma · Supabase (PostgreSQL + Storage) · Redis · WebSocket (`ws`)

**Roller:** Üye → Takım Admini → Şirket Admini (hiyerarşik, bkz. `PROJECT.md` §2 tam yetki matrisi)

**Kritik iş kuralları (en sık ihlal edilenler):**
- Üye görev oluşturamaz, atayamaz, önceliğini değiştiremez, silemez. Sadece kendi görevinin **durumunu** değiştirebilir (Yapılacak/Yapılıyor/Yapıldı) ve kanban'da kendi kartını taşıyabilir.
- Görev **önceliği** yalnızca Takım Admini / Şirket Admini değiştirebilir.
- Takım Admini yetkisi **yalnızca kendi takımı** kapsamında geçerlidir; şirket çapında değil.
- Bir kullanıcı yalnızca **tek bir tenant**'a ait olabilir.
- Her sorguda `tenant_id` filtresi olmadan veri çekme/yazma **yasak** — cross-tenant veri sızıntısı kritik güvenlik açığıdır.
- Kanban kolonları sabit: Yapılacak / Yapılıyor / Yapıldı (özelleştirilemez).
- "Yapıldı" + deadline geçmiş görev → otomatik arşive taşınır (silinmez).

**Route'lar İngilizce, kebab-case değil camelCase param:** `/dashboard`, `/teams`, `/teams/:id`, `/tasks`, `/tasks/:id`, `/chat/:id`, `/profile`, `/permissions`, `/company/settings`.

**Tasarım token'ları:** `PROJECT.md` §6'daki CSS değişkenlerini (renk, spacing, radius, gölge) kullan. Hardcoded hex/px değeri yazma; her zaman token referansı ver. Bileşen seviyesinde nasıl uygulanacağı (buton varyantları, modal davranışı, animasyon süreleri, yoğunluk kuralları) için `FRONTEND.md`'ye bak — orada zaten karar verilmiş bir kuralı tekrar icat etme.

Belirsizlik anında: PROJECT.md'de cevap yoksa tahmin etme, sor.

---

## 1. Kodlamadan Önce Düşün

**Tahmin etme. Kafa karışıklığını gizleme. Trade-off'ları açıkça söyle.**

- Varsayımlarını açıkça belirt. Belirsizse sor.
- Birden fazla yorum mümkünse hepsini sun — sessizce birini seçme.
- Daha basit bir yaklaşım varsa söyle. Gerektiğinde itiraz et.
- Görev tanımı `PROJECT.md`'deki bir kuralla çelişiyorsa, sessizce birini seçmek yerine çelişkiyi belirt ve sor.
- Bir şey net değilse dur. Neyin kafa karıştırdığını adlandır. Sor.

**TaskFlow'a özel:** Yetki kontrolü gerektiren her endpoint/bileşen için hangi rolün ne yapabildiği `PROJECT.md` §2'de net değilse, kodlamadan önce sor — yanlış yetki varsayımı güvenlik açığına dönüşür.

## 2. Önce Basitlik

**Problemi çözen minimum kod. Spekülatif hiçbir şey yok.**

- İstenenin dışında özellik ekleme.
- Tek kullanımlık kod için abstraction yaratma.
- İstenmeyen "flexibility" veya "configurability" ekleme.
- İmkansız senaryolar için error handling yazma.
- 200 satır yazıp 50 satıra sığabiliyorsa, yeniden yaz.

Kendine sor: "Kıdemli bir mühendis bunun gereksiz karmaşık olduğunu söyler mi?" Cevap evetse, basitleştir.

**TaskFlow'a özel:** Henüz kararlaştırılmamış özellikler için (örn. e-posta servisi, subdomain routing, native mobil) altyapı kurma — `PROJECT.md` §7.9 ve §8'de bunlar açıkça "ileride" olarak işaretli. Şimdiden o yönde abstraction yazma.

## 3. Cerrahi Değişiklikler

**Sadece gerekeni dokun. Sadece kendi pisliğini temizle.**

Mevcut kodu düzenlerken:
- Komşu kodu, yorumları veya formatı "iyileştirme".
- Bozuk olmayan şeyi refactor etme.
- Mevcut stili koru, sen farklı yapardın bile olsa.
- İlgisiz dead code görürsen belirt — silme.

Değişikliklerin orphan yarattığında:
- SENİN değişikliklerinin kullanılmaz hale getirdiği import/değişken/fonksiyonları kaldır.
- İstenmedikçe önceden var olan dead code'u kaldırma.

Test: Değiştirilen her satır doğrudan kullanıcının isteğine izlenebilmeli.

## 4. Hedef Odaklı Yürütme

**Başarı kriterini tanımla. Doğrulanana kadar döngüde kal.**

Görevleri doğrulanabilir hedeflere dönüştür:
- "Validasyon ekle" → "Geçersiz inputlar için test yaz, sonra geçir"
- "Bug'ı düzelt" → "Bug'ı tekrar üreten bir test yaz, sonra geçir"
- "X'i refactor et" → "Testlerin öncesinde ve sonrasında geçtiğini garanti et"

Çok adımlı görevler için kısa bir plan belirt:
```
1. [Adım] → doğrula: [kontrol]
2. [Adım] → doğrula: [kontrol]
3. [Adım] → doğrula: [kontrol]
```

**TaskFlow'a özel doğrulama kontrol listesi** (yetki/tenant ile ilgili her değişiklikte):
```
✓ Üye, yasak olan aksiyonu deneyince 403 alıyor mu?
✓ Farklı tenant'ın verisine erişim 403/404 ile engelleniyor mu?
✓ Takım Admini, yönetmediği takımda yetkisiz mi?
✓ Şirket Admini kendi rolünü değiştirmeye çalışınca engelleniyor mu?
```

Güçlü başarı kriterleri bağımsız döngü kurmana izin verir. Zayıf kriterler ("çalışsın yeter") sürekli netleştirme gerektirir.

---

## 5. Proje-Spesifik Ek Kurallar

### Backend
- Her route handler'da yetki kontrolü middleware seviyesinde olmalı, controller içine gömülü `if` zinciri olarak değil.
- Prisma sorgularında `tenant_id`'yi unutursan bu bir bug değil, güvenlik açığıdır — kendi kontrol et, varsayma.
- Rate limit: dakikada 10 istek, Redis store (`PROJECT.md` §7.7). Yeni endpoint eklerken bu middleware'i atlama.

### Frontend
- Yetkiye bağlı UI elemanları (örn. "+ Görev Ekle", "Çıkar" butonları) hem frontend'de gizlenmeli hem backend'de gerçek kontrolü olmalı. Sadece UI'da gizlemek yeterli değil.
- Zustand'a sunucu verisi koyma (görev listesi, üye listesi vb.) — bunlar React Query'nin alanı. Zustand sadece UI state için (§7.1).
- Yeni renk/spacing değeri gerekiyorsa önce `PROJECT.md` §6'daki token sistemine eklenip eklenmeyeceğini sor, inline değer yazma.
- Buton, input, modal, dropdown, badge, kart gibi bileşenler için `FRONTEND.md` §4'teki kurallar zaten tanımlı — kendi varyant/davranış icat etme, oradan uygula.
- Animasyon eklerken `FRONTEND.md` §3'teki izin verilen liste dışına çıkma; minimal ve amaçlı kalmalı.

### Genel
- `PROJECT.md`'de bir karar değiştiyse (yeni route, yeni kural vb.) hem kodu hem `PROJECT.md`'yi güncelle — ikisi senkron kalmalı.
- `FRONTEND.md`'de bir bileşen kuralı değiştiyse (yeni varyant, yeni animasyon vb.) o dosyayı da güncelle — kod ve dökümanlar senkron kalmalı.
- Migration yazarken Prisma schema'daki `tenant_id` foreign key'lerini atlama.

---

**Bu kurallar şu durumlarda işe yarıyor demektir:** diff'lerde daha az gereksiz değişiklik, gereksiz karmaşıklıktan kaynaklanan daha az yeniden yazım, ve netleştirme sorularının hatalardan önce gelmesi (sonra değil).
