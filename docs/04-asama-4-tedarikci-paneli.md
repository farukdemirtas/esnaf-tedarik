# Aşama 4 — Tedarikçi Paneli: Rapor

Tarih: 18.11.2026 · Durum: **Tamamlandı, testler geçiyor** · Yeni migration: `turkish_collation`

## 1. Tamamlanan özellikler

| Modül | Özellikler |
|---|---|
| **Gösterge paneli** | Onay bekleyen / açık / bugünkü sipariş, satıştaki ürün, stoğu azalan ürün, onay bekleyen kampanya; gerçek verilere dayalı "Başlarken" adımları (bölge, ilk ürün, logo); son siparişler; Oda duyuruları |
| **Siparişler** | Durum sekmeleri ve sayılar, arama, detay; **onayla** (planlanan teslim tarihiyle), **hazırlanıyor**, **dağıtımda**, **teslim edildi**, **reddet / iptal** (gerekçe zorunlu, stok otomatik iade); tedarikçi notu; fatura/irsaliye kaydı (belge no, tarih, tutar, PDF/görsel); yazdırılabilir **sevk fişi**; her değişiklikte üyeye bildirim |
| **Ürünlerim** | Katalogda arama → ürünü kendi paketi/fiyatı/stoğuyla satışa açma; liste ve filtreler (satışta, kapalı, Oda kaldırdı, stoğu azalan); ürün detayı: fiyat-stok, satış bilgileri, **fiyat geçmişi**, **stok hareketleri** |
| **Toplu fiyat ve stok** | Tüm ürünler tek tabloda; yalnızca değişen satırlar kaydedilir; hatalı satır varsa hiçbiri kaydedilmez ve hatalar ilgili hücrede gösterilir |
| **Yeni ürün talepleri** | Katalogda olmayan ürün için talep (görselle); aynı barkod katalogda varsa uyarı; durum ve Oda notu; onaylanınca "Fiyat girin" bağlantısı |
| **Kampanyalarım** | Taslak → indirimli ürünler (kampanya fiyatı / % / ₺ indirim, **kademeli toplu alım**) → Oda onayına gönder → geri çek / sil / erken bitir; kampanya fiyatı önizlemesi |
| **Raporlar** | Tarih aralığı, günlük/haftalık/aylık satış grafiği, durum dağılımı, en çok satan ürünler, en çok sipariş veren işletmeler |
| **Firma profili** | Görünen ad, tanıtım, iletişim, yetkili, minimum sipariş tutarı, logo. Unvan ve vergi bilgileri yalnızca Oda tarafından değiştirilir |
| **Hizmet bölgeleri** | İlçe + teslimat günleri + ilçeye özel asgari tutar; "tüm ilçelere aynı günlerle" hızlı kurulum |
| **Kullanıcılar** | Firma yetkilisi çalışan ekler (yetkili / çalışan), pasife alır, geçici şifre verir |
| **Bildirimler** | Üst çubukta okunmamış sayısıyla zil; liste, okundu işaretleme |

## 2. İş kuralları (servis katmanında, testlerle doğrulandı)

- **Firma izolasyonu:** Her sorgu oturumdaki firmayla sınırlı. B firması A'nın ürün, sipariş, kampanya, kullanıcı ve sevk fişine erişemez (404).
- **Çalışan rolü:** Siparişleri görür ve işler; fiyat/stok değiştiremez, ürün ekleyemez, kampanya ve rapor göremez.
- **Sipariş durum makinesi:** Yalnızca izin verilen geçişler yapılabilir. Aynı anda gelen iki değişiklikten yalnızca biri uygulanır (iyimser kilit). Red/iptalde stok iade edilir ve stok hareketine yazılır.
- **Stok:** Fiyat/stok güncellemesinde stok satırı kilitlenir (`SELECT … FOR UPDATE`); Aşama 5'te sipariş sırasında yapılacak stok düşümüyle çakışmaz.
- **Teklif tutarlılığı:** Adet/kg satışta paket içi adet 1; koli/adet/paket satışta miktarlar tam sayı, kg'da küsurat serbest; fiyat > 0; KDV %0/%1/%10/%20.
- **Kampanya:** Kampanya fiyatı normal fiyattan düşük, yüzde < 100; aynı ürün için aynı kademe iki kez eklenemez; onay bekleyen kampanya düzenlenemez; siparişte kullanılmış kampanya silinemez.
- Tüm fiyatlar **KDV hariç** girilir; ekranlarda KDV dahil tutar da gösterilir.

