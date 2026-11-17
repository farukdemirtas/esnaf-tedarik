# Aşama 2 — Temel Altyapı: Rapor

Tarih: 17.11.2026 · Durum: **Tamamlandı, testler geçiyor**

## 1. Uygulanan varsayılan kararlar

Aşama 1'deki açık konulardan bu aşamayı etkileyenler için önerilen varsayılanlar kullanıldı:

| Konu | Uygulanan |
|---|---|
| Teknoloji | Next.js 15 + PostgreSQL 16 + Prisma 6 + Tailwind 4 (tek uygulama) |
| Üye hesabı | Oda oluşturur; ilk girişte şifre değiştirmek zorunlu |
| Aidat kuralı | Vadesi geçmiş **2** ödenmemiş aidatta **sipariş verme** engellenir, giriş açık kalır, üyeye uyarı gösterilir. Oda ayarından değiştirilebilir (`dues.blockOrderingAfterOverdueCount`). |
| Şifre sıfırlama | E-posta/SMS sağlayıcısı olmadığı için Oda tarafından üretilen tek kullanımlık bağlantı ile (bağlantı üretme ekranı Aşama 3'te yönetici panelinde) |
| Geliştirme veritabanı | Mevcut PostgreSQL verilerinize dokunulmadı; proje klasörünün yanında ayrı bir küme (`.devdb`, port **5433**) kuruldu |

## 2. Oluşturulan dosyalar

**Veritabanı**
- `prisma/schema.prisma` — Analiz belgesindeki **tüm tablolar** (53 model): kimlik/yetki, Oda, tedarikçi, üye, aidat, katalog (ana ürün + tedarikçi teklifi), fiyat geçmişi, stok ve stok hareketi, kampanya/indirim, sepet, ana sipariş/alt sipariş/satır, durum geçmişi, fatura kaydı, ödeme altyapısı, gelir modeli (paket, reklam, sponsorlu ürün, katalog), duyuru, bildirim, denetim kaydı, KVKK onay kaydı.
- `prisma/migrations/…_init` — İlk migration
- `prisma/seed.ts` — İzinler (46), roller (6), Oda, 16 ana kategori, 17 Samsun ilçesi, aidat ayarı, ilk yönetici. **Sipariş, ürün, fiyat veya satış verisi oluşturmaz.** `SEED_TEST_USERS=1` ile TEST hesapları.

**Kimlik doğrulama ve yetkilendirme**
- `src/lib/permissions.ts` — İzin kataloğu, rol → izin eşlemesi, kişiye özel izin ekleme/çıkarma
- `src/lib/auth/password.ts` — Argon2id, şifre politikası, geçici şifre üretimi
- `src/lib/auth/username.ts` — Türkçe I/ı/İ sorununa dayanıklı kullanıcı adı normalizasyonu
- `src/lib/auth/server.ts` — `getAuth`, `requireUser`, `requirePanel`, `requirePermission` (yetkisiz deneme kaydedilir)
- `src/lib/auth/scope.ts` — Satır düzeyi kapsam: `supplierScope`, `memberScope`, `assertSupplierOwns`, `assertMemberOwns`
- `src/modules/auth/session.ts` — Veritabanı oturumu (14 gün mutlak, 3 gün hareketsizlik), token'ın yalnızca SHA-256 özeti saklanır
- `src/modules/auth/context.ts` — Her istekte hesap/firma/üyelik durumu kontrolü; pasif/askıdaki hesabın oturumu anında silinir
- `src/modules/auth/service.ts` — Giriş, kaba kuvvet koruması, şifre değiştirme, sıfırlama bağlantısı
- `src/modules/members/dues.ts` — Aidat durumu hesaplama
- `src/middleware.ts` — Oturum çerezi olmayanları giriş sayfasına yönlendirir

**Altyapı**
- `src/lib/db.ts`, `src/lib/audit.ts` (hassas alanlar maskelenir), `src/lib/crypto.ts` (AES-256-GCM alan şifreleme), `src/lib/storage.ts` (içerik imzasıyla tür kontrolü, yol geçişi koruması, web kökü dışında saklama), `src/lib/http.ts` (CSRF Origin kontrolü, güvenli çerez, açık yönlendirme koruması)
- `next.config.ts` — CSP, X-Frame-Options, HSTS (canlıda), nosniff, Referrer/Permissions-Policy

**Sayfalar ve API**
- `/giris`, `/sifremi-unuttum`, `/sifre-degistir`, `/sifre-sifirla`, `/yetkisiz`
- `/yonetim`, `/personel`, `/tedarikci`, `/magaza` — her biri kendi yetki kontrolüyle; gösterge panelleri **canlı veritabanı sayılarını** gösterir (şu an 0)
- `POST /api/auth/login | logout | change-password | reset-password`, `GET /api/files/...` (yalnızca oturumlu)

**Testler**
- `tests/unit/security.test.ts` — 17 test
- `tests/integration/auth.test.ts` — 17 test (gerçek PostgreSQL test veritabanı)
- `tests/e2e/roles.test.ts` — 20 test (çalışan uygulamaya gerçek HTTP istekleri)

## 3. Test sonuçları

| Paket | Sonuç |
|---|---|
| `npm run typecheck` | ✅ hatasız |
| `npm run lint` | ✅ hatasız |
| `npm run build` | ✅ başarılı |
| Birim + servis testleri | ✅ 34/34 |
| Uçtan uca rol testleri | ✅ 20/20 |
| Tarayıcı kontrolü | ✅ Giriş → tedarikçi paneli, masaüstü ve mobil (375 px) görünüm |

Doğrulanan güvenlik davranışları:
- Her rol yalnızca kendi paneline girer; diğer 3 panele erişimde `/yetkisiz`'e yönlendirilir ve deneme kaydedilir.
- Tedarikçi A sayfasında Tedarikçi B'nin, Üye 1 sayfasında Üye 2'nin verisi görünmez.
- 5 hatalı denemede hesap 15 dk kilitlenir; aynı IP'den 30 hatalı denemede IP engellenir.
- Pasif hesap, pasif üyelik, onaysız/askıdaki tedarikçi giriş yapamaz; **açık oturumları da anında düşer**.
- Origin başlığı olmayan veya başka siteden gelen POST istekleri reddedilir (CSRF).
- `next=//kotu-site` gibi dış yönlendirmeler engellenir.
- İlk girişte şifre değişmeden hiçbir panele girilemez.
- Şifre değişince diğer cihazlardaki oturumlar kapanır; sıfırlama bağlantısı tek kullanımlıktır, 1 saatte geçersiz olur.
- Kişiye özel izin kaldırma (örn. personelden "aidat düzenleme") uygulanır.
- Testler sırasında Türkçe yerel ayar hatası bulundu ve düzeltildi: büyük harfle yazılan "TEST" kullanıcı adı küçük harfe çevrilirken "tıst" oluyor ve giriş başarısız oluyordu.

## 4. Nasıl test edilir

```bash
# 1) Geliştirme veritabanını başlat (bilgisayar yeniden başladıysa)
D:/Scoop/apps/postgresql16/current/bin/pg_ctl -D ../.devdb/data -o "-p 5433" -l ../.devdb/log.txt start

# 2) Uygulamayı çalıştır
npm run dev        # http://localhost:3000
```

Giriş bilgileri `.dev-credentials.txt` dosyasında (git'e girmez). TEST hesapları:

| Kullanıcı adı | Rol | Beklenen |
|---|---|---|
| `test.yonetici` | Oda yöneticisi | /yonetim |
| `test.personel` | Oda personeli | /personel |
| `test.tedarikci-a` | Tedarikçi yetkilisi | /tedarikci (TEST Tedarikçi A) |
| `test.tedarikci-a-calisan` | Tedarikçi çalışanı | /tedarikci |
| `test.tedarikci-b` | Tedarikçi yetkilisi | /tedarikci (TEST Tedarikçi B) |
| `test.uye-1`, `test.uye-2` | Üye işletme | /magaza |
| `test.ilk-giris` | Üye (ilk giriş) | /sifre-degistir |
| `test.tedarikci-onaysiz` | Onaysız tedarikçi | Giriş reddedilir |
| `test.uye-pasif` | Pasif üye | Giriş reddedilir |

Otomatik testler (ayrı test veritabanı `esnaf_tedarik_test` kullanılır):

```bash
npm test
npm run build && DATABASE_URL="postgresql://esnaf:esnaf_dev_pw@localhost:5433/esnaf_tedarik_test?schema=public" npx next start -p 3100
npm run test:e2e   # ikinci terminalde
```

## 5. Bilinen eksikler / sonraki aşamaya kalanlar

- **Panel menüleri** şimdilik yalnızca gösterge panelini içerir; yönetim ekranları Aşama 3'te eklenecek.
- Kullanıcı oluşturma, şifre sıfırlama bağlantısı üretme, izin düzenleme **ekranları** Aşama 3'te (altyapı hazır).
- Dosya yükleme altyapısı hazır ve test edildi; yükleme formları ürün/firma ekranlarıyla birlikte gelecek. Görsel yeniden boyutlandırma (sharp) ve S3 sürücüsü Aşama 7.
- E-posta/SMS bildirim sağlayıcısı seçilmedi (karar bekliyor).
- IP bazlı sınırlama `X-Forwarded-For` başlığına dayanır; canlıda Nginx bu başlığı **üzerine yazacak** şekilde yapılandırılmalı (Aşama 7 kurulum belgesine eklenecek).
- Yedekleme betikleri ve canlı sunucu kurulumu Aşama 7.
- Proje henüz git'e commit edilmedi.

## 6. Sıradaki: Aşama 3 — Yönetici ve Personel Paneli

Üye ve aidat yönetimi, tedarikçi başvuru/onay, kategori ağacı, marka, ana ürün kataloğu ve ürün talepleri, teklif denetimi, kampanya onayı, duyurular, kullanıcı/izin yönetimi, denetim kaydı görüntüleme.
