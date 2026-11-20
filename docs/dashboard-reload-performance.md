# Korumalı sayfalar, oturum ve yükleme performansı

Bu not, sert yenileme ve uygulama içi gezinmede görülen skeleton süresini, auth isteklerini ve sayfa veri sorgularını birlikte ele alır. Amaç ölçümle gecikmenin hangi aşamada olduğunu bulmak, ardından güvenli ve küçük değişiklikleri önceliklendirmektir.

## Bilinenler ve açık sorular

Paylaşılan iki Network kaydında `refresh` başarılı. İlk kayıtta toplam süre 114,27 ms, sunucu yanıtını bekleme 108,67 ms. İstek navigasyondan yaklaşık 370 ms sonra kuyruğa giriyor ve yaklaşık 485 ms'de tamamlanıyor. İkinci kayıtta istek 218 ms sürüyor. `teams` ve ekip detayı istekleri birbirine yakın zamanda başlıyor. Üç görev isteği 254–289 ms sürüyor. Kayıtlar farklı yüklemlerden geldiği için süreleri tek bir zaman çizelgesi gibi birleştirmeyin. Kullanıcının yaklaşık yarım saniyelik skeleton gözlemi, ölçülmüş skeleton görünme süresi değildir.

Initiator stack Axios çağrısını, minified uygulama kodunu ve React zamanlamasını gösteriyor. Kaynakta `App.tsx` bootstrap effect'i refresh ile korumalı route preload'ını paralel başlatıyor. Auth bootstrap bitene kadar korumalı rota bekliyor. Lazy route henüz yüklenmemişse route fallback'i de skeleton gösteriyor. Dolayısıyla refresh süresini azaltmak ve kullanıcının skeleton'ı daha erken kaybetmesi ilişkili ama ayrı hedeflerdir.

React Query varsayılanı 30 saniye stale time ve pencere odağına dönüşte otomatik yenileme kapalı olacak şekilde ayarlı. Sorgu bazlı override olabilir. Cache temizliği pathname değişiminde değil, tenant veya etkin ekip kapsamı değiştiğinde çalışıyor. Her sayfanın ağ isteği çıkaracağı varsayılmamalı. Sorgu anahtarı, cache tazeliği ve eşzamanlı observer dedup davranışı her rota için doğrulanmalı.

## Rota ve sorgu haritası

| Rota | Kodda görülen yükleme kapısı | İncelenecek optimizasyon |
| --- | --- | --- |
| `/` ve `/dashboard` | Üye dashboard'unda ekipler, ekip detayı, görevler ve rozetler aşamaları var. Şirket yöneticisi dashboard'unda görev/ekip aşaması ardından rozetler geliyor. | Üye görevlerinin ekip detayı isteğini gerçekten beklemesi gerekiyor mu, rol ve ekip filtresi hangi anda hazır oluyor ölçün. Şirket yöneticisi için tasks ile teams zaten paralel başlıyor mu doğrulayın. |
| `/tasks` | Ekipler ve üye/aktif ekip ayrıntısı sorguları; görev listesi ana skeleton'ı sürüyor. Sorgu anahtarında filtreler yer alıyor. | Dashboard ile aynı sorgu anahtarı ve filtrelerle cache paylaşımı var mı, rol/aktif ekip değişince hangi anahtarlar yenileniyor ölçün. Gereksiz tekrar varsa önce anahtar ve enable koşulunu düzeltin. |
| `/tasks/:id` | Görev ve yorum sorguları rota kimliğiyle açılıyor. Görev yüklenince görev ekibi sorgulanıyor. Ana skeleton görev sorgusuna bağlı. | Görev, yorum ve ekip ayrıntısının hangi bölümleri gerçekten blokladığını ölçün. Dosya ve geçmiş alt bölümlerini ana gövde kapısı olarak varsaymayın. |
| `/teams` | Takım listesi ile seçilen takımın paneli ayrı veri gerektiriyor. Seçim başlangıcı listeye bağlı olabilir. | İlk seçili takımın nasıl belirlendiğini ve detay sorgusunun liste sonrası mı başladığını Performance kaydıyla doğrulayın. Liste ve detay aynı anda güvenle sorgulanabiliyorsa gecikme fırsatıdır. |
| `/teams/:id` | Takım ve görev sorguları kardeş olarak başlıyor. Ana sayfa kapısı takım sorgusu; görev alanının kendi yükleme durumu var. Yönetim özeti isteğe bağlı. | Ana takım bilgisi geldikten önce/sonra hangi alanların kullanılabilir olduğunu ölçün. Görev skeleton'ının takım başlığına gereksizce bağlanmadığını doğrulayın. |
| `/permissions` | Kullanıcı ve takım sorguları birlikte başlıyor. Şirket kullanıcı sorgusu yalnızca şirket admini ve tenant kapsamı hazır olduğunda etkin. Ana kullanıcı içeriği users yüklemesine bağlı. | Yetkisiz kullanıcıda şirket kullanıcı isteğinin hiç çıkmadığını doğrulayın. Kullanıcı ve takım sorgularının aynı anda başlayıp başlamadığını ve ortak cache'i kontrol edin. Yetkisiz yönlendirme UI davranışıdır, backend kontrolü yerine geçmez. |
| `/notifications` | Bildirim sayfası bildirimleri ve davetleri sorguluyor. Bildirim sorgusunda polling kapalı. Topbar da bildirim ve davet verisi kullanıyor. | Sayfa ve Topbar aynı query key/observer'ı paylaşıyor mu doğrulayın. Ayrı key varsa gerçek yinelenen çağrı olup olmadığını ölçün, cache dedup varsa kodu değiştirmeyin. |
| `/profile` | Profil formu profil verisi hazır olana kadar skeleton gösteriyor. | Bootstrap sırasında alınan kullanıcı verisi ile profil sorgusu aynı query key ve cache'i kullanıyor mu doğrulayın. Bu kanıtlanmadan `/me` isteğinin yinelendiğini varsaymayın. |
| `/chat/:id` | Mevcut sayfa statik kullanılamıyor placeholder'ı gösteriyor; chat veri sorgusu yok. | Auth bootstrap ve route chunk süresini ölçün. Chat backend'i veya yeni loading akışı eklemek bu incelemenin kapsamı değil. |
| `/company` ve `/company/settings` | Şirket dashboard'u özet, takım listesi ve rozet aşamalarına sahip. Şirket yöneticisi olmayan kullanıcılar yönlendiriliyor. Settings alias'ı aynı kapsamda incelenmeli. | Özet ve takım sorgularının paralelliğini, aynı kaynağı kullanan Topbar sorgularıyla cache paylaşımını ölçün. Alias için ayrı veri isteği çıkmadığını doğrulayın. |
| `/login`, `/register` ve public sayfalar | Auth bootstrap ve public route geçişi etkili olabilir. Uygulama route tanımını ve redirect'leri doğrulayın. | Oturum yokken gereksiz refresh çağrısı ve login sonrası hedef route'un çift yüklenmesi var mı ölçün. |

