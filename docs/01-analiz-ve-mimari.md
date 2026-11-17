# ESNAF TEDARİK — Aşama 1: Analiz ve Mimari

> **Ortak Güç, Ortak Kazanç**
> Belge sürümü: 1.0 · Tarih: 17.11.2026 · Durum: Karar bekliyor (bkz. Bölüm 11)

Bu belge, kod yazılmadan önce hazırlanan analiz ve mimari belgesidir. Tedarikçi isimleri (Coca-Cola, Algida vb.) yalnızca örnektir; sistem gerçek firmalarla anlaşma, gerçek fiyat, ödeme entegrasyonu veya hukuki onay olduğunu varsaymaz. Bu belgedeki hukuki notlar uzman görüşünün yerine geçmez.

---

## 1. Projenin Özeti ve Kapsam

ESNAF TEDARİK, bir esnaf odasının (ilk olarak Samsun Bakkallar ve Her Çeşit Bayiler Esnaf Odası) yönettiği, **çok satıcılı (multi-vendor) B2B tedarik ağıdır**. Klasik e-ticaretten temel farkları:

| Klasik e-ticaret | ESNAF TEDARİK |
|---|---|
| Tek satıcı, son tüketici | Çok tedarikçi, ticari alıcı (bakkal/market) |
| Herkes kayıt olur | Üyelik Oda onaylı, aidat kontrollü |
| Ödeme platformda | Ödeme tedarikçi ile üye arasında (Oda taraf değil) |
| Tek fiyat | Liste fiyatı + Odaya özel fiyat + kademeli (koli/adet) indirim |
| Ürün = satıcı ilanı | **Ana ürün kataloğu + tedarikçi teklifleri** (karşılaştırma için) |
| Komisyon geliri | Reklam / vitrin / paket geliri (üyeden komisyon yok) |

### 1.1 Pilot (MVP) ile Tam Sürüm Ayrımı

Sunumdaki pilot hedefi (20–30 bakkal, 5–10 tedarikçi, 30–50 ürün, 4 hafta) dikkate alınarak iş iki dalgaya ayrılmıştır:

**Dalga 1 — Pilot için zorunlu (MVP):**
Giriş/rol sistemi · Yönetici: üye, tedarikçi, kategori, marka, ana ürün, kampanya onayı, duyuru, temel raporlar · Personel paneli · Tedarikçi: profil, teklif (ürün) yönetimi, fiyat/stok, kampanya talebi, sipariş yönetimi, temel rapor · Üye: arama, filtre, **karşılaştırma**, sepet, çok tedarikçili sipariş, takip, favoriler, duyurular · Bildirimler (panel içi + e-posta) · Denetim kaydı · Yedekleme.

**Dalga 2 — Pilot sonrası:**
Banner/reklam yönetimi, sponsorlu ürünler, vitrin paketleri ve limitleri, dijital katalog, firma tanıtım paketleri, gelişmiş raporlar, SMS bildirimleri, e-fatura/e-irsaliye entegrasyonu, ödeme entegrasyonu, çoklu Oda (il) desteğinin arayüzü.

> Not: Dalga 2 modüllerinin **veritabanı tabloları baştan** kurulur; sadece arayüz ve iş kuralları sonra yazılır. Böylece sonradan şema kırılması yaşanmaz.

---

## 2. Teknoloji Seçimi ve Gerekçeleri

