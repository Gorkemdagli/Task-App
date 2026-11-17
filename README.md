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

### GitHub + Coolify ile production yayını

Bu yayın akışı depo kökündeki `compose.coolify.yaml` dosyasını kullanır. Yerel geliştirme için `docker-compose.yml` ve yukarıdaki kurulum adımları geçerlidir; Coolify tanımı yerel akışın yerini almaz.

1. Coolify'de GitHub deposunu ve yayımlanacak dalı seçin. Build Pack olarak Docker Compose, Base Directory olarak `/`, Compose dosyası olarak `/compose.coolify.yaml` kullanın. Alan adını ve TLS'yi yalnızca `web` servisine bağlayın; API için host portu açmayın.
2. Coolify runtime ortamında `TASKFLOW_ORIGIN` değerini alan adının tam HTTPS origin'i olarak ayarlayın (ör. `https://<alan-adı>`; path veya port eklemeyin). `APP_DATABASE_URL`, `MAINTENANCE_DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `SENTRY_DSN` ve `SENTRY_RELEASE` değerlerini de runtime için tanımlayın. `SENTRY_ENVIRONMENT` isteğe bağlıdır; belirtilmezse `production` kullanılır. `STORAGE_PROVIDER=supabase` mevcut davranışı korur ve bu modda `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ile `SUPABASE_TASK_FILES_BUCKET` gerekir.
   Yeni ve boş kurulumda yerel volume kullanmak için `STORAGE_PROVIDER=local`, `LOCAL_STORAGE_SIGNING_SECRET` (ör. `openssl rand -base64 32` ile üretilmiş gizli değer) ve isteğe göre `TASKFLOW_STORAGE_HOST_PATH` ayarlayın. Compose, container içinde `LOCAL_STORAGE_ROOT=/var/lib/taskflow-storage` kullanır; host tarafındaki varsayılan kalıcı dizin `/srv/taskflow/storage`'dir. Uygulama `node` kullanıcısıyla (UID/GID `1000:1000`) çalışır; varsayılan dizini `sudo install -d -o 1000 -g 1000 /srv/taskflow/storage` ile hazırlayın (özel host path kullanıyorsanız onu değiştirin). Public ve private dosyalar ayrı alt dizinlerde tutulur; volume web/nginx servisine bağlanmaz.

   Host volume kökü ve üst dizinleri operatörün kontrolünde olmalıdır; mevcut symlink'ler reddedilir, ancak uygulama aynı host'taki kötü niyetli bir yazıcının eşzamanlı dizin değiştirme yarışını önlemez. Nginx signed-download endpoint'inin access log'unu kapatır ve uygulama query/header token'larını redakte eder; Coolify veya başka bir upstream proxy'nin tam URL query'sini loglamadığını ayrıca doğrulayın.

   Bu seçenek Supabase nesnelerini kopyalamaz ve veritabanı migration'ı/seed'i çalıştırmaz. Var olan Supabase nesnelerini veya DB'deki dosya referanslarını taşımaz; kaynak Supabase dosyalarına dokunmaz. Mevcut kurulumda provider'ı değiştirmek eski public URL'leri ve private dosyaları yerel volume'a aktarmış olmaz; taşıma için ayrı, hash ve DB eşlemesi doğrulanmış bir plan gerekir. Tek VPS volume'u offsite yedek veya restore kanıtı değildir.
3. `APP_DATABASE_URL`, RLS politikalarına tabi olan uygulama rolünü kullanmalıdır; uygulama rolüne `BYPASSRLS` veya superuser yetkisi vermeyin. `MAINTENANCE_DATABASE_URL` arşiv işçisi için ayrı ve gerekli en az yetkili hesabı kullanmalıdır. Self-hosted PostgreSQL veya Redis seçilirse yalnızca ilgili URL'leri erişilebilir servis adreslerine yönlendirin; bu Compose dosyası PostgreSQL ya da Redis servisi oluşturmaz. Dosya depolaması seçtiğiniz Supabase veya yerel provider ile çalışır; QStash ve Sentry bu dağıtım akışında kullanılmaya devam eder.
4. Gerçek sırları yalnızca Coolify runtime ortam değişkenlerinde saklayın; imajlara, build argümanlarına veya `VITE_` değişkenlerine koymayın. `VITE_API_URL` ayarlamayın. Git pull kaynak kodunu alır; tek başına uygulamayı yeniden kurduğunu veya migration çalıştırdığını göstermez. Seçilen commit'i inceleyip Coolify'de build ve yayını başlatın.
5. Migration dosyaları değiştiyse önce yedek alın ve doğrulayın; yeni şemayla eski uygulama sürümünün uyumunu da kontrol edin. Migration için depo checkout'unda `npm ci` çalıştırın, yalnızca migration oturumuna yetkili `DIRECT_URL` verin ve backend dizininden migration'ı bilinçli olarak uygulayın:

   ```sh
   npm ci
   cd backend
   npx prisma migrate deploy
   ```

   `DIRECT_URL` migration oturumunda kullanılmalıdır; runtime `APP_DATABASE_URL` ile aynı yetkileri vermeyin. Gerçek ortam değerlerini örnek dosyalarla veya placeholder değerlerle değiştirmeyin. Yayın sonrasında siteyi ve `/api/v1/ready` sağlık adresini kontrol edin.

### Proje belgeleri

- [Ürün davranışı ve mimari notları](PROJECT.md)
- [Frontend tasarım sistemi ve arayüz kuralları](FRONTEND.md)