Üst navigasyon ve sidebar korumalı sayfalarda ortak yük yaratabilir. Topbar bildirim/davet sorguları dashboard rozet aşamasına bağlıdır. Sidebar profil ve takım özetleri route değişse bile gözlemlenebilir. Bunları sayfanın kendi sorgularından ayrı zamanlayın. Hard reload auth kapısını ve ilk route'u tekrar işler. Sıcak uygulama içi gezinme auth bootstrap'ını tekrar etmez; lazy shell ve sayfa sorgularını yine tetikleyebilir.

## Auth ve session akışı

| Senaryo | Kodla bilinen davranış | Performans ve doğruluk kontrolü |
| --- | --- | --- |
| Sert yenileme | `App.tsx` refresh çağrısını ve korumalı route preload'ını aynı bootstrap effect'inde başlatıyor. Korumalı ekran auth hazır olana kadar bekliyor. | Refresh başlangıcı, yanıtı, route preload tamamlanması, auth state commit'i ve ilk korumalı sorgu başlangıcını tek Performance kaydında işaretleyin. |
| Oturum yok veya refresh reddedildi | Refresh service geçersiz, iptal edilmiş ya da süresi dolmuş session'ı reddediyor. UI'nın login'e geçişi ve hata durumunu gerçek tarayıcı senaryosuyla doğrulayın. | Reddedilmiş refresh sonrası korumalı sorguların gönderilmediğini, skeleton'ın sonsuz kalmadığını ve login yönlendirmesini kontrol edin. |
| API 401 ve eşzamanlı istekler | Frontend API interceptor aynı session dönemindeki eşzamanlı 401'ler için refresh'i paylaşır ve isteği bir kez tekrarlar. Eski session'dan geç gelen yanıtlar yeni session'ı ezmemek üzere korunur. | Eşzamanlı 401 dalgasında tek refresh, istek başına tek retry, login ile yarış ve refresh reddi senaryolarını kontrol edin. Bu mekanizma uygulama içi istekler içindir; tarayıcı sekmeleri arasında tek-flight garantisi varsaymayın. |
| Login, kayıt ve logout | Bu akışların refresh cookie, access state ve sorgu cache'i üzerindeki etkisini ilgili auth testleriyle doğrulayın. | Yeni oturumun eski kullanıcı veya tenant cache'ini göstermediğini, logout sonrası korumalı verinin görünmediğini test edin. Sekmeler arası bildirim davranışı incelenen kaynakla kanıtlanmadı. |
| Refresh süresi ve rotation | Proje kurallarında access token 15 dakika, refresh idle ömrü 3 gün, mutlak session ömrü 7 gün. Refresh rotation eski token kimliğini Redis'te geçersizleştiriyor. | Refresh süresini kısaltmak ya da Redis/session kontrollerini atlamak optimizasyon değildir. Mutlak süre ve rotation davranışını değiştirmeden aşama bazlı darboğazı giderin. |
| Korumalı API çağrısı | Backend auth middleware JWT, Redis blacklist/session ve canlı kullanıcı/tenant bağlamını kontrol ediyor. Route seviyesindeki role ve tenant kuralları ayrıca geçerli. | Frontend rol kontrolleri sadece UX'tir. Yetkisiz rol, yanlış ekip, yanlış tenant, değiştirilmiş doğrudan API isteği ve sahiplik bypass'ı backend'de reddedilmeli. Canlı rol veya üyelik değişikliklerinde eski query cache'i hassas veri göstermemeli. |

Refresh maliyeti için frontend auth proxy upstream-header ve toplam süreleri, backend refresh ve servis aşamaları `REQUEST_STAGE_TIMING=true` ile incelenebilir. Backend request timing seçili korumalı endpoint'leri de kapsar. İstek kimliği ve zaman penceresiyle proxy ve backend kayıtlarını eşleştirin. Tarayıcıdaki TTFB toplam ağ, proxy ve backend beklemesini kapsar, tek başına veritabanı veya Redis maliyetini kanıtlamaz. Hassas token, cookie ve parola loglanmamalıdır.

## Öncelik sırası

1. **Ölçüm taban çizgisi oluşturun.** Her rota için oturum açık/kapalı, sert yenileme, sıcak iç gezinme, cache sıcak/soğuk ve normal ağ koşullarını kaydedin. En az beş tekrar alın, medyan ve p95 raporlayın. Skeleton başlangıcı/bitimi, route kullanılabilirliği ve ilk ana içerik görünürlüğünü ayrı ölçün. Network `Load` ve `DOMContentLoaded` sürelerini skeleton süresi saymayın.

2. **Uzun ortak işleri ayırın.** Auth refresh proxy/backend aşamalarını ve korumalı endpoint timing'lerini inceleyin. Rota chunk, React commit, query enable koşulu ve API TTFB'yi ayrı işaretleyin. Önce ölçülen en büyük gecikmeye müdahale edin. Sadece iki ekran görüntüsüne dayanarak backend veya React optimizasyonu seçmeyin.