| Katman | Seçim | Gerekçe |
|---|---|---|
| Uygulama çatısı | **Next.js 15 (App Router) + TypeScript** | Tek kod tabanında hem arayüz hem sunucu tarafı (Server Actions / Route Handlers). Pilot ölçeğinde ayrı bir backend servisi gereksiz karmaşıklıktır. Sunucu tarafı render → bakkalın düşük donanımlı telefonunda hızlı açılış. |
| Sunucu mantığı | Next.js içinde **katmanlı servis yapısı** (`modules/*/service.ts`) | İş kuralları (sipariş bölme, fiyat doğrulama) arayüzden bağımsız servislerde tutulur. İleride mobil uygulama gerekirse aynı servisler REST API olarak açılır. |
| Veritabanı | **PostgreSQL 16** | İlişkisel bütünlük, transaction, satır kilidi (stok için kritik), JSONB, tam metin arama (Türkçe). Makinenizde kurulu. |
| ORM | **Prisma** | Tip güvenli sorgular, migration yönetimi, okunabilir şema. Kritik stok güncellemelerinde ham SQL (`UPDATE ... WHERE stock >= x`) ile birlikte kullanılır. |
| Doğrulama | **Zod** | Form ve sunucu girişleri aynı şemayla doğrulanır; istemciye asla güvenilmez. |
| Kimlik doğrulama | **Özel, veritabanı tabanlı oturum** (httpOnly, Secure, SameSite cookie) + **Argon2id** şifre özeti | Pasif yapılan veya aidatı düşen hesabın oturumu **anında** iptal edilebilmeli; bu, JWT ile zordur, DB oturumuyla kolaydır. Giriş denemesi sınırlama ve hesap kilitleme eklenir. |
| Yetkilendirme | **İzin (permission) tabanlı RBAC** | Roller izin kümeleridir; personele tek tek izin verilebilir ("verilmeyen yetkiye erişememeli" şartı). Ayrıca **satır düzeyi kapsam**: tedarikçi sadece kendi `supplierId`'si, üye sadece kendi `memberId`'si. |
| Arayüz | **Tailwind CSS + shadcn/ui (Radix)** | Kurumsal, erişilebilir, sade bileşenler; mobil öncelikli. |
| Grafikler | **Recharts** | Yönetici ve tedarikçi raporları. |
| Dosya depolama | **S3 uyumlu depolama** (geliştirmede yerel disk sürücüsü, canlıda MinIO / bulut S3) | Görseller dosya türü + boyut + içerik (magic byte) kontrolünden geçer, yeniden boyutlandırılır (sharp), rastgele isimle saklanır. Sürücü soyutlaması sayesinde depolama değişse kod değişmez. |
| E-posta | SMTP soyutlaması (Nodemailer) | Sipariş bildirimleri. Sağlayıcı sonra seçilir. |
| Test | **Vitest** (birim/servis) + **Playwright** (uçtan uca, her rol için) | "Bütün rolleri ayrı ayrı test et" şartı. |
| Canlı ortam | Linux sunucu (Türkiye'de barındırma), Node + PostgreSQL + Nginx, günlük şifreli yedek | KVKK açısından verinin yurt içinde tutulması önerilir (bkz. Bölüm 10). |

**Neden ayrı NestJS/Express backend değil?** Pilot için tek uygulama hem daha hızlı geliştirilir hem daha az işletme maliyeti getirir. Servis katmanı ayrı tutulduğu için, ölçek büyürse ayrıştırma mümkündür.

---

## 3. Sistem Mimarisi

```
                    ┌─────────────────────────────────────────────┐
  Tarayıcı / Mobil  │  Next.js Uygulaması (Node.js)               │
  ───────────────►  │                                             │
   HTTPS            │  ┌─────────────┐   ┌──────────────────────┐ │
                    │  │ Sayfalar    │   │ Middleware            │ │
                    │  │ /yonetim    │◄──┤ oturum + rol kontrolü │ │
                    │  │ /personel   │   │ CSRF / rate-limit     │ │
                    │  │ /tedarikci  │   └──────────────────────┘ │
                    │  │ /magaza     │                            │
                    │  └─────┬───────┘                            │
                    │        │ Server Actions / API               │
                    │  ┌─────▼──────────────────────────────────┐ │
                    │  │ Servis Katmanı (modules/*)              │ │
                    │  │ auth · members · suppliers · catalog    │ │
                    │  │ pricing · cart · orders · campaigns     │ │
                    │  │ ads · reports · notifications · audit   │ │
                    │  │ ── her çağrı: yetki + kapsam kontrolü ──│ │
                    │  └─────┬──────────────┬──────────────┬─────┘ │
                    └────────┼──────────────┼──────────────┼───────┘
                             │              │              │
                   ┌─────────▼───┐  ┌───────▼──────┐ ┌─────▼──────┐
                   │ PostgreSQL  │  │ Dosya deposu │ │ E-posta /  │
                   │ (Prisma)    │  │ (S3 / disk)  │ │ SMS (ileri)│
                   └─────────────┘  └──────────────┘ └────────────┘
```

### 3.1 Çoklu Oda (Türkiye geneline genişleme)

Her ana kayıt bir **`Chamber` (Oda)** kaydına bağlanır (`chamberId`). Pilotta tek Oda vardır; ileride başka il odaları aynı yazılımı kendi verileriyle kullanır. Tedarikçiler birden fazla Oda'ya hizmet verebilir (`SupplierChamber`). Bu yaklaşım baştan kurulmazsa sonradan eklemek pahalıdır.

### 3.2 Klasör Yapısı (planlanan)

```
esnaf-tedarik/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts               # roller, izinler, 16 kategori, ilk yönetici (gerçek sipariş verisi YOK)
├─ src/
│  ├─ app/
│  │  ├─ (public)/          # giriş, tedarikçi başvurusu, KVKK, kullanım koşulları
│  │  ├─ yonetim/           # Sistem yöneticisi paneli
│  │  ├─ personel/          # Oda personeli paneli
│  │  ├─ tedarikci/         # Tedarikçi paneli
│  │  ├─ magaza/            # Bakkal / market paneli
│  │  └─ api/               # dosya yükleme, sağlık kontrolü, ileride mobil API
│  ├─ modules/              # iş mantığı (her modül: schema.ts, service.ts, policy.ts)
│  ├─ lib/                  # db, auth, permissions, storage, mailer, money, audit
│  └─ components/           # ortak UI bileşenleri
├─ tests/                   # vitest + playwright
└─ docs/                    # bu belge ve sonraki aşama raporları
```

---

## 4. Kullanıcı Rolleri ve Yetkiler

### 4.1 Roller

| Rol | Kim | Kapsam |
|---|---|---|
| `SUPER_ADMIN` | Yazılım/teknik sorumlu | Tüm Odalar (ileride) |
| `CHAMBER_ADMIN` | Oda yönetimi | Kendi Oda'sının tamamı |
| `CHAMBER_STAFF` | Oda personeli | Kendisine verilen izinler kadar |
| `SUPPLIER_OWNER` | Tedarikçi firma yetkilisi | Sadece kendi firması |
| `SUPPLIER_STAFF` | Tedarikçi çalışanı (sipariş hazırlayan vb.) | Kendi firması, sınırlı (örn. fiyat değiştiremez) |
| `MEMBER_OWNER` | Bakkal/market sahibi | Sadece kendi işletmesi |
| `MEMBER_STAFF` | (İsteğe bağlı) işletme çalışanı | Sepet hazırlar; sipariş onayı sahipte (karar gerekli) |

### 4.2 İzin Matrisi (özet)

✔ = tam · ◐ = kısıtlı / sadece kendi kaydı · 👁 = sadece görüntüleme · — = yok

| İzin | Yönetici | Personel (varsayılan) | Tedarikçi | Üye |
|---|---|---|---|---|
| Üye başvurusu inceleme/onay | ✔ | ✔ | — | — |
| Üye bilgisi güncelleme | ✔ | ✔ | — | ◐ (kendi iletişim bilgisi) |
| Üye aktif/pasif yapma | ✔ | (izinle) | — | — |
| Aidat kaydı girme/kontrol | ✔ | ✔ | — | ◐ (kendi durumu) |
| Tedarikçi başvurusu onay | ✔ | — | — | — |
| Tedarikçi bilgisi | ✔ | 👁 | ◐ | 👁 (iletişim) |
| Kategori / marka yönetimi | ✔ | — | — (öneri gönderir) | — |
| Ana ürün kataloğu | ✔ | — | ◐ (yeni ürün talebi) | 👁 |
| Teklif (fiyat/stok) | 👁 + yayından kaldırma | 👁 | ◐ | 👁 |
| Kampanya oluşturma | ✔ | — | ◐ (onaya gönderir) | — |
| Kampanya onayı / yayını | ✔ | — | — | — |
| Siparişler | 👁 tümü | 👁 tümü | ◐ (kendi siparişleri, durum değiştirme) | ◐ (kendi siparişleri) |
| Raporlar | ✔ sistem geneli | 👁 | ◐ kendi | ◐ kendi alışverişleri |
| Reklam / paket / fiyat | ✔ | — | ◐ (satın alma talebi) | — |
| Duyuru | ✔ | (izinle) | 👁 | 👁 |
| Kullanıcı & yetki yönetimi | ✔ | — | ◐ (kendi çalışanları) | — |
| Denetim kayıtları | ✔ | — | — | — |

### 4.3 Yetki Uygulama Kuralları

1. **Her sunucu işlemi** önce izni (`can(user, 'order.updateStatus')`), sonra kapsamı (`order.supplierId === user.supplierId`) kontrol eder. Arayüzde butonun gizlenmesi güvenlik sayılmaz.
2. Tedarikçi ve üye sorguları servis katmanında **zorunlu filtre** ile çalışır; ID tahmin ederek başka kayda erişim (IDOR) engellenir.
3. Üye girişi şu koşulların hepsini gerektirir: hesap aktif + üyelik onaylı + aidat durumu "erişim engeli yok". Aidat engeli Oda'nın ayarıyla (örn. 2 ay gecikmede kısıtla) çalışır — **karar gerekli**.
4. Pasife alınan hesabın tüm oturumları anında silinir.

---

## 5. Sayfa Listesi

### 5.1 Genel (giriş gerektirmeyen)
- Giriş · Şifremi unuttum / sıfırlama · İlk girişte şifre değiştirme
- Tedarikçi başvuru formu · Üyelik başvuru formu (Oda kullanıcı oluşturuyorsa sadece bilgi formu)
- KVKK aydınlatma metni · Kullanım koşulları · Çerez politikası · İletişim
- (Karar) Giriş yapmamış ziyaretçiye tanıtım sayfası gösterilsin mi? Fiyatlar **gizli** olmalı.

### 5.2 Yönetici Paneli (`/yonetim`)
1. Gösterge paneli (KPI kartları + grafikler)
2. Üyeler: liste/filtre, detay, ekle, düzenle, aktif/pasif, şifre sıfırla, başvurular
3. Aidatlar: dönem tanımı, ödeme kaydı girme, gecikenler, toplu durum
4. Tedarikçiler: liste, başvurular, detay, onay/red, askıya alma, hizmet bölgeleri
5. Kategoriler (ağaç yapısı, alt kategori, sıralama)
6. Markalar
7. Ana ürün kataloğu + tedarikçilerin yeni ürün talepleri
8. Teklifler (tüm tedarikçi ürünleri) — inceleme, yayından kaldırma
9. Kampanyalar — onay kuyruğu, aktif/geçmiş, performans
10. Siparişler — tüm siparişler, filtre, detay (salt okunur)
11. Raporlar — üye, tedarikçi, sipariş, ürün, kategori, kampanya, aidat, reklam geliri
12. Duyurular
13. Reklam alanları & bannerlar *(Dalga 2)*
14. Sponsorlu ürünler *(Dalga 2)*
15. Paketler & ücretler (vitrin, tanıtım), ürün listeleme limitleri *(Dalga 2)*
16. Dijital kataloglar onayı *(Dalga 2)*
17. Kullanıcılar & roller & personel izinleri
18. Denetim kayıtları
19. Sistem ayarları (Oda bilgileri, aidat kuralları, bölgeler/ilçeler, sözleşme metinleri)

### 5.3 Personel Paneli (`/personel`)
Yönetici panelinin, kişiye verilen izinlere göre süzülmüş hâli: Üye başvuruları · Üyeler · Aidatlar · Tedarikçiler (salt okunur) · Siparişler (salt okunur) · Raporlar.

### 5.4 Tedarikçi Paneli (`/tedarikci`)
1. Gösterge paneli (bekleyen siparişler, bugünkü sevkiyat, düşük stok)
2. Firma profili (logo, açıklama, iletişim, yetkili, vergi/fatura bilgileri)
3. Hizmet bölgeleri (ilçe/mahalle) ve teslimat günleri, minimum sipariş tutarı
4. Ürünlerim (teklifler): liste, ekle (katalogdan seç veya yeni ürün talebi), düzenle, aktif/pasif
5. Toplu fiyat & stok güncelleme (tablo üzerinden; ileride Excel yükleme)
6. Kampanyalarım (oluştur → onaya gönder, durum takibi)
7. Siparişler: yeni / onaylanan / hazırlanan / dağıtımda / teslim / reddedilen
8. Sipariş detayı: onayla, reddet (gerekçe), durum ilerlet, fatura/irsaliye no ve belge yükleme, yazdırılabilir sevk fişi
9. Raporlar: satış tutarı, sipariş sayısı, en çok satanlar, en çok sipariş veren işletmeler, günlük/haftalık/aylık
10. Kullanıcılarım (firma çalışanları)
11. Paketler & reklam talepleri, dijital katalog *(Dalga 2)*
12. Duyurular · Bildirimler

### 5.5 Üye (Bakkal/Market) Paneli (`/magaza`)
1. **Ana sayfa**: arama, kategoriler, tedarikçiler, Odaya özel kampanyalar, indirimli ürünler, en çok tercih edilenler, yeni ürünler, sponsorlu ürünler, dijital kataloglar, duyurular
2. Kategori sayfası (filtre: marka, tedarikçi, fiyat aralığı, kampanyalı, stokta olan)
3. Arama sonuçları
4. **Ürün detay + fiyat karşılaştırma** (aynı ürünün tüm tedarikçi teklifleri tek tabloda)
5. Tedarikçiler listesi ve tedarikçi sayfası (ürünleri, iletişim, teslimat günleri, min. sipariş)
6. Kampanyalar · İndirimli ürünler
7. Favorilerim
8. **Sepetim** (tedarikçiye göre gruplu, her grupta min. tutar uyarısı)
9. Sipariş onay (adres, teslim notu, son kontrol)
10. Siparişlerim (ana sipariş → tedarikçi alt siparişleri, ayrı durum takibi)
11. Sipariş detayı (zaman çizelgesi, fatura/irsaliye bilgisi, **tekrar sipariş ver**)
12. Hesabım (işletme bilgileri, adresler, şifre, aidat durumu, KVKK tercihleri)
13. Duyurular · Bildirimler

Arayüz ilkesi: büyük dokunma alanları, sade Türkçe, en fazla 2 dokunuşla sepete ekleme, "tekrar sipariş" ile alışkanlık siparişi.

---

## 6. Veritabanı Tasarımı

### 6.1 Kritik Tasarım Kararı: Ana Ürün ↔ Tedarikçi Teklifi

"Aynı ürünün farklı tedarikçilerdeki fiyatını karşılaştırma" şartı, ürünün iki katmanda modellenmesini gerektirir:

- **`Product` (Ana ürün kataloğu)**: "Coca-Cola 1 L Pet" — barkod, marka, kategori, görsel, birim. Oda yönetir; tekil.
- **`SupplierProduct` (Teklif)**: "X Dağıtım, bu ürünü 12'li koli, koli 480 ₺, stok 200, min. 2 koli ile satıyor."

Tedarikçi ürün eklerken önce barkodla katalogda arar; yoksa **yeni ürün talebi** gönderir, yönetici onaylar (çift kayıt önlenir). Karşılaştırma ekranı bir `Product` altındaki tüm aktif `SupplierProduct`'ları listeler.

### 6.2 Tablolar

Aşağıda istenen tüm tablolar + gerekli ek tablolar yer alır. (PK: `id` — cuid; tüm tablolarda `createdAt`, `updatedAt`; para alanları `Decimal(12,2)` — kayan nokta **kullanılmaz**.)

**Kimlik ve yetki**

| Tablo | Temel alanlar | İlişkiler |
|---|---|---|
| `Chamber` | ad, il, vergiNo, iletişim, ayarlar(JSON: aidat kuralları vb.) | 1-N Users, Members, Categories… |
| `User` | email, telefon, kullanıcıAdı, passwordHash, durum(ACTIVE/PASSIVE/LOCKED), mustChangePassword, lastLoginAt, failedLoginCount | N-1 Chamber; 1-N UserRole, Session |
| `Role` | kod, ad, kapsamTürü(CHAMBER/SUPPLIER/MEMBER) | N-N Permission |
| `Permission` | kod (örn. `member.update`), açıklama | |
| `RolePermission` | roleId, permissionId | |
| `UserRole` | userId, roleId | |
| `UserPermission` | userId, permissionId, izin/engel | personele kişiye özel izin |
| `Session` | tokenHash, userId, ip, userAgent, expiresAt | |
| `PasswordResetToken` | tokenHash, userId, expiresAt, usedAt | |

**Tedarikçi**

| Tablo | Temel alanlar | İlişkiler |
|---|---|---|
| `Supplier` | unvan, ticariAd, logo, açıklama, vergiDairesi, vergiNo, mersisNo, adres, telefon, email, yetkiliAdı, durum(PENDING/APPROVED/REJECTED/SUSPENDED), minSiparişTutarı, onaylayan, onayTarihi | 1-N SupplierUser, SupplierProduct, SupplierOrder |
| `SupplierChamber` | supplierId, chamberId, durum | çoklu Oda |
| `SupplierUser` | supplierId, userId, unvan | Kullanıcı ↔ firma |
| `DeliveryArea` | supplierId, district(ilçe), neighborhood(ops.), teslimatGünleri[], minTutar(ops.) | |
| `District` | il, ilçe, (mahalle) | Bölge sözlüğü |

**Üye (bakkal/market)**

| Tablo | Temel alanlar | İlişkiler |
|---|---|---|
| `Member` | işletmeAdı, yetkiliAdı, odaSicilNo, vergiDairesi, vergiNo/TCKN (şifreli), telefon, işletmeTürü, durum(PENDING/ACTIVE/PASSIVE), duesStatus(önbellek) | N-1 Chamber; 1-N MemberUser, Address, Order |
| `MemberUser` | memberId, userId | |
| `Address` | memberId, başlık, ilçe, mahalle, açıkAdres, varsayılan | |
| `MembershipDue` | memberId, dönem(yıl-ay), tutar, vadeTarihi, ödemeTarihi, durum(UNPAID/PAID/WAIVED), kaydeden | Aidat **takibi**; tahsilat sistem dışında |

**Katalog**

| Tablo | Temel alanlar | İlişkiler |
|---|---|---|
| `Category` | ad, slug, parentId, sıra, ikon, aktif | kendine referans (ağaç) |
| `Brand` | ad, slug, logo | |
| `Product` | ad, slug, barkod(benzersiz), brandId, categoryId, birimTürü(ADET/KG/LT/PAKET), birimMiktarı(örn. 1 L), açıklama, durum(ACTIVE/PENDING/REJECTED/ARCHIVED), aramaVektörü | Ana katalog |
| `ProductImage` | productId, dosyaYolu, sıra | |
| `ProductRequest` | supplierId, önerilen bilgiler, durum | Tedarikçinin yeni ürün talebi |
| `SupplierProduct` | supplierId, productId, tedarikçiSKU, paketTipi(KOLI/ADET/KG), koliİçiAdet, birimFiyat, koliFiyatı, kdvOranı, minSiparişMiktarı, siparişArtışı(örn. 1 koli), aktif, adminTarafındanKaldırıldı, kaldırmaGerekçesi | **Teklif**; (supplierId, productId, paketTipi) benzersiz |
| `ProductPrice` | supplierProductId, fiyatTürü(LIST/CHAMBER), tutar, geçerlilikBaşlangıç/Bitiş | Fiyat geçmişi + Odaya özel fiyat |
| `Stock` | supplierProductId, miktar, rezerve, güncellemeTarihi | Satır kilidi ile güncellenir |
| `StockMovement` | supplierProductId, değişim, neden(ORDER/CANCEL/MANUAL), referans | Stok denetimi |
| `Favorite` | memberId, productId | |

**Kampanya ve indirim**

| Tablo | Temel alanlar | İlişkiler |
|---|---|---|
| `Campaign` | supplierId, başlık, açıklama, görsel, tür(CHAMBER_SPECIAL/VOLUME/DATE_RANGE), sadeceÜyeler, başlangıç, bitiş, durum(DRAFT/PENDING/APPROVED/REJECTED/ENDED), onaylayan, onayTarihi | 1-N Discount |
| `Discount` | campaignId, supplierProductId, türü(FIXED_PRICE/PERCENT/AMOUNT), değer, minMiktar (kademe: örn. 10 koli+ → %5) | Koli/adet bazlı kademeler |

**Sepet ve sipariş**

| Tablo | Temel alanlar | İlişkiler |
|---|---|---|
| `Cart` | memberId (tek aktif sepet) | |
| `CartItem` | cartId, supplierProductId, miktar, eklendiğindekiFiyat (yalnızca bilgi) | |
| `Order` | siparişNo (ET-2026-000123), memberId, adres anlık kopyası, toplamlar, oluşturan kullanıcı, idempotencyKey | Üyenin tek seferde verdiği **ana sipariş** |
| `SupplierOrder` | orderId, supplierId, altNo (ET-2026-000123-02), durum, aratoplam, kdv, indirim, toplam, teslimatTarihi, redGerekçesi, notlar | Tedarikçiye giden **alt sipariş** |
| `OrderItem` | supplierOrderId, supplierProductId, **ürün adı/barkod/paket anlık kopyası**, miktar, birimFiyat, indirim, kdvOranı, satırToplamı, uygulananKampanyaId | Fiyat anlık kopyası (sonradan fiyat değişse de sipariş bozulmaz) |
| `OrderStatusHistory` | supplierOrderId, eskiDurum, yeniDurum, değiştiren, not, zaman | Takip zaman çizelgesi |
| `Invoice` | supplierOrderId, tür(INVOICE/WAYBILL), belgeNo, tarih, tutar, dosya | Tedarikçinin kestiği belgenin **kaydı**; Oda belge kesmez |
| `Payment` *(altyapı)* | supplierOrderId, yöntem(OFFLINE/…), durum, tutar | İleride ödeme entegrasyonu için boş bekler |

**Gelir modeli (Dalga 2, tablolar baştan)**

| Tablo | Temel alanlar |
|---|---|
| `SupplierPackage` | ad, tür(SHOWCASE/PROMOTION), ürünLimiti, sponsorluHak, bannerHak, fiyat, süreGün, aktif |
| `SupplierSubscription` | supplierId, packageId, başlangıç, bitiş, durum, ödemeKaydı (sistem dışı) |
| `AdSlot` | kod (HOME_TOP, HOME_MID…), ad, boyut |
| `Advertisement` | slotId, supplierId, görsel, hedefLink, başlangıç, bitiş, durum, ücret, gösterim/tıklama sayaçları |
| `SponsoredProduct` | supplierProductId, başlangıç, bitiş, sıra, ücret |
| `Catalog` | supplierId, başlık, kategoriId, kapak, dosya/ürün listesi, yayın aralığı, durum |
| `CatalogItem` | catalogId, supplierProductId, sıra |

**Sistem**

| Tablo | Temel alanlar |
|---|---|
| `Announcement` | başlık, içerik, hedef(ALL/MEMBERS/SUPPLIERS), yayınAralığı, sabitlenmiş |
| `Notification` | userId, tür, başlık, mesaj, link, okundu, kanal(IN_APP/EMAIL/SMS), gönderimDurumu |
| `AuditLog` | userId, eylem, varlıkTürü, varlıkId, önceki/sonraki (JSON, hassas alanlar maskeli), ip, zaman — **sadece eklenebilir** |
| `ConsentRecord` | userId, metinTürü(KVKK/TERMS), sürüm, onayZamanı, ip |
| `LegalDocument` | tür, sürüm, içerik, yürürlükTarihi |
| `Setting` | chamberId, anahtar, değer |

### 6.3 İlişki Şeması (özet)

```
Chamber ─┬─< User >─< UserRole >── Role >─< RolePermission >── Permission
         │     │
         │     ├──< SupplierUser >── Supplier ─┬─< DeliveryArea
         │     │                               ├─< SupplierProduct >── Product >── Brand
         │     │                               │        │   │            └── Category (ağaç)
         │     │                               │        │   └── Stock, ProductPrice
         │     │                               │        └─< Discount >── Campaign
         │     │                               └─< SupplierOrder
         │     └──< MemberUser >── Member ─┬─< Address
         │                                 ├─< MembershipDue
         │                                 ├── Cart ─< CartItem >── SupplierProduct
         │                                 └─< Order ─< SupplierOrder ─< OrderItem
         │                                                     ├─< OrderStatusHistory
         │                                                     └─< Invoice
         └─< Announcement, AdSlot ─< Advertisement, SupplierPackage, AuditLog
```

`>─<` çoka-çok, `─<` bire-çok.

---

## 7. Sipariş Akışı

### 7.1 Sepetten Siparişe

```
 Üye                       Sistem (tek veritabanı transaction'ı)                Tedarikçiler
 ───                       ───────────────────────────────────────              ────────────
 Ürünleri sepete ekler ──► Sepet tedarikçiye göre gruplanır
 (A: 2 koli kola,           Her grup için anlık uyarı: min. tutar, min. koli,
  B: 1 koli dondurma,       stok, teslimat bölgesi
  C: 3 koli süt,
  D: 10 kg tavuk)
        │
 "Siparişi Tamamla" ─────► 1. Oturum + üyelik + aidat kontrolü
                           2. Idempotency anahtarı (çift tıklamada çift sipariş olmaz)
                           3. Her satır için GÜNCEL fiyatı yeniden hesapla
                              (liste → Odaya özel → aktif kampanya kademesi)
                              Sepetteki fiyattan farklıysa → işlemi durdur,
                              üyeye yeni fiyatı göster, onay iste
                           4. Kurallar: tedarikçi aktif mi, teklif aktif mi,
                              bölgeye teslimat var mı, min. miktar/artış,
                              tedarikçi min. sipariş tutarı
                           5. Stok düş: UPDATE stock SET qty = qty - n
                                        WHERE id = ? AND qty >= n
                              Etkilenen satır 0 ise → tüm işlem geri alınır
                           6. Order (ET-2026-000123) oluştur
                           7. Her tedarikçi için SupplierOrder oluştur
                              (…-01 A, …-02 B, …-03 C, …-04 D) + OrderItem'lar
                              (fiyat/ürün bilgisi anlık kopya)
                           8. Sepeti boşalt, AuditLog yaz
                           ── COMMIT ──
                           9. Bildirimler (transaction dışında, kuyruktan) ──► A, B, C, D
                              yalnız kendi alt siparişini görür/alır
 Onay ekranı: 1 ana sipariş, 4 alt sipariş, ayrı durumlar
```

> Kural tercihi (karar gerekli): Bir tedarikçi grubu kuralı sağlamıyorsa (ör. min. tutar altında) **tüm sipariş mi durur**, yoksa **sadece o grup sepette kalıp diğerleri mi gönderilir**? Önerim: geçersiz grup sepette kalır, geçerli gruplar sipariş olur; üyeye açıkça gösterilir.

### 7.2 Alt Sipariş Durum Makinesi

```
                 ┌──────────── Tedarikçi reddeder (gerekçe zorunlu) ─────► REDDEDİLDİ ─┐
                 │                                                                       │ stok iade
  BEKLEMEDE ─────┼──► ONAYLANDI ──► HAZIRLANIYOR ──► DAĞITIMDA ──► TESLİM EDİLDİ        │
     │           │        │               │                                              │
     │           │        └── Tedarikçi iptal (gerekçe) ──────────────► İPTAL ◄──────────┘
     └── Üye iptal (sadece BEKLEMEDE iken) ────────────────────────────► İPTAL (stok iade)
```

- Geçersiz geçiş sunucuda reddedilir (örn. TESLİM EDİLDİ → HAZIRLANIYOR).
- Her geçiş `OrderStatusHistory` + `AuditLog` + üyeye bildirim üretir.
- Ana `Order` durumu, alt siparişlerden türetilir (Tümü teslim / Kısmen teslim / Devam ediyor).
- (Karar) Tedarikçi kısmi onay yapabilsin mi (5 koli istendi, 3 koli var)? Pilotta önerim: hayır; sadece reddet + not. Dalga 2'de satır bazlı miktar düzeltme.

### 7.3 Fiyat Hesaplama Önceliği

```
Satır fiyatı = min uygulanabilir fiyat:
  1. Liste fiyatı (SupplierProduct koli/birim fiyatı)
  2. Odaya özel fiyat (ProductPrice CHAMBER, tarih içinde)
  3. Onaylı + tarihi geçerli kampanya indirimi, miktar kademesine göre
     (örn. 1–9 koli 450 ₺, 10+ koli 430 ₺)
Kampanyalar üst üste binmez; en avantajlı TEK indirim uygulanır (karar gerekli).
KDV: fiyatların KDV hariç mi dahil mi girileceği tedarikçi ile netleşmeli (önerim: KDV hariç giriş, ekranda iki tutar da gösterilir).
```

---

## 8. Panellerin Çalışma Senaryoları

**Tedarikçinin ilk günü:** Başvuru formu → yönetici inceler, onaylar → firma yetkilisine kullanıcı oluşur, ilk girişte şifre değiştirir, KVKK/sözleşme onayı → profil ve hizmet bölgelerini doldurur → katalogda barkodla arar, teklif ekler (koli fiyatı, stok, min. koli) → teklif yayında. Kampanya açmak isterse oluşturur, durum "Onay bekliyor" → yönetici onaylayınca üyelere görünür.

**Bakkalın sabah siparişi:** Oda'nın verdiği kullanıcı adıyla giriş → ana sayfada "Odaya özel" kampanyalar → "kola" arar → ürün sayfasında 3 tedarikçinin fiyat, koli içi, min. sipariş, teslimat günü tablosunu görür → en uygununu sepete ekler → süt, dondurma, tavuk ekler → sepet 4 tedarikçiye göre gruplu, eksik min. tutar uyarıları → tamamlar → "Siparişlerim"de 4 ayrı durum izler → sonraki hafta "Tekrar sipariş ver".

**Tedarikçinin sipariş günü:** "Yeni siparişler (7)" → detay: işletme, adres, ürünler → onayla → hazırlanıyor → sevk fişini yazdır → dağıtımda → teslim edildi + fatura no girer. Başka tedarikçinin siparişini hiçbir şekilde göremez.

**Oda yönetimi:** Gösterge panelinde aktif üye, günlük sipariş, tedarikçi bazlı sipariş grafikleri → kampanya onay kuyruğu → gecikmiş aidat listesi → personel aidat ödemesini işler, üyenin erişimi açılır → tüm önemli işlemler denetim kaydında.

**Personel:** Sadece kendisine tanımlı menüleri görür; doğrudan URL ile yönetici sayfasına gitse sunucu 403 döner ve deneme kaydedilir.

---

## 9. Geliştirme Aşamaları ve Tahmini İş Yükü

Tahminler tek kıdemli full-stack geliştirici için **iş günü** cinsindendir; sizden gelecek kararlara ve geri bildirim hızına göre değişir.

| Aşama | İçerik | Tahmin | Çıktı / Test |
|---|---|---|---|
| 1. Analiz & Mimari | Bu belge | 1–2 | Onaylanmış kararlar |
| 2. Temel Altyapı | Proje iskeleti, PostgreSQL + Prisma şeması (tüm tablolar), seed (roller, izinler, 16 kategori, ilk yönetici), giriş/çıkış, şifre sıfırlama, oturum, RBAC + kapsam koruması, denetim kaydı, dosya yükleme altyapısı, temel yerleşim (layout) | 6–8 | Her rolle giriş; yetkisiz erişim testleri |
| 3. Yönetici & Personel Paneli | Üye/aidat, tedarikçi başvuru/onay, kategori ağacı, marka, ana katalog + ürün talepleri, teklif denetimi, kampanya onayı, duyurular, kullanıcı/izin yönetimi, gösterge paneli ve temel raporlar | 10–12 | Servis birim testleri + E2E |
| 4. Tedarikçi Paneli | Profil, bölge/teslimat günleri, teklif ekle/düzenle, toplu fiyat-stok, kampanya talebi, sipariş durum yönetimi, fatura/irsaliye kaydı, sevk fişi, raporlar | 8–10 | Kapsam izolasyon testleri |
| 5. Üye Paneli | Ana sayfa, arama (Türkçe tam metin), filtreler, karşılaştırma, favoriler, sepet, **çok tedarikçili sipariş motoru**, takip, tekrar sipariş, hesabım, bildirimler | 12–15 | Eşzamanlı stok testi, fiyat değişim testi, çift tıklama testi |
| — **Pilot hazırlığı** | Güvenlik gözden geçirme, mobil test, yedekleme, sunucu kurulumu, kullanıcı kılavuzları, pilot veri girişi (gerçek veriler Oda/tedarikçilerden) | 5–7 | **Pilot başlar** |
| 6. Reklam & Gelir | Banner alanları, sponsorlu ürün, paketler & limitler, dijital katalog, tanıtım paketleri, reklam raporları | 8–10 | |
| 7. Test & Yayın | Tam regresyon, yük testi, sızma testi kontrol listesi, KVKK dokümantasyonu, canlıya geçiş | 5–7 | |
| **Toplam** | | **≈ 55–71 iş günü** | Pilot: ≈ 42–54 iş günü |

Her aşama sonunda: oluşturulan dosyalar, tamamlanan özellikler, test adımları ve bilinen eksikler `docs/` altında raporlanacak.

---

## 10. Güvenlik, KVKK ve Hukuki Değerlendirme

### 10.1 Güvenlik Önlemleri
- Argon2id şifre özeti; minimum şifre politikası; ilk girişte zorunlu değişiklik.
- Giriş denemesi sınırı (IP + hesap bazlı), geçici kilit, denetim kaydı.
- httpOnly + Secure + SameSite cookie; CSRF koruması; güvenlik başlıkları (CSP, HSTS).
- Tüm girdiler Zod ile doğrulanır; Prisma parametreli sorgular (SQL enjeksiyonu yok).
- Dosya yüklemede tür/boyut/içerik kontrolü, yeniden işleme, çalıştırılamaz depolama.
- Satır düzeyi kapsam kontrolü (IDOR koruması), otomatik testlerle doğrulanır.
- Uygulama veritabanına süper kullanıcı değil, yetkisi kısıtlı DB kullanıcısıyla bağlanır.
- Hassas alanlar (TCKN/VKN gibi) uygulama düzeyinde şifrelenir; loglarda maskelenir.
- Denetim kaydı: giriş, yetki değişikliği, fiyat değişikliği, sipariş durumu, onay/red, silme.
- **Yedekleme:** günlük tam `pg_dump` (şifreli, 30 gün saklama) + WAL arşivi ile anlık geri dönüş; haftalık geri yükleme testi; yedekler farklı konumda; dosya deposunun da yedeği.

### 10.2 KVKK
- Aydınlatma metni ve gerekiyorsa açık rıza kayıtları (`ConsentRecord`, sürümlü).
- Veri minimizasyonu: sadece sipariş ve üyelik için gerekli veriler.
- Saklama süreleri ve silme/anonimleştirme prosedürü (vergi mevzuatı gereği sipariş kayıtlarının saklama yükümlülüğü ayrıca değerlendirilmeli).
- İlgili kişi başvuru süreci (bilgi talebi, düzeltme, silme).
- VERBİS kaydı gerekliliği, veri sorumlusu / işleyen rolleri (Oda ↔ tedarikçi ↔ yazılım hizmet sağlayıcısı).
- Verilerin yurt içinde barındırılması (yurt dışı aktarım kurallarından kaçınmak için önerilir).

### 10.3 Hukuki ve Mali Yapı (uzman doğrulaması gerekir)
- **Rol:** Oda, aracı hizmet sağlayıcı konumunda; satış, teslimat ve faturalama tedarikçide. Bu konum sözleşmelerle netleşmeli.
- **ETBİS / 6563 sayılı Kanun:** Platformun "aracı hizmet sağlayıcı" sayılıp sayılmadığı ve ETBİS kaydı gerekliliği değerlendirilmeli.
- **Vergi:** Oda'nın reklam/paket gelirleri için faturalama yükümlülükleri; tedarikçinin e-fatura/e-irsaliye yükümlülüğü (platform sadece belge numarası kaydeder).
- **Rekabet hukuku:** Odaya özel fiyatlar ve "toplu alım" kampanyaları, tedarikçiler arası fiyat bilgisi paylaşımına veya fiyat koordinasyonuna dönüşmemeli. Tedarikçiler birbirinin fiyatlarını **göremez** (yalnızca üyeler karşılaştırır) — tasarım bu şekilde. Münhasırlık, yeniden satış fiyatı belirleme gibi hükümlerden kaçınılmalı.
- **Sözleşmeler:** Tedarikçi platform sözleşmesi, üyelik ve kullanım koşulları, reklam/paket hizmet sözleşmesi, KVKK veri işleme sözleşmeleri.
- **Oda mevzuatı:** Oda'nın bu tür ticari faaliyete ve reklam geliri elde etmeye 5362 sayılı Kanun çerçevesinde yetkili olup olmadığı ve bunun dernek/iktisadi işletme yapısıyla yürütülüp yürütülmeyeceği.

---

## 11. Eksik Noktalar ve Karar Verilmesi Gereken Konular

### A) Geliştirmeye başlamadan önce gerekenler (Aşama 2'yi etkiler)
1. **Teknoloji yığını onayı:** Next.js + PostgreSQL + Prisma + Tailwind (tek uygulama). Alternatif istenmiyor mu?
2. **Geliştirme veritabanı:** Makinede PostgreSQL 16 istemcisi var; yerel sunucu çalışıyor mu, uygulama için yeni bir veritabanı/kullanıcı oluşturabilir miyim?
3. **Proje klasörü:** Kodun kalıcı olarak duracağı klasör.

### B) İş kuralları (Aşama 3–5'i etkiler)
4. Üyelere kullanıcıyı **Oda mı oluşturacak** (önerim; kullanıcı adı = oda sicil no) yoksa üye başvurup Oda mı onaylayacak? İkisi birden mi?
5. **Aidat kuralı:** Kaç ay gecikmede erişim kısıtlanır? Kısıtlama tam engel mi, sadece sipariş engeli mi?
6. Min. tutarı sağlamayan tedarikçi grubu: **sadece o grup bekletilsin** (önerim) mi, tüm sipariş mi durdurulsun?
7. Kampanyalar üst üste binsin mi? (Önerim: hayır, en avantajlı tek indirim.)
8. Fiyatlar **KDV hariç** mi girilsin? (Önerim: evet, ekranda KDV dahil de gösterilir.)
9. Tedarikçi kısmi onay / miktar düzeltme yapabilsin mi? (Önerim: pilotta hayır.)
10. Üye sipariş iptal edebilsin mi, hangi duruma kadar? (Önerim: sadece "Beklemede".)
11. Tedarikçinin teklifi **onaysız** yayına çıksın mı, yoksa her yeni teklif yönetici onayından mı geçsin? (Önerim: katalog ürünü onaylı olduğu için teklif doğrudan yayına, yönetici sonradan kaldırabilir.)
12. Ağırlıklı ürünler (tavuk kg): sipariş kg ile, teslimatta gerçek tartıma göre fatura farkı oluşur — bu fark sistemde nasıl gösterilecek?
13. İşletme çalışanı (MEMBER_STAFF) rolü gerekli mi?
14. Giriş yapmamış ziyaretçi ne görecek? (Önerim: tanıtım sayfası, fiyatlar gizli.)

### C) Operasyon ve dış hizmetler (pilot öncesi)
15. Bildirim kanalı: e-posta yeterli mi, SMS gerekli mi (SMS sağlayıcısı ve maliyeti)? WhatsApp?
16. Alan adı, barındırma (Türkiye'de sunucu önerilir), SSL.
17. Gerçek pilot verisi: tedarikçi listesi, 30–50 ürün, barkodlar, görseller — Oda/tedarikçilerden temin edilmeli. **Sistem sahte sipariş veya satış verisi içermeyecek**; yalnızca test ortamında açıkça "TEST" etiketli örnek veri kullanılacak.
18. Logo ve kurumsal renkler (yoksa geçici bir tasarım dili hazırlanır).
19. Hukuki metinler (KVKK aydınlatma, kullanım koşulları, tedarikçi sözleşmesi) hukukçu tarafından hazırlanmalı; sistem bu metinlerin sürümlü yayınlanmasını ve onay kaydını sağlar.
20. Reklam/paket fiyatları (Dalga 2) Oda tarafından belirlenecek; sistem varsayılan bir fiyat uydurmayacak.

### D) Şartnamede bulunmayan ama önerdiğim eklemeler
- **Ana ürün kataloğu + teklif modeli** (karşılaştırmanın doğru çalışması için zorunlu).
- **Tekrar sipariş** ve "sık aldıklarım" listesi (esnaf kullanımını kolaylaştırır).
- **Yazdırılabilir sevk fişi** tedarikçi için.
- **Fiyat değişim uyarısı** sepette.
- **Çoklu Oda altyapısı** baştan.
- Stok hareket kaydı ve fiyat geçmişi.
- İleride: tedarikçi için Excel ile toplu ürün/fiyat yükleme, mobil uygulama (PWA ile başlanabilir).

---

## 12. Sonraki Adım

Bölüm 11-A'daki 3 madde netleştiğinde **Aşama 2 (Temel Altyapı)** başlar. Bölüm 11-B maddeleri için önerilen varsayılanlar kullanılacak; farklı karar verilirse ilgili aşamada uyarlanır. Aşama 2 sonunda: proje iskeleti, tam veritabanı şeması ve migration, seed, giriş sistemi ve rol bazlı yetkilendirme, bunların test adımları ve belgesi teslim edilir.
