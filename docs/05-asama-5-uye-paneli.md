# Aşama 5 — Üye (Bakkal/Market) Paneli ve Oda Raporları: Rapor

Tarih: 18.11.2026 · Durum: **Tamamlandı, testler geçiyor** · Yeni migration: yok (Aşama 1 şeması yeterli)

## 1. Tamamlanan özellikler

| Modül | Özellikler |
|---|---|
| **Ana sayfa** (`/magaza`) | Arama kutusu; Odaya özel kampanyalar; indirimli ürünler; en çok tercih edilenler (son 90 gün, Oda geneli); yeni ürünler; tedarikçiler; duyurular; aidat uyarısı; devam eden / toplam sipariş sayısı. Hepsi canlı veriden |
| **Ürünler** | Arama (ad, marka, barkod), kategori (alt kategorilerle), marka, tedarikçi, kampanyalı, stokta filtreleri; ad / yeni sıralama; sayfalama |
| **Ürün sayfası ve fiyat karşılaştırma** | Aynı ürünün tüm tedarikçi teklifleri: paket, liste fiyatı, kampanya fiyatı, kademeler, birim fiyat, KDV dahil fiyat, asgari miktar/adım, teslimat günleri, tedarikçinin ilçe asgari tutarı, stok durumu, sepetteki miktar; **en uygun** teklif işaretli; sepete ekle; favori |
| **Tedarikçiler** | Bölgeye hizmet veren tedarikçiler, teslimat günleri, asgari tutar; tedarikçi vitrini |
| **Favoriler** | Ekle/çıkar; bölgede artık satılmayan favori sayısı ayrıca belirtilir |
| **Sepet** | Tedarikçiye göre gruplu; miktar güncelleme/silme; kampanya kademesi miktara göre otomatik; satır sorunları (bölgede satışta değil, miktar kuralı, stok); **fiyat değişti** uyarısı ve onayı; tedarikçi/ilçe asgari tutarı uyarısı; adres seçimi, not, tedarikçi seçimi ile **tek tıkla sipariş** |
| **Siparişlerim** | Ana sipariş → tedarikçi alt siparişleri ve ayrı durumları; durum filtresi; detay: adres kopyası, satırlar, durum geçmişi, fatura/irsaliye kayıtları; **Beklemede iken iptal**; **tekrar sipariş** (tümü veya tek tedarikçi) |
| **Hesabım** | İşletme bilgileri, iletişim güncelleme, teslimat adresleri (ekle/düzenle/sil/varsayılan), aidat durumu, kullanıcı bilgileri |
| **Bildirimler** | Sipariş durum değişiklikleri; üst çubukta okunmamış sayısı |
| **Oda raporları** (`/yonetim/raporlar`, `/personel/raporlar`) | Tarih aralığı, gün/hafta/ay; sipariş sayısı, satış (KDV dahil), net satış, kampanya indirimi, sipariş veren üye oranı; satış grafiği; durum dağılımı; en çok satan tedarikçi / üye / ürün / kategori |

## 2. İş kuralları (servis katmanında, testlerle doğrulandı)

- **Görünürlük (tek kural, her yerde):** aktif ürün + aktif ve Oda tarafından kaldırılmamış teklif + onaylı, bu Odada aktif tedarikçi + üyenin **varsayılan teslimat adresinin ilçesine** hizmet veren tedarikçi. Adresi olmayan üye ürün göremez. Tedarikçi askıya alınınca teklifleri anında gizlenir.
- **Fiyat motoru** (`src/modules/pricing/engine.ts`): liste fiyatı → yalnızca Oda onaylı ve tarihi geçerli kampanyaların kademeleri (`minQty`) → **en avantajlı tek indirim** (kampanyalar üst üste binmez). Kuruş yuvarlaması Decimal ile; kayan nokta yok. Sepet, ürün sayfası ve sipariş aynı fonksiyonu kullanır.
- **Miktar kuralları:** asgari miktar, artış adımının katları, koli/adet/paket için tam sayı.
- **Sipariş motoru** (`src/modules/orders/member.ts`, tek transaction):
  - Aidat engeli güncel veriden hesaplanır (oturumdaki önbelleğe güvenilmez).
  - **Idempotency:** formda üretilen anahtar benzersiz; çift tıklama veya yeniden gönderimde aynı sipariş döner, ikinci sipariş açılmaz (eşzamanlı istekte de).
  - Aynı üyenin eşzamanlı siparişleri sepet satırı kilidiyle sıraya girer.
  - Sepet transaction içinde yeniden değerlendirilir; **fiyat değiştiyse sipariş durur** ve onay istenir.
  - Asgari tutarı (ilçe tutarı, yoksa firma tutarı; KDV hariç, indirim sonrası) tutmayan tedarikçi grubu **sepette kalır**, diğerleri sipariş olur.
  - Numara `ET-YYYY-NNNNNN` (`OrderSequence` yıl satırı kilitlenerek), alt siparişler `-01`, `-02`…
  - Satırların anlık kopyası (ad, marka, barkod, paket, liste ve uygulanan fiyat, KDV, kampanya) ve adres kopyası `{title, district, city, neighborhood?, line, contactName, phone}`.
  - **Koşullu stok düşümü** (`UPDATE … WHERE quantity >= n`), satırlar kimlik sırasıyla (kilitlenme önlenir); stok yetmezse tüm sipariş geri alınır. Stok hareketi yazılır.
  - Sipariş edilen satırlar sepetten silinir; her tedarikçiye bildirim; denetim kaydı.