3. **Kritik sayfa kapısını en aza indirin.** Her rotada ana içeriği gerçekten bloklayan query'yi belirleyin. Sayfanın başlık ve kullanılabilir bölümünü gereksiz child query'lere bağlamayın. Üye dashboard görevleri için ekip detayını bekleme olası bir fırsattır, fakat yalnızca doğru tenant, takım üyeliği, rol tabanlı filtre ve görev API'si güvenle hazırsa paralelleştirme değerlendirilmelidir. Takım ve yetki sayfaları için de tabloda belirtilen liste/detay bağımlılığını ölçmeden kaldırmayın.

4. **Yinelenen sorguyu kanıtlayın.** Query key, stale time, enabled koşulu ve aynı veriyi kullanan Topbar/sidebar observer'larını karşılaştırın. Cache aynıysa sorgular React Query tarafından paylaşılabilir. Farklı key veya filtre gerçekten ayrı istek çıkarıyorsa, yalnızca eşdeğer güvenli kapsamda ortaklaştırın. Üç görev durum sorgusunu tek API çağrısına dönüştürmek ilk adım değildir, çünkü kolonların limit, sayım, sıralama ve sayfalaması farklı olabilir.

5. **Auth başlangıcını ancak kayıt destekliyorsa değiştirin.** Route preload zaten refresh ile paralel. Auth bootstrap'ını erken başlatmanın veya lazy shell'i önceden yüklemenin ölçülen faydası olmadıkça yeni erken ağ isteği eklemeyin. Refresh rotation ve başarısız oturum yönlendirmesi korunmalı.

## Ölçüm matrisi ve kabul ölçütleri

| Grup | Örnekler | Beklenen doğrulama |
| --- | --- | --- |
| Başlangıç | Oturumsuz giriş, oturumlu sert yenileme, sıcak iç gezinme | Refresh sayısı, auth gate süresi, route chunk, sayfaya göre ilk ana sorgu |
| Cache ve ağ | Sıcak/soğuk cache, throttled bağlantı, offline, backend 5xx | Skeleton süresi, hata/yeniden deneme davranışı, sonsuz loading olmaması |
| Session yarışları | Eşzamanlı 401, refresh reddi, login sırasında eski refresh yanıtı, logout | Tek refresh paylaşımı, bir retry sınırı, yeni session/cache'in korunması |
| Yetki ve veri kapsamı | Üye, takım admini, şirket admini; yanlış rol/takım/tenant; değiştirilmiş API isteği | Yetkisiz cevapların reddi, tenant/ownership sınırlarının korunması, yetkisiz sorguların gereksiz başlamaması |
| Sayfa yükleri | Her tabloda listelenen route ve Topbar/sidebar birlikte | Skeleton alt alanları, query sayısı, seri/paralel istek sırası, medyan ve p95 kullanılabilirlik |

Her değişiklik sonrası aynı kullanıcı rolü, tenant, rota, veri hacmi ve cache koşuluyla en az beş tekrar karşılaştırın. Önce/sonra sayfa başına istek sayısını, ana içerik kullanılabilirlik medyanı/p95'ini ve hata oranını kaydedin. Query sırası değişmişse boş takım, istek hatası, yanlış takım/tenant ve doğrudan API çağrısı testlerini ekleyin. Auth/session değişmişse eşzamanlı 401, refresh reddi, login/logout ve eski yanıt yarışlarını kontrol edin. Güvenlik doğrulanamıyorsa performans sonucu kabul edilmemeli.

## Yerel tarayıcı doğrulama durumu

İlk denemede Docker motoruna erişilemedi. Daha sonra E2E için ayrılmış guarded `postgres-test` Docker servisiyle yerel PostgreSQL kurulumu düzeltildi. Prisma policy'lerinin beklediği `authenticated` rolü `NOLOGIN` ve superuser olmayan rol olarak oluşturuldu, ardından 28 migration uygulandı. Bu kurulum yalnızca guarded test veritabanında yapılmalı. Üretim veritabanına veya üretim ayrıcalıklarına uygulanmamalı. Üç rolün geçici test hesapları seed lifecycle ile doğrulandı. Giriş bilgileri ve kayıt ID'leri bu dokümana yazılmıyor. Kontrollü yerel gerçek backend ölçümleri aşağıda raporlanıyor. Üretim ölçümü henüz yapılmadı.

## Uygulama değişikliği ve güncel kanıt

Yeni dashboard davranışında üç durum sütunu kendi sorgusu tamamlanınca ayrı ayrı gösteriliyor. Ekip, tenant ve rol kapıları, üç durum sorgusu ve badge/readiness toplamı korunmuş. Sürükle-bırak işlemi ilk durum sorgularının tamamı bitene kadar kapalıdır. Bu, ilk hazır sütunun daha erken görünmesini hedefler, ama dashboard'un tüm verilerinin hazır olma süresini kendiliğinden düşürmez.

İlgili dashboard ve readiness testleri hedefli olarak çalıştırılmış ve 53 test başarılı. Kod yeniden incelemesinde `/profile` bootstrap profiliyle aynı query key'i kullanıyor. `/tasks` filtre parametreleri URL'den geliyor ve takım metadata'sı gelince değişmiyor. `/teams` ilk seçili takım detayının listeye bağlı olması bilinçli. `/permissions` kullanıcı ve takım sorguları kardeş; şirket dashboard özet ve takımları paralel başlatabiliyor. Şirket ayarlarında özet ve takım aşamaları ayrı kalıyor. Bu bulgular bu rotalarda sırf teorik olasılığa dayanarak değişiklik önermemek için kullanıldı.

Kod ve hedefli test kanıtına ek olarak, aynı sentetik yerel build üzerinde eski ve yeni dashboard davranışı beşer sert yüklemeyle karşılaştırıldı. İstek payload'ları eşleştirildi, refresh 90 ms, teams 80 ms, takım detayı 120 ms, üç görev durumu ise 250/500/750 ms gecikmeyle yanıtladı. İlk örnek statik asset cache'i soğukken, sonraki dört örnek normal cache ile alındı. Navigasyondan her sütunun ilk görev başlığına kadar geçen süreler şöyleydi.

