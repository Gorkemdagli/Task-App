# TaskFlow

TaskFlow, şirket ve takımların görevleri tek bir panoda düzenlemesine yardımcı olur. Kimin hangi işten sorumlu olduğunu, önceliği ve ilerlemeyi aynı yerde görün; günlük işi takip etmek için ekip panoları, görev ayrıntıları ve şirket özeti arasında geçiş yapın.

## Neden TaskFlow?

TaskFlow, **sorumluluğu görünür kılar**, takım işlerini ve şirket genelindeki ilerlemeyi aynı yerde buluşturur. Göreve özel yorumlar, ekip arkadaşlarının ilgili görev üzerinde iletişim kurmasını ve karar bağlamını görev ayrıntılarında korumasını sağlar.

## TaskFlow ile neler yapabilirsiniz?

- Görevleri **Yapılacak**, **Yapılıyor** ve **Yapıldı** sütunlarında takip edip panoda sürükleyerek taşıyın.
- Görevlere sorumlu, öncelik ve son tarih ekleyin; görev ayrıntılarındaki yorumlarla o göreve özel iletişim kurup bağlamı koruyun. Yorumlar bugün kullanılabilir.
- Durum, öncelik, takım ve tarihe göre görevleri filtreleyin.
- Uygulama içi bildirimleri ve şirket davetlerini takip edin.
- Şirket özetinde görev ve kullanıcı sayılarını, gecikme risklerini, durum ve öncelik dağılımlarını, üye iş yükünü ve takımların karşılaştırmasını inceleyin. Şirket ayarlarını da aynı bölümden yönetin.

### Roller ve yetkiler

| Rol               | Yetki alanı                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Üye**           | Takımlarındaki görevleri görür; yalnızca kendisine atanmış görevlerin durumunu değiştirir. Görev oluşturamaz, atayamaz, önceliğini değiştiremez veya silemez. |
| **Takım Admini**  | Yönettiği takımın görevlerini ve üyelerini yönetir. Yetkisi başka takımlara uzanmaz.                                                                          |
| **Şirket Admini** | Kendi şirketindeki takımları, görevleri, rolleri ve şirket ayarlarını yönetir.                                                                                |

Görevler ve şirket özetleri kullanıcının şirket ve takım kapsamına göre sunulur. Sunucu isteklerde bu sınırları da denetler; uygulama şirketler arası veri erişimini engellemek üzere tasarlanmıştır.

### Günlük kullanım

Hesap oluşturup şirketinize veya takımınıza katıldıktan sonra görev panosunu açın. Görev kartlarından sorumluyu ve işi inceleyin, kendi görevinizin durumunu güncelleyin ve yorumlarla ekip arkadaşlarınızla bağlam paylaşın. Yöneticiler ekip işlerini filtreleyebilir; Şirket Adminleri ayrıca şirket özetini ve ayarlarını kullanabilir.

### Yakında gelecek: Uygulama içi mesajlaşma

Ekiplerin görev yorumlarının ötesinde uygulama içinden iletişim kurabilmesi için mesajlaşma planlanıyor. Bu özellik henüz kullanıma açık değildir.

---

## Geliştiriciler için

### Mimari

- **Frontend:** React, TypeScript, Vite ve Tailwind CSS. İstemci `frontend/` içindedir ve geliştirme sunucusu `5173` portunda çalışır.
- **Backend:** Node.js, TypeScript, Express ve Prisma. REST API `backend/` içindedir; geliştirme sunucusu `3001` portunda çalışır.
- **Veri ve yardımcı servisler:** PostgreSQL uygulama verisini, Redis ise oturum ve istek sınırlama gibi yardımcı işlevleri destekler. Yerel servisler Docker Compose ile başlatılır.
- **İşçi:** Arşivleme işçisi backend paketinde ayrı bir süreç olarak çalıştırılabilir.

### Gereksinimler

- Node.js **22.12 veya üzeri** ve npm
- Docker ve Docker Compose

### Yerel kurulum