## 3. Ek düzeltme: Türkçe alfabetik sıralama

Tarayıcı testinde ilçe listesinde "Çarşamba" ve "İlkadım"ın en sona düştüğü görüldü. Ad alanlarına (ilçe, üye, firma, ürün, marka, kategori, kullanıcı, kampanya) **ICU Türkçe sıralama kuralı** atayan bir migration eklendi; artık veritabanının yerel ayarından bağımsız olarak doğru sıralanıyor.

> **Kurulum notu:** Sütun türü değiştiren bir migration uygulandıktan sonra uygulama sunucusu **yeniden başlatılmalıdır**. Başlatılmazsa açık bağlantılardaki hazır sorgu planları "cached plan must not change result type" hatası verir. (Bu durum testte görüldü, yeniden başlatmayla çözüldü; Aşama 7 yayın prosedürüne eklenecek.)

## 4. Oluşturulan dosyalar

- **Servisler:** `src/modules/suppliers/self.ts`, `catalog/offers-supplier.ts`, `campaigns/supplier.ts`, `orders/supplier.ts`, `reports/supplier.ts`, `notifications/inbox.ts`
- **Sunucu işlemleri:** `src/actions/supplier.ts`
- **Altyapı:** `src/lib/auth/supplier-page.ts` (sayfa koruması + menü), `PanelShell`'e bildirim zili, `UserError`'a çoklu alan hatası
- **Sayfalar:** `src/app/tedarikci/**` (14 sayfa), `src/app/yazdir/sevk-fisi/[id]`, `src/components/notifications-list.tsx`
- **Migration:** `prisma/migrations/…_turkish_collation`
- **Testler:** `tests/integration/supplier.test.ts` (18), `tests/e2e/supplier-pages.test.ts` (30)

## 5. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| `typecheck` / `lint` / `build` | ✅ hatasız |
| Tüm test paketi (`npx vitest run`) | ✅ **155/155** (birim, servis, uçtan uca) |
| Tarayıcı | ✅ Tedarikçi B girişi → hizmet bölgesi: gün seçmeden kaydetmede alan uyarısı, seçince kayıt ve tabloda gösterim; mobil görünüm |

Siparişler henüz üye tarafından verilemediği için (Aşama 5), sipariş işleme testleri siparişler veritabanına doğrudan oluşturularak yapıldı.

## 6. Nasıl test edilir

1. `test.yonetici` ile **Ürün Kataloğu**'na bir ürün ekleyin.
2. `test.tedarikci-a` ile girin → **Hizmet Bölgeleri** → ilçe ve gün seçin.
3. **Ürünlerim → Yeni ürün ekle** → ürünü arayın → paket, fiyat, stok girin.
4. **Kampanyalarım** → yeni kampanya → indirimli ürün ekleyin → onaya gönderin → `test.yonetici` ile onaylayın.
5. `test.tedarikci-a-calisan` ile girip fiyat sayfalarına erişilemediğini görün.

## 7. Bilinen eksikler / sonraki aşamalar

- Üyenin sipariş vermesi, sepet ve sipariş takibi **Aşama 5**'te; tedarikçi sipariş ekranları o zaman gerçek siparişlerle dolacak.
- Kampanya ürün seçiminde ve toplu fiyat sayfasında sayfa başına 50 ürün gösterilir (pilot için yeterli; büyüyünce arama eklenecek).
- Ürün detayındaki "KDV dahil" önizlemesi yazarken değil, kaydedince güncellenir.
- Fatura dosyası için sınır 5 MB (sunucu işlemi gövde sınırı).
- Excel ile toplu ürün/fiyat yükleme Dalga 2.
- E-posta/SMS bildirimi sağlayıcı seçilince eklenecek; şu an panel içi bildirim.
- Proje henüz git'e commit edilmedi.

## 8. Sıradaki: Aşama 5 — Üye (Bakkal/Market) Paneli

Ana sayfa (kampanyalar, indirimli ürünler, yeni ürünler, tedarikçiler), kategori ve arama, **fiyat karşılaştırma**, favoriler, tedarikçiye göre gruplu **sepet**, **çok tedarikçili sipariş motoru** (fiyat yeniden doğrulama, minimum tutar, stok düşümü, sipariş bölme), sipariş takibi, tekrar sipariş, hesabım, bildirimler; ardından yönetici raporları ve grafikleri.