| Sütun | Eski medyan | Yeni medyan | Eski p95 | Yeni p95 |
| --- | ---: | ---: | ---: | ---: |
| Yapılacak | 1462 ms | 967 ms | 1858 ms | 1322 ms |
| Devam ediyor | 1462 ms | 1218 ms | 1858 ms | 1574 ms |
| Tamamlandı | 1462 ms | 1468 ms | 1858 ms | 1811 ms |

Bu ölçüm, durum sorguları farklı zamanlarda tamamlandığında ilk sütunları daha erken gösterebildiğini gösteriyor. Üç sorgu da tamamlandığında tüm sütunların hazır olma süresi iyileşmedi. Route scaffold bitiş medyanı eski 546,1 ms, yeni 553,8 ms; scaffold görünme süresi 424,0 ms'den 422,0 ms'ye değişti. Ana `h1` görünme medyanı eski 555,4 ms, yeni 563,1 ms oldu. Bu nedenle auth/route başlangıç süresinde iyileşme gözlenmedi. Sıcak dashboard'dan Tasks'e tek karşılaştırmada `h1` 34 ms ve 33 ms ölçüldü, ölçüm sırasında API çağrısı çıkmadı. Bu tek örnek performans iyileşmesi iddiasını desteklemez ve yalnız başlığın görünmesini ölçer.

Eşleştirilmiş sentetik çalışmalarda beklenmeyen API çağrısı veya console hatası görülmedi. Bu sonuçlar kontrollü gecikme ve yerel payload'larla elde edildi. Üretim backend'i, kullanıcı verisi, ağ değişkenliği veya üretim performansını temsil ettikleri ileri sürülemez. Gerçek üretim eski→yeni karşılaştırması yapılmadı.

Hedefli dashboard/readiness testleri 53/53 başarılı. Auth başlangıcı ve cache kapsamını etkileyen regression testleri de 93/93 başarılı. Tüm frontend testlerinde 724/725 geçti. Tek hata, `preloadDashboardRoute` testindeki 5 saniyelik timeout oldu. Yalnız bu test yeniden çalıştırıldığında 21/21 geçti. Bu tekrar sonucu ilk başarısızlığı silmez; geniş test koşusundaki timeout tekil/flaky sınıfında değerlendirilmelidir.

### Dashboard için auth sonrası teams prefetch

Güncel değişiklikte `App.tsx` yalnızca `/dashboard` rotasında, canonical session ve tenant doğrulamasından sonra teams sorgusunu bloklamadan prefetch ediyor. `useTeams` aynı query options ve cache'i paylaşıyor. Prefetch auth başarısızlığını veya route readiness/gating kurallarını değiştirmiyor. Geç gelen session, logout, farklı roller, geçersiz/public route, hata ve dedup senaryolarını kapsayan hedefli 94 test başarılı. Read-only cache ve tenant kapsamı incelemesinde engel bulunmadı.

Aynı guarded test backend'i ve member fixture'ıyla normal cache durumunda beş sert dashboard yenilemesi önce/sonra eşleştirildi. Değerler p50'dir.

| Ölçüm | Önce | Sonra |
| --- | ---: | ---: |
| Refresh bitişinden teams başlangıcına boşluk | 315 ms, aralık 311–319 | 2 ms, aralık 0–4 |
| İlk gerçek görev kartı görünmesi | 624 ms, aralık 598–908 | 609 ms, aralık 574–676 |
| Başlık/skeleton bitiş işareti | 520 ms | 504 ms |
| Refresh süresi | 49 ms | 45 ms |
| Tasks isteği başlangıcı | yaklaşık 586 ms | yaklaşık 545 ms |

Her yenilemede tam bir `teams` GET'i ve sekiz API isteği görüldü, tümü 200 döndü. Bu sonuç teams isteğinin zamanını öne alındığını açıkça gösteriyor. İlk görev kartında ve başlık/skeleton ölçümünde fark daha küçük ve beş örneğe dayalıdır. Refresh süresi benzer kaldı, bu değişiklik refresh endpoint'ini hızlandırma iddiası taşımaz. Daha önce canlıda gözlenen 314 ms boşluk önceki deploy'a aittir. Yeni build canlıya alınmadığından canlı eski/yeni karşılaştırması yoktur ve production etkisi doğrulanmamıştır. Test sırasında production'a istek veya test trafiği gönderilmedi.

### A→B: seçili takım detayını önden yükleme

Bu, önceki A→B ölçümünden ayrı bir yerel aşamadır. A sürümünde dashboard yalnızca ekip listesini önden yüklüyordu. B sürümü, `/dashboard` üzerinde kalıcı seçili takım bilgisi ve aynı tenant içindeki liste/elegible Dashboard slice doğrulandıktan sonra seçili takım detayını da önden yüklüyor. Her adımda güncel session, user, tenant, route ve takım eşleşmesi yeniden doğrulanıyor. Var olan rol kontrolleri değişmedi.

Eski ve yeni sürümde aynı seed edilmiş görev durum kartları, aynı üye ve aynı kalıcı seçili takımla beşer ısınmış sert dashboard yenilemesi ölçüldü. Her koşuda sekiz API çağrısı vardı ve hepsi 200 döndü. Her koşuda bir teams listesi, bir seçili takım detayı ve üç ayrı status-task isteği görüldü. İlk kısa örnekteki tek task isteği sayımı ölçüm artifact'iydi, odaklı ek A örneğiyle düzeltildi. Ek sorgu oluşmadı.

| Ölçüm | A, takım listesi prefetch | B, seçili takım detay prefetch |
| --- | ---: | ---: |
| Refresh bitişinden detay isteği başlangıcına | 318 ms | 36 ms |
| Navigasyondan detay isteği başlangıcına | 558 ms | 239 ms |
| İlk task isteği başlangıcı | 604 ms | 520 ms |
| AppShell/header/nav hazır olması | 550 ms | 514 ms |
| İlk seed edilmiş görev kartı | 660 ms | 576 ms |

Resource timing'de AppShell medyan transferi A'da 161 ms idi. Refresh bitişinden sonra AppShell kaynağı +209 ms'de tamamlanıyordu. Ayrı ve daha hassas takipte gerçek header/nav, auth'tan yaklaşık 309–311 ms sonra görünüyordu. Daha önce kullanılan erken generic header bir placeholder'dı ve gerçek navigation hazır olma anı olarak kullanılmamalı.

