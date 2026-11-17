# Devam Notu — Kaldığımız Yer

Son güncelleme: 18.11.2026 · Durum: **Aşama 1–4 tamamlandı, Aşama 5 başlamadı.**

Bu belge, projeye başka bir bilgisayarda veya yeni bir Claude oturumunda devam edebilmek içindir. Yeni oturumda ilk iş olarak bu dosyayı ve `docs/01…04` raporlarını okutun.

## 1. Yeni bilgisayarda kurulum

Gerekenler: **Node.js 24**, **PostgreSQL 16** (ICU destekli; standart Windows/Linux kurulumlarında vardır), Git.

```bash
git clone <depo adresi> esnaf-tedarik
cd esnaf-tedarik
npm install
cp .env.example .env
```

`.env` içini doldurun:
- `DATABASE_URL` → kendi PostgreSQL'iniz (örn. `postgresql://esnaf:SIFRE@localhost:5432/esnaf_tedarik?schema=public`)
- `DATA_ENCRYPTION_KEY` → `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` çıktısı
  (Yeni anahtar üretmek sorun değil; eski bilgisayardaki veritabanı taşınmayacak.)

Veritabanı ve kullanıcı (psql ile, `postgres` kullanıcısıyla):

```sql
CREATE ROLE esnaf LOGIN PASSWORD 'SIFRE' CREATEDB;
CREATE DATABASE esnaf_tedarik OWNER esnaf;
CREATE DATABASE esnaf_tedarik_test OWNER esnaf;
```

```bash
npm run db:deploy                                   # migration'lar
SEED_TEST_USERS=1 npm run db:seed                   # roller, Oda, kategoriler, ilçeler, admin + TEST hesapları
npm run dev                                         # http://localhost:3000
```

Seed, `admin` için geçici şifreyi ekrana **bir kez** yazar. TEST hesaplarının şifresi `TestSifre2026` (bkz. `prisma/seed.ts`).

Test veritabanı (otomatik testler bunu kullanır; adres `vitest.config.ts` içinde, gerekirse `TEST_DATABASE_URL` ile değiştirin):

```bash
DATABASE_URL="postgresql://esnaf:SIFRE@localhost:5432/esnaf_tedarik_test?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://esnaf:SIFRE@localhost:5432/esnaf_tedarik_test?schema=public" SEED_TEST_USERS=1 SEED_ADMIN_PASSWORD="TestAdmin2026x" npx tsx prisma/seed.ts
npm test                                            # birim + servis testleri
npm run build
DATABASE_URL="…_test…" APP_URL="http://localhost:3100" npx next start -p 3100   # ayrı terminalde
npm run test:e2e                                    # uçtan uca testler
```

Son durumda **155/155 test** geçiyordu.

> Not: Eski bilgisayarda geliştirme veritabanı proje klasörünün yanında, 5433 portunda ayrı bir kümedeydi; yeni bilgisayarda normal PostgreSQL kurulumunu kullanın.

## 2. Mimari kurallar (yeni kod yazarken uyulacak)

- **İş mantığı `src/modules/**` servislerinde.** Her servis fonksiyonu önce `assertPermission(auth, "<izin>")`, sonra kapsam kontrolü yapar (`supplierIdOf`, `memberIdOf`, `chamberIdOf` — `src/lib/auth/scope.ts`). Arayüzde buton gizlemek güvenlik sayılmaz.
- **Sunucu işlemleri** `src/actions/*.ts` (`"use server"`): yalnızca `runAction(auth => servis(...))` çağırır (`src/lib/action.ts`). Hatalar Türkçe mesaja çevrilir; `UserError(mesaj, alan)` alan altında gösterilir.
- **Doğrulama** `src/lib/validation.ts` (Türkçe mesajlar, `zMoney`, `zQuantity`, `zDate`, `zPhone`…). Para `Decimal(12,2)`; kayan nokta yok. Fiyatlar **KDV hariç**.
- **Formlar** `src/components/form` (`ActionForm`, `Field`…): hata olunca girilen değer korunur; geçici şifre tek seferlik kutuda gösterilir.
- **Sayfa koruması:** Oda için `requireOdaPage(...)` (`src/lib/auth/oda.ts`, `/yonetim` ve `/personel` aynı sayfaları kullanır), tedarikçi için `requireSupplierPage(...)`. Üye paneli için Aşama 5'te aynı kalıpta `requireMemberPage` yazılacak.
- **Denetim kaydı:** önemli her değişiklik `audit(...)`.
- **Testler:** her modül için `tests/integration/*.test.ts` (gerçek test veritabanı) ve `tests/e2e/*.test.ts` (gerçek sunucu). Firma/üye izolasyonu mutlaka test edilir.
- **Sahte veri yok:** Gösterge panelleri canlı veriden okur. TEST hesapları açıkça "TEST" etiketlidir, yalnızca geliştirme içindir.