- **İptal:** yalnızca "Beklemede" iken, iyimser kilitle; stok iade + hareket + durum geçmişi + tedarikçiye bildirim.
- **Tekrar sipariş:** güncel fiyatla, hâlâ satışta olan tekliflerle; miktar kurala uydurulur, stok yetmeyen atlanır.
- **Üye izolasyonu:** sipariş, sepet satırı, adres ve favori işlemleri yalnızca kendi kaydında; başkasınınki 404.
- **Raporlar:** yalnızca `report.view` izni olan Oda kullanıcıları; tedarikçi ve üye erişemez.

## 3. Oluşturulan dosyalar

- **Servisler:** `src/modules/pricing/engine.ts`, `src/modules/shop/{context,catalog,cart,favorites}.ts`, `src/modules/orders/member.ts`, `src/modules/members/self.ts`, `src/modules/reports/admin.ts`
- **Sunucu işlemleri:** `src/actions/member.ts`
- **Altyapı:** `src/lib/auth/member-page.ts` (sayfa koruması + menü), mağaza menüsünde sepet sayısı, Oda menüsüne "Raporlar"
- **Sayfalar:** `src/app/magaza/**`, `src/app/{yonetim,personel}/raporlar`, `src/components/shop/*`
- **Testler:** `tests/unit/pricing.test.ts`, `tests/integration/member.test.ts`, `tests/e2e/{shop-catalog,shop-orders,account-reports}.test.ts`

## 4. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| `typecheck` / `lint` / `build` | ✅ hatasız |
| Birim + servis testleri (`npm test`) | ✅ **97/97** (yeni: fiyat motoru 6, üye paneli 22) |
| Uçtan uca testler (`npm run test:e2e`) | ✅ **110/110** (yeni: katalog 9, sepet/sipariş 9, hesabım/raporlar 6) |
| **Toplam** | ✅ **207/207** |
| Tarayıcı | ✅ `test.uye-1` → ürün arama → karşılaştırma → A'dan 3 koli (kampanya kademesi 1.500 → 1.380 ₺), B'den 1 koli → sepet (2 grup) → sipariş: `ET-2026-000017` (-01, -02), tutarlar elle doğrulandı (ara toplam 5.950, indirim 360, KDV 1.118, genel 6.708 ₺); mobil görünüm |

Aşama planındaki zorunlu testler: **eşzamanlı stok** (son 5 koliye iki üye aynı anda 3'er koli → biri geçer, stok 2 kalır), **fiyat değişimi** (sipariş durur, stok değişmez, onaydan sonra geçer), **çift tıklama** (aynı anahtarla eşzamanlı iki istek → tek sipariş, stok bir kez düşer) — hepsi geçiyor.

## 4.1 Bilinen eksikler / sonraki adımlar

- Arama `contains` + Türkçe sıralama ile yapılıyor (pilot ölçeği için yeterli). Ürün sayısı binleri aşarsa PostgreSQL tam metin (Türkçe sözlük + `unaccent`) eklenebilir.
- Fiyata göre sıralama yok (fiyat kampanyaya ve miktara bağlı hesaplandığı için); ad / yeni sıralama var.
- E-posta/SMS bildirimleri sağlayıcı seçilince eklenecek (şu an panel içi).
- Odaya özel fiyat tablosu (`ProductPrice` tipi `CHAMBER`) kullanılmıyor; Odaya özel fiyatlar kampanya (`CHAMBER_SPECIAL`) ile veriliyor.

## 5. Nasıl test edilir

1. `test.tedarikci-a` ile girin → **Hizmet Bölgeleri**'nden bir ilçe ekleyin, **Ürünlerim**'den ürün satışa açın.
2. `test.uye-1` ile girin → **Hesabım**'dan aynı ilçede bir teslimat adresi ekleyin.
3. **Ürünler**'de ürünü bulun, karşılaştırma tablosundan sepete ekleyin → **Sepetim** → **Siparişi ver**.
4. Tedarikçi panelinde sipariş görünür; onaylayın → üyenin bildirimlerinde ve sipariş detayında durum güncellenir.
5. `test.yonetici` → **Raporlar**.