Bu aynı fixture ile alınmış, yerel ve dar kapsamlı bir eşleştirmedir. Takım detayı isteğinin zamanını öne alıyor ve ilk kartı bu örneklerde 84 ms erkene getiriyor. Önceki 520→504 ms skeleton ve 624→609 ms kart değerleri başka aşamadaki ölçümlerdir ve bu tabloyla birleştirilmemelidir. Sonuç canlıya taşınamaz; production deploy veya production isteği yapılmadı.

### B→C: shell yükleyici denemesi

Bu karşılaştırma, yeni izole browser context'lerinde harness reset edildikten sonra aynı guarded member, seçili takım, görev kartları ve backend kullanılarak alındı. Her build için beş ısınmış `/dashboard` sert yüklemesi yapıldı. B, seçili takım detayı prefetch'inin bulunduğu build'dir. C, buna ek olarak AppShell'i daha erken yüklemeyi deneyen build'dir. Değerler ayrı A→B aşamasındaki mutlak medyanlarla birleştirilmemelidir.

| Ölçüm | B | C |
| --- | ---: | ---: |
| AppShell, header, kullanılabilir nav, heading ve skeleton bitişi | 521 ms | 532 ms |
| İlk task GET başlangıcı | 552 ms | 549 ms |
| İlk gerçek görev kartı | 603 ms | 589 ms |
| Refresh bitişinden takım detayı başlangıcına | 36 ms | 39 ms |
| AppShell chunk responseEnd | 172 ms | 186 ms |

Her koşuda sekiz API isteği görüldü, hepsi 200 döndü. Bir teams listesi, bir takım detayı ve üç ayrı status-task query key'i vardı. Duplicate istek yoktu. Navigasyon/shell metriğinde kazanç oluşmadı. İlk görev kartındaki 14 ms fark küçük örnek değişkenliği düzeyindedir. AppShell chunk'ı refresh'ten önce alınmış olsa da bu, React'in bekleme nedeni olduğunu tek başına kanıtlamaz. Anonim cold `/login` JavaScript transferi 218.002→218.176 byte oldu. Tek bir sıcak C Teams tıklamasında shell yeniden mount olmadı. Shell loader denemesi navigasyonu öne almadığı için geri alındı; member seçili takım detay prefetch'i korundu.

Shell denemesi geri alındı. Tutulan B sürümü için altı odaklı frontend test dosyasında 171 test geçti. Git diff whitespace kontrolü de başarılı. Yerel ölçümler canlı karşılaştırma değildir.

### B→D: korumalı ilk mount öncesi route kodu hazırlığı

Yeni D denemesi, aynı yerel member fixture'ıyla yapılacak B→D karşılaştırmasına dayanıyor. Taze B taban çizgisinde, kalıcı seçili takımı ve üç görevi olan kullanıcıyla beş ısınmış sert `/dashboard` yenilemesi alındı. Kullanılabilir navigation/heading ve skeleton bitişi p50 510 ms, ilk gerçek görev kartı 585 ms, ilk task API başlangıcı 528 ms, teams başlangıcı 212 ms ve takım detayı başlangıcı 248 ms idi. Her örnekte sekiz API isteği 200 döndü, duplicate istek yoktu.

D denemesi, auth ve tenant hazır olduğunda korumalı ilk mount'tan önce guard, AppShell ve Dashboard için zaten kullanılan dinamik route kodunu çözüyor. Lazy fallback diğer durumda korunuyor. Auth veya veri akışı değişmedi. D kodu için 96 scoped test, ESLint ve izole build geçti, statik incelemede engel bulunmadı. Ortam engellerinden sonra kontrollü sentetik bir B referans örneği alındı, ancak kullanılabilir shell/card işaretleri yoktu. D ölçülmeden önce yürütme oturumu kapandı. Headless shell kullanılamadı ve standalone Chrome zaman aşımına uğradı. Fixture temizliği tamamlandı. Bu nedenle eşleştirilmiş B/D sonucu veya performans iddiası yoktur. D denemesi izole kaldı, ana çalışma ağacına veya commit'e alınmadı.

### Tutulan ana değişiklik

Ana çalışma ağacı doğrulanmış teams listesi ve seçili takım detayı prefetch değişikliğine döndürüldü. Son doğrulamada altı odaklı dosyada 171 test geçti ve scoped diff whitespace kontrolü başarılı oldu. Commit `31ff351` (`perf(dashboard): prefetch team data`) yalnızca `frontend/src/App.tsx`, `frontend/src/hooks/queries/useTeams.ts` ve `frontend/src/App.test.tsx` dosyalarını içeriyor. Bu commit gönderilmedi ve deploy edilmedi. Diğer oturum değişiklikleri korundu.

Tutulan B sürümünün en güncel yerel browser referansı beş yenilemede route scaffold/usable navigation bitişi 510 ms p50 ve ilk görev kartı 585 ms p50 idi. Daha önceki ayrı A→B ölçümündeki AppShell/header/nav 550→514 ms ve ilk kart 660→576 ms sonuçları bu yeni 510/585 referansıyla birleştirilmemelidir. Kalan gecikmenin çözüldüğü veya D'nin kazanç sağladığı sonucu yoktur.

### Yerel gerçek-backend ölçümü

Role-specific test hesaplarıyla, aynı guarded local backend ve payload'larla, normal cache durumunda her rol için dashboard'dan beş sert yenileme kaydedildi. Eski→yeni değerler millisecond cinsinden, p50'dir. Kolon değerleri sırasıyla Yapılacak, Devam ediyor, Tamamlandı'dır. Sessiz API zamanı, son ilgili API yanıtından sonra ek API isteği çıkmamasına kadar geçen zamandır.

