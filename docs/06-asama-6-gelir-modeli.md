# Aşama 6 — Reklam ve Gelir Modeli + Demo Verisi: Rapor

Tarih: 18.11.2026 · Durum: **Tamamlandı, testler geçiyor** · Yeni migration: yok (tablolar Aşama 1'den beri hazır) · Yeni izin: `supplierSelf.marketing`

## 1. Tamamlanan özellikler

| Modül | Oda (yönetici) | Tedarikçi | Üye |
|---|---|---|---|
| **Paketler** (`/yonetim/paketler`) | Vitrin/Tanıtım paketi tanımlama (fiyat, süre, ürün limiti, sponsorlu ürün ve banner hakkı); talepleri onaylama ("ödeme alındı") / reddetme / iptal; doğrudan paket tanımlama; paketsiz tedarikçiler için varsayılan ürün limiti | Haklarını ve kullanımını görür, paket talep eder, bekleyen talebi geri çeker (`/tedarikci/pazarlama`) | — |
| **Banner reklam** | Doğrudan yayınlama (görsel, alan, tarih, ücret); tedarikçi taleplerini onaylama/reddetme; yayından kaldırma; gösterim/tıklama/tıklanma oranı | Hakkı kadar banner talebi (`/tedarikci/reklamlar`), performans | Mağaza ana sayfası ve Ürünler sayfasında "Reklam" etiketiyle |
| **Sponsorlu ürün** | Tüm sponsorlu ürünleri yönetme, sıra ve ücret | Hakkı kadar ürününü öne çıkarma (`/tedarikci/sponsorlu`) | "Öne çıkan ürünler" şeridi, "Sponsorlu" etiketi |
| **Dijital katalog** | Onay / red (gerekçeli) / yayından kaldırma (`/yonetim/kataloglar`) | Kapak + PDF + ürün seçerek katalog (`/tedarikci/kataloglar`) | `/magaza/kataloglar`, katalog ürünleri güncel fiyatla, tedarikçi sayfasında bağlantı |
| **Gelir raporu** | Paket, reklam ve sponsorlu ürün gelirleri; banner performansı | — | — |

## 2. İş kuralları (servis katmanında, testlerle doğrulandı)

- Sistem fiyat uydurmaz: paket ve reklam ücretlerini Oda belirler; tahsilat platform dışında yapılır, yalnızca kayıt tutulur.
- **Haklar** yalnızca aktif ve süresi dolmamış paketlerden gelir; birden çok paket varsa sponsorlu/banner hakları toplanır. Ürün limiti: varsayılan sınırsız; Oda varsayılan limit koyarsa yeni teklif açarken uygulanır, sınırsız paketi olan tedarikçi bundan etkilenmez.
- **Banner hedefi** yalnızca platform içi `/magaza…` adresi olabilir (açık yönlendirme engellenir); tıklama `/api/reklam/<id>` üzerinden sayılır.
- Askıya alınan tedarikçinin bannerı, sponsorlu ürünü ve kataloğu anında gizlenir; üye yalnızca ilçesine hizmet veren tedarikçinin içeriğini görür.
- Firma izolasyonu: tedarikçi başka firmanın reklam, sponsorluk, katalog ve paket kaydına erişemez (404). Tedarikçi çalışanı pazarlama sayfalarına giremez.
- Sunucu işlemi yükleme limiti 16 MB'a çıkarıldı (PDF katalog en fazla 10 MB, görsel 5 MB).

## 3. Demo verisi (`npm run db:demo`)

Sunum ve deneme için, **tamamı "Demo" etiketli** kurgusal veri. Canlı ortamda (`NODE_ENV=production`) çalışmaz. Tüm demo hesapların şifresi **`55`**, ilk girişte şifre değiştirme istenmez.

- Hesaplar: `demo.yonetici`, `demo.personel`, `demo.tedarikci1/2/3`, `demo.calisan`, `demo.bakkal1/2/3`
- 3 tedarikçi (4 ilçeye hizmet), 3 üye, 24 ürün (görselli), 31 teklif, 3 kampanya (2 onaylı, 1 bekleyen)
- 13 sipariş **gerçek servislerle** oluşturuldu (sepet → sipariş motoru → tedarikçi durum değişiklikleri → fatura kaydı), son 30 güne yayıldı: teslim edildi, dağıtımda, hazırlanıyor, onaylandı, beklemede, reddedildi, iptal
- Aidatlar (Demo Bakkal Canik'in 2 gecikmiş aidatı → sipariş verme kapalı gösterimi), duyurular, bildirimler
- 2 paket, 3 abonelik (1 bekleyen), 2 banner, 4 sponsorlu ürün, 1 dijital katalog (kapak + PDF)
- `DEMO_RESET=1 npm run db:demo` demo verisini silip yeniden yükler (yalnızca demo kayıtlarına dokunur)

## 4. Oluşturulan dosyalar

- **Servisler:** `src/modules/revenue/{packages,ads,sponsored,catalogs,report}.ts`, `shop/catalog.ts` içinde `sponsoredProducts`
- **Sunucu işlemleri / API:** `src/actions/revenue.ts`, `src/app/api/reklam/[id]/route.ts`
- **Sayfalar:** `src/app/{yonetim,personel}/{paketler,reklamlar,kataloglar}`, `src/app/tedarikci/{pazarlama,reklamlar,sponsorlu,kataloglar}`, `src/app/magaza/kataloglar`, `src/components/shop/{ad-banner,sponsored-strip}.tsx`
- **Demo:** `prisma/demo/{data.ts,seed-demo.ts,assets/}`
- **Testler:** `tests/integration/revenue.test.ts` (8), `tests/e2e/{oda-revenue,supplier-revenue,member-revenue}.test.ts`

## 5. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| `typecheck` / `lint` / `build` | ✅ hatasız |
| Birim + servis testleri | ✅ **105/105** |
| Uçtan uca testler | ✅ **136/136** |
| **Toplam** | ✅ **241/241** |
| Tarayıcı (demo verisiyle) | ✅ 9 demo hesabın tümü `55` şifresiyle giriş yaptı; mağaza (banner, sponsorlu, katalog, sepet, siparişler), tedarikçi (gösterge, siparişler, raporlar, pazarlama), Oda (gösterge, raporlar, reklamlar), personel ve depo çalışanı sayfaları hatasız açıldı |

## 6. Sıradaki: Aşama 7 — Test & Yayın

Yük testi, sızma testi kontrol listesi, KVKK metinlerinin Oda hukukçusuyla son hali, sunucu kurulumu (Nginx + Node + PostgreSQL, yedekleme), S3 uyumlu dosya depolama, e-posta/SMS sağlayıcısı, canlıya geçiş.