## 3. Alınmış kararlar (varsayılanlar)

| Konu | Karar |
|---|---|
| Aidat | Vadesi geçmiş 2 ödenmemiş aidatta **sipariş verme** kapanır, giriş açık; Oda ayarlardan değiştirebilir |
| Fiyat | KDV hariç girilir, ekranda KDV dahil de gösterilir |
| Kampanya | Üst üste binmez; en avantajlı **tek** indirim uygulanır (Aşama 5'te fiyat motorunda uygulanacak) |
| Sipariş iptali | Üye yalnızca "Beklemede" iken iptal edebilir (Aşama 5) |
| Min. tutarı tutmayan tedarikçi grubu | Sepette kalır, diğer gruplar sipariş olur (Aşama 5) |
| Kısmi onay | Pilotta yok; tedarikçi reddeder + not yazar |
| Stok birimi | Sipariş birimi cinsinden (koli/adet/kg/paket) |
| Sipariş adres kopyası (`Order.addressSnapshot`) | `{ title, district, city, neighborhood?, line, contactName, phone }` |
| Teslimat bölgesi | Üye, tedarikçinin ürünlerini yalnızca o tedarikçinin hizmet verdiği ilçedeyse görür/sipariş verir |

## 4. Sıradaki iş: Aşama 5 — Üye (Bakkal/Market) Paneli

Önerilen sıra (önce servisler + testler, sonra sayfalar):

1. **Fiyat motoru** (`src/modules/pricing`): liste fiyatı → onaylı ve tarihi geçerli kampanya indirimleri (kademe `minQty`'ye göre) → en düşük tek fiyat. Hem sepette hem siparişte aynı fonksiyon.
2. **Katalog okuma** (üye görünümü): yalnızca aktif ürün + aktif, kaldırılmamış teklif + onaylı ve askıda olmayan tedarikçi + üyenin varsayılan adres ilçesine hizmet veren tedarikçi. Arama, kategori, marka, tedarikçi, kampanyalı, stokta filtreleri.
3. **Fiyat karşılaştırma:** ürün sayfasında aynı ürünün tüm tedarikçi teklifleri (paket, fiyat, kampanya fiyatı, birim fiyat, min. sipariş, teslimat günleri, stok durumu).
4. **Sepet** (`Cart`, `CartItem`): tedarikçiye göre gruplu; miktar kuralları (`minOrderQty`, `orderStep`), stok, tedarikçi/ilçe min. tutarı uyarıları; fiyat değişti uyarısı (`seenPackPrice`).
5. **Sipariş motoru** (tek transaction): aidat engeli, idempotency anahtarı, fiyatları yeniden hesapla (sepettekinden farklıysa durdur ve onay iste), kuralları doğrula, koşullu stok düşümü (`UPDATE "Stock" SET quantity = quantity - n WHERE … AND quantity >= n`), `Order` + tedarikçi başına `SupplierOrder` (`ET-2026-000123-01`), satır anlık kopyası, `OrderSequence` ile numara, sepeti boşalt, durum geçmişi, tedarikçiye bildirim, denetim kaydı. Eşzamanlı sipariş ve çift tıklama testleri şart.
6. **Üye sayfaları** (`/magaza`): ana sayfa (Odaya özel kampanyalar, indirimli, en çok tercih edilen, yeni, tedarikçiler, duyurular), kategori, arama, ürün + karşılaştırma, tedarikçi sayfası, favoriler, sepet, sipariş onayı, siparişlerim (ana sipariş → alt siparişler, ayrı durumlar), sipariş detayı + "Beklemede" iken iptal + **tekrar sipariş**, hesabım (adresler, şifre, aidat durumu), bildirimler (`NotificationsList` hazır; layout'a `notificationsHref="/magaza/bildirimler"` ekleyin).
7. **Yönetici raporları ve grafikler** (sipariş verisi oluştuktan sonra).

Sayfalar, önceki aşamalarda olduğu gibi servisler yazıldıktan sonra paralel ajanlarla yazılabilir; briefte servis dosyalarını ve örnek sayfaları (`src/app/tedarikci/**`, `src/app/yonetim/**`) gösterin.

## 5. Bilinen notlar

- Sütun türü değiştiren migration'dan sonra uygulama sunucusunu **yeniden başlatın** (aksi halde "cached plan must not change result type").
- Next.js'te `searchParams`/`params` `Promise`'tir (Next 15).
- Vitest kendi `BASE_URL` değişkenini kullandığı için uçtan uca testlerde `E2E_BASE_URL` kullanılır.
- Windows'ta yerel ayar `tr` iken `toLocaleLowerCase("tr")` "I"yı "ı" yapar; kullanıcı adları için `normalizeUsername` kullanın.