| Rol | Ana başlık | İlk görev kolonları | API sessizleşmesi | Refresh |
| --- | ---: | ---: | ---: | ---: |
| Üye | 404→402 | 490/490/490 → 480/481/483 | 981→974 | 25→36 |
| Takım yöneticisi | 397→399 | 497/497/497 → 489/477/480 | 980→976 | 27→34 |
| Şirket yöneticisi | 398→399 | 475/475/475 → 493/475/483 | 957→961 | 26→33 |

Bu yerel sonuçlarda farklar küçük. Genel bir sayfa hızlanması veya refresh optimizasyonu kanıtlanmıyor. Sütunların bağımsız gösterilmesi, yapay olarak farklı geciktirilmiş synthetic testte erken sütun gösterimini iyileştirmişti. Gerçek backend ölçümünde fark çok daha küçüktü. `GET /teams` özet yanıtı çağıranın takım rolünü taşımadığından, görevleri takım ve rol bilgisi hazır olmadan başlatmak güvenli bir kısa yol değil.

Refresh ile sonraki route istekleri arasındaki yaklaşık 290–310 ms boşluk yerel ölçümlerde tekrarlandı ve route fallback/lazy route yüklemesiyle zaman bakımından örtüştü. Bu korelasyon kesin kök neden kanıtı değildir. `AppShell`'i eager yükleme denemesi gate testlerini bozduğu için geri alındı. `ProtectedRoute` eager yükleme denemesi beş dashboard/tasks karşılaştırmasında aralığı değiştirmedi. Dashboard 308→308 ms, Tasks 311→309 ms ölçüldü ve login JavaScript'i 5.568 byte büyüdü. Deneme geri alındı, auth davranışı değiştirilmedi.

Her rol için 11 hard-route örneği, görev/takım/chat detay ID'leri ve company/settings alias'ı dahil smoke edildi. Bu smoke yalnız başlık görünmesini ve timeout olmamasını doğruladı. Her sayfanın veri hazır olmasını, yetki matrisini veya her rol için sıcak link navigasyonunu kanıtlamaz. Tüm korumalı route/rol kombinasyonlarının gerçek backend doğrulaması tamamlanmış sayılmamalı.

### Guarded auth ve authorization E2E

Test veritabanında auth suite 2/2, authorization suite 3/3 ve cache senaryosunun düzeltilmiş E2E testi 1/1 geçti. Cache test düzeltmesi testte beklenen akışı logout → public landing → login olarak eşleştiriyor. Eski session ile yapılan PATCH tek kez gönderilip 401 alıyor, member GET 403 almaya devam ediyor ve private cached title ekranda tekrar görünmüyor. Bu test düzeltmesidir, production auth kodu değişikliği değildir.

Guarded E2E cleanup sonrasında fixture kayıt sayısı sıfır olarak doğrulandı. Yerel test servislerinin kurulumu ve migration'ları hazır bırakıldı. Persistent probe ile member rolünde warm dashboard→tasks ve dashboard→teams tıklama smoke'u doğrulandı, refresh süresi `requestfinished` üzerinden kaydedildi. Warm navigasyonun tüm rotalar ve üç rol için matrisi tamamlanmadı. Üretim karşılaştırması da hâlâ beklemede.

## Route performans probu

`e2e/route-performance.spec.ts` opt-in probu üç rol için ayrı test çalıştırır. Her route için varsayılan beş sert yükleme, parent sayfada tam href eşleşen link varsa beş sıcak tıklamalı gezinme alır. JSON çıktısı role, route, final URL, redirect durumu, `page.goto` tamamlanma süresi, ilk görünür `main h1` süresi, refresh tamamlanma ve refresh'in navigation sonrası başlama zamanını, API istek sayısını ve gözlenen skeleton aralıklarını içerir. Sert yükleme ve sıcak gezinme için p50/p95 özetleri verilir. Skeleton işaretleri `route-fallback`, `dashboard-route-skeleton`, `route-shell-skeleton`, `dashboard-content-skeleton` ve `page-loading-skeleton` değerleridir. Redirect edilen örnekler başarılı route zaman özeti dışındadır. Refresh süresi response yerine `requestfinished` üzerinden alınır. Task detayında `/tasks`, takım detayında `/teams`, şirket ayarlarında `/company`, diğerlerinde `/dashboard` parent kabul edilir. Link yoksa sıcak gezinme atlanır.

Probu yerel test hesabıyla çalıştırmak için önce yerel Postgres/Redis E2E servislerini ve backend'i hazırlayın. Her rolün hesabı yalnız test tenant'ında olmalı. PowerShell oturumunda env değerlerini tanımlayıp mevcut E2E komutuna spec verin. Gerçek değerleri dosyaya veya loga yazmayın.

```powershell
$env:TASKFLOW_ROUTE_PERF = '1'
$env:TASKFLOW_PERF_MEMBER_EMAIL = '<local-member-email>'
$env:TASKFLOW_PERF_MEMBER_PASSWORD = '<local-member-password>'
$env:TASKFLOW_PERF_MEMBER_TASK_ID = '<local-member-task-id>'
$env:TASKFLOW_PERF_MEMBER_TEAM_ID = '<local-member-team-id>'
$env:TASKFLOW_PERF_MEMBER_CHAT_ID = '<local-member-chat-id>'
$env:TASKFLOW_PERF_TEAM_ADMIN_EMAIL = '<local-team-admin-email>'
$env:TASKFLOW_PERF_TEAM_ADMIN_PASSWORD = '<local-team-admin-password>'
$env:TASKFLOW_PERF_TEAM_ADMIN_TASK_ID = '<local-team-admin-task-id>'
$env:TASKFLOW_PERF_TEAM_ADMIN_TEAM_ID = '<local-team-admin-team-id>'
$env:TASKFLOW_PERF_TEAM_ADMIN_CHAT_ID = '<local-team-admin-chat-id>'
$env:TASKFLOW_PERF_COMPANY_ADMIN_EMAIL = '<local-company-admin-email>'
$env:TASKFLOW_PERF_COMPANY_ADMIN_PASSWORD = '<local-company-admin-password>'
$env:TASKFLOW_PERF_COMPANY_ADMIN_TASK_ID = '<local-company-admin-task-id>'
$env:TASKFLOW_PERF_COMPANY_ADMIN_TEAM_ID = '<local-company-admin-team-id>'
$env:TASKFLOW_PERF_COMPANY_ADMIN_CHAT_ID = '<local-company-admin-chat-id>'
$env:TASKFLOW_PERF_REPETITIONS = '5'
rtk npm run e2e -- e2e/route-performance.spec.ts
```