Komutları depo kök dizininde çalıştırın.

1. Bağımlılıkları yükleyin:

   ```sh
   npm install
   ```

2. Compose dosyası `taskflow-pgdata` adlı harici bir PostgreSQL volume'u bekler. Bir kez oluşturup geliştirme veritabanı ve Redis'i başlatın:

   ```sh
   docker volume create taskflow-pgdata
   npm run docker:up
   ```

   Geliştirme PostgreSQL'i `localhost:5432`, Redis'i `localhost:6379` adresinde dinler.

3. Örnek ortam dosyalarını kopyalayın:

   ```sh
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

   `backend/.env` içinde yerel bağlantıları ve en az 16 karakterli iki JWT sırrını ayarlayın:

   ```dotenv
   DATABASE_URL=postgresql://postgres:taskflow@localhost:5432/taskflow
   DIRECT_URL=postgresql://postgres:taskflow@localhost:5432/taskflow
   REDIS_URL=redis://localhost:6379
   JWT_ACCESS_SECRET=replace-with-a-random-string-at-least-16-chars
   JWT_REFRESH_SECRET=replace-with-another-random-string-at-least-16-chars
   CLIENT_URL=http://localhost:5173
   ```

   `DATABASE_URL` backend'in, `DIRECT_URL` Prisma'nın geliştirme veritabanına erişimini sağlar. Gerçek sırları kaynak denetimine eklemeyin.

4. Şemayı yerel veritabanına uygulayın:

   ```sh
   npm run prisma:migrate --workspace=backend
   ```

5. Prisma istemcisini oluşturun ve şemayı yerel geliştirme veritabanına uygulayın:

   ```sh
   npm run prisma:generate --workspace=backend
   npm run prisma:migrate --workspace=backend
   ```

6. Frontend'i ve API'yi iki ayrı terminalde başlatın:

   ```sh
   npm run dev:frontend
   ```

   ```sh
   npm run dev:backend
   ```

   Frontend `http://localhost:5173`, API `http://localhost:3001` adresindedir. Arşivleme işçisi gerekiyorsa üçüncü bir terminalde isteğe bağlı olarak başlatın:

   ```sh
   npm run dev:archive-worker
   ```

### Testler ve kontroller

Testler geliştirme veritabanından ayrıdır. Test PostgreSQL'i `localhost:5433` üzerinde `taskflow_test`, test Redis'i `localhost:6380` üzerinde çalışır. Backend testleri başlarken doğrulama adımı `.env.test` dosyasının bu adresleri kullandığını kontrol eder, test servislerini başlatır, yalnızca izole test veritabanını sıfırlar ve şemayı `prisma migrate deploy` ile hazırlar. Ayrı bir migration komutu çalıştırmanız gerekmez.

```sh
cp backend/.env.test.example backend/.env.test
```

`backend/.env.test` içindeki `REDIS_URL` değerini `redis://localhost:6380` yapın. Şablondaki Redis adresi geliştirme servisini gösterdiğinden test için bu düzeltme gereklidir. Test veritabanı dışında bir veritabanı kullanmayın.

```sh
npm test
npm run build:frontend
npm run build:backend
npm run lint
npm run ci:check
```

İhtiyaca göre tek bir komutu veya tüm CI kontrollerini çalıştırın. `ci:check`; lint, iki paketin build'ini ve workspace testlerini yürütür.

### İsteğe bağlı servis yapılandırması

Şirket logosu ve görev dosyaları için Supabase Storage, imzalı zamanlanmış işler için QStash, hata izleme için Sentry yapılandırılabilir. Bunlar ilgili özellik ve dağıtım yapılandırmasına bağlıdır. Gerekli ortam değişkenleri ve örnek değerler için [backend ortam şablonuna](backend/.env.example) ve [frontend ortam şablonuna](frontend/.env.example) bakın.

### Proje belgeleri

- [Ürün davranışı ve mimari notları](PROJECT.md)
- [Frontend tasarım sistemi ve arayüz kuralları](FRONTEND.md)