Detay ID'leri ilgili hesabın erişebildiği test fixture kayıtlarına işaret etmelidir. ID bırakılırsa o ayrıntı rotası eklenmez. Eski `TASKFLOW_PERF_EMAIL`, `TASKFLOW_PERF_PASSWORD`, `TASKFLOW_PERF_TASK_ID`, `TASKFLOW_PERF_TEAM_ID` ve `TASKFLOW_PERF_CHAT_ID` değişkenleri üye rolü için fallback olarak desteklenir. Üye önekli değişkenler varsa önceliklidir. Varsayılan rotalar dashboard, tasks, teams, permissions, notifications, profile, company ve company/settings'tir. İlgili ID verilirse task, team ve chat detayları da eklenir. Sabit tekrar adedi küçük karşılaştırma içindir, kararlı performans benchmark'ı değildir.

Önemli sınır, `elapsedThroughApiQuietMs` değerinin Playwright `page.goto` veya link gezinmesinin tamamlanma süresi olmasıdır. Güncel prob `elapsedToMainHeadingMs` değerini, ilk görünür `main h1` anında API sessizliği beklemesinden bağımsız olarak kaydeder. Bu değer sayfanın veya verinin tamamen hazır olmasını ölçmez. Önceki tabloların bu alanı eski probla API sessizliği beklendikten sonra kaydedilmişti. Bu geçmiş değerleri ilk görünür başlık süresi olarak yorumlamayın veya yeni ölçümlerle doğrudan karşılaştırmayın. Redirect örnekleri JSON'da tutulur ama başarılı route p50/p95 hesabına girmez. Sıcak gezinme yalnız parent sayfada tam href eşleşen link bulunduğunda ölçülür. Navigation ve refresh başlangıçları aynı Node Date.now() saatinden alınır, süre `requestfinished` üzerinden kaydedilir. Skeleton observer her sert navigation'da yeni document içinde kurulur. Sıcak gezinme öncesinde ölçüm başlangıcı ve gözlenen işaretler sıfırlanır. Sütun ölçümleri synthetic gecikme ve yerel gerçek-backend ölçümleri ayrı ayrı yorumlanmalıdır. Route başlığı ve scaffold ölçümleri veri alanlarının kullanılabilirliğini göstermez.

## Üretim öncesi ve sonrası kontrolü

Üretimde eski/yeni karşılaştırma ancak kullanıcı yeni build'i deploy ettikten sonra yapılmalıdır. Aynı hesap rolü, tenant, ekip, görev hacmi, viewport ve bağlantı koşulunu kullanın. Tarayıcı cache durumu ile route'u değiştirmeyin. Her rol için en az beş sert yenileme ve beş normal uygulama içi sidebar tıklaması kaydedin. Auth `refresh` tamamlanmasını, ilgili skeleton işaretlerinin görünürlük aralığını, ilk görev başlıklarını, ana verinin kullanılabilir olmasını ve API istek dalgasının bitişini ayrı not edin. Aynı Network logunda başarılı ve başarısız istek sayısını karşılaştırın. p50/p95 hesaplarını her rol ve navigasyon türü için ayrı yapın. Yalnız iki Network waterfall ekran görüntüsü istek sırası ve gecikme ipucu verir, skeleton görünürlük süresini ölçmez. Üretim kaydı alınmadı; gerçek kullanıcı gecikmesindeki etki henüz bilinmiyor.

## Canlı gözlem

`https://taskflow.gorkemd.dev` üzerinde izole, yetkili tarayıcı oturumunda üç normal-cache dashboard sert yenilemesi yapıldı. Her birinde sekiz API isteği 200 döndü. Değerler navigasyon başlangıcına göredir. Refresh süreleri 241/89/93 ms, medyan 93 ms. Refresh bitişinden `teams` başlangıcına kadar 314/318/310 ms, medyan 314 ms. İlk görev istekleri 815/647/655 ms'de başladı, medyan 655 ms. İlk görev satırı 849/680/697 ms'de görünür oldu, medyan 697 ms. Skeleton'ın gözlenen bitişi 611/455/452 ms, medyan 455 ms. Bu son değer skeleton'ın navigasyondan sonraki bitiş anıdır, skeleton'ın ekranda kaldığı süre değildir.

Aynı oturumdaki sıcak tıklama örneklerinde Tasks başlık/ilk satırı 32 ms'de göründü ve görev GET'i 32–120 ms arasında sürdü. Teams başlık/ilk öğesi 31 ms'de göründü, yeni API isteği çıkmadı. Permissions başlığı 25 ms'de göründü, users GET'i 111–202 ms arasında sürdü. Bu ölçümler tam görev tablosunun, takım listesinin veya izin tablosunun hazır olma süresini doğrulamıyor. Çıkış yapılmış `/dashboard` isteği login prompt'unda kaldı, refresh 204 döndü. Üç denemede public doküman TTFB'si yaklaşık 226–372 ms, medyan yaklaşık 227 ms olarak gözlendi.

Canlı kayıtta refresh sonrası `teams` öncesindeki yaklaşık 300 ms boşluk tekrarlandı. Kayıt JWT imzalama maliyetini veya boşluğun kesin kaynağını göstermiyor. Önceki 114 ve 218 ms refresh görüntüleri ayrı örnekler olduğundan canlı medyanla performans kazancı çıkarılamaz. Bu küçük örnek, rol ve tenant bazında genel yetki doğrulaması veya geniş route matrisi yerine geçmez. Canlı ortamda değişiklik öncesi/sonrası aynı koşullarda karşılaştırma yapılmadı.

## İlgili kaynaklar

- [Uygulama ve route bootstrap'ı](../frontend/src/App.tsx)
- [Route veri hazırlığı](../frontend/src/components/layout/RouteDataReadiness.tsx)
- [Dashboard sorguları ve loading durumu](../frontend/src/pages/Dashboard/index.tsx)
- [React Query varsayılanları](../frontend/src/lib/react-query.ts)
- [API refresh interceptor'ı](../frontend/src/lib/api.ts)
- [Auth proxy](../frontend/api/v1/auth/[...path].ts)
- [Auth servisi](../backend/src/services/auth.service.ts)
- [Auth middleware](../backend/src/middleware/auth.ts)
- [Request timing middleware](../backend/src/http/requestTiming.ts)
- [Opt-in route performance probu](../e2e/route-performance.spec.ts)

## Son yerel ölçümler (20 Kasım 2026)

Bu ölçümler yerel kopyada, deploy edilmemiş kodla alındı. `HEAD` hâlâ `31ff351` (`perf(dashboard): prefetch team data`). Dashboard route modülü yeniden kullanım denemesi ve diğer çalışma ağacı düzenlemeleri bu commit'in dışında, yerel ve commit edilmemiş durumda. Üretim kazanımı olarak yorumlanmamalıdır.

### Dashboard ilk görev kartı: eşleştirilmiş B/D

Aynı origin ve cache politikasıyla, guarded `taskflow_test` üzerinde yeni bir üye, ekip ve her durumda bir görev kullanıldı. B ve D build'lerinde birer ısınma yenilemesi dışarıda bırakıldı, ardından oturumu açık kullanıcıyla beş sert yenileme dönüşümlü ölçüldü. D, auth verisi hazırken korumalı route, AppShell ve Dashboard bileşenlerini ilk mount öncesinde hazırsa yeniden kullanıyor. Her iki sürümde dashboard için aynı sekiz API isteği ve aynı yanıt verisi gözlendi.

| Ölçüm | B p50 | D p50 |
| --- | ---: | ---: |
| İlk task isteğinin başlaması | 419 ms | 147 ms |
| Task yanıtlarının tamamlanması | 459 ms | 182 ms |
| Yapılacak ilk kart | 440 ms | 161 ms |
| Devam ediyor ilk kart | 432 ms | 161 ms |
| Tamamlandı ilk kart | 434 ms | 169 ms |
| Dashboard skeleton'ının kaybolması | 381 ms | 79 ms |

Bu ölçümde kartlar kolon başına yaklaşık 263–279 ms önce görünür oldu. İstek sayısı ve yanıt boyutları değişmedi. Task API yanıt süreleri birbirine yakındı; fark task isteklerinin yaklaşık 272 ms daha erken başlamasından geliyor. Ayrı soğuk giriş denemesinde B 877 ms, D 898 ms medyan verdi. Bu nedenle kazanım oturumu açık sert yenileme senaryosuyla sınırlı, soğuk girişte iyileşme gösterilmedi.

### Şirket dashboard geçmiş sorgusu

İzole PostgreSQL 15 test veritabanında 5.000 görev ve 50.000 durum/açılma olayıyla, authenticated rol ve `RepeatableRead` transaction altında baseline ölçüldü. Şirket kapsamındaki cumulative-flow sorgusu p50 703 ms, JS türetimi 48,8 ms sürdü. 1.667 görev ve 16.670 olaylık takım kapsamındaki süreler sırasıyla 920 ms ve 53,9 ms idi. İlk plan incremental sort ve yaklaşık 275 bin shared buffer hit gösterdi. `task_events(task_id, created_at)` indeksi kullanılıyordu; planda olay başına RLS görev/takım kontrolleri de görünüyordu.

Takım kapsamını önce daraltan `MATERIALIZED scoped_tasks` CTE denemesi eski sorguyla aynı satırları ve grafik sonuçlarını üretti. Beş dönüşümlü ölçümün query+derive p50 değeri takım kapsamındaki 1.235 ms'den 876 ms'ye indi. Şirket kapsamı 838 ms'den 855 ms'ye çıktı. Plan takım kapsamındaki sort'u hızlı sıralamaya çevirdi ve shared hit sayısını yaklaşık 95,7 binden 90,3 bine düşürdü. Değişiklik yalnızca takım kapsamındaki sorguda tutuldu; şirket kapsamı mevcut sorgu planını kullanıyor. 11 route testi geçti. Denied member, yanlış tenant/takım kapsamı ve RepeatableRead snapshot senaryoları da test edildi. Yeni indeks veya migration eklenmedi. Bu sonuç test veritabanındaki ölçümdür, üretim sorgu süresi ya da canlı hızlanma değildir.

Önceki tüm sorgu geçmişini SQL'de toplama denemesi aynı 1.000 görev/10.000 olay fixture'ında 603 ms'den 2.378 ms p50'ye yavaşladığı için geri alınmıştı. Daha az satır döndürmesi tek başına performans kazanımı sağlamadı.

Yerel B/D ve veritabanı ölçümleri canlı karşılaştırması değildir. Canlıya alınmadı. Üretim kazanımı ancak aynı rol, tenant, veri hacmi, cache ve ağ koşullarıyla yeni sürüm yayımlandıktan sonra ölçülebilir.

### Görev yorumları: istek birleştirme denemesi

250 yorumluk sentetik görevde mevcut tek GET yanıtı yaklaşık 45.794 JSON byte idi. GET sayısını azaltmak amacıyla yorum isteklerini birleştirme denemesi yapıldı. Eşzamanlı yorum POST'u ve devam eden polling senaryolarında cache güncellemeleri bazı yorumları kaybettirdiği için deneme reddedildi; mevcut invalidation davranışı korundu. Daha az istek, içerik kaybı riski doğuruyorsa performans iyileştirmesi sayılmaz.

### Son durum

Dashboard route bileşenlerini hazır modüllerden yeniden kullanma değişikliği yerel çalışma ağacında kaldı; aynı testte oturumu açık sert yenilemede ilk görev kartları yaklaşık 263–279 ms önce göründü. Şirket dashboard takım kapsamı CTE değişikliği de yerel ve test edilmiş durumda. Bunlar commit edilmedi ve deploy edilmedi. Canlıda etkileri ölçülmedi.
