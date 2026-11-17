# Aşama 3 — Yönetici ve Personel Paneli: Rapor

Tarih: 17.11.2026 · Durum: **Tamamlandı, testler geçiyor** · Veritabanı şeması değişmedi (yeni migration yok)

## 1. Tamamlanan özellikler

| Modül | Özellikler |
|---|---|
| **Üyeler** | Liste (arama, durum filtresi, gecikmiş aidat rozeti), yeni üye (hesap + geçici şifre), düzenleme, başvuru onayı/reddi, aktif/pasif (pasifte oturumlar anında kapanır), geçici şifre verme, şifre yenileme bağlantısı, teslimat adresleri (ekle/sil/varsayılan) |
| **Aidatlar** | Dönem aidatı oluşturma (tüm aktif üyeler, tekrar çalıştırmada atlanır), üye bazında kayıt ekleme, ödendi / muaf / geri al / sil, gecikmiş üye listesi ve "Sipariş kapalı" uyarısı, filtre ve toplamlar |
| **Tedarikçiler** | Liste, yeni tedarikçi (onaylı + yetkili hesabı), düzenleme, başvuru onayı/reddi, askıya alma (gerekçe zorunlu, oturumlar kapanır), firma kullanıcısı ekleme (yetkili / çalışan), şifre sıfırlama, kullanıcı aktif/pasif, hizmet bölgeleri görüntüleme |
| **Kategoriler** | Ağaç yapısı, alt kategori, sıra, aktif/pasif, döngü engeli, dolu kategori silinemez |
| **Markalar** | Ekle / düzenle / sil (ürünü olan silinemez), büyük-küçük harf duyarsız tekillik |
| **Ürün kataloğu** | Liste ve filtreler, ürün ekleme/düzenleme, barkod tekilliği, görsel yükleme (içerik imzası kontrolü, en fazla 6 görsel), ürüne ait tüm tedarikçi tekliflerinin görünümü |
| **Ürün talepleri** | Tedarikçinin yeni ürün talebini onaylama (aynı barkod varsa mevcut ürüne bağlanır, yoksa ürün + gerekirse marka oluşturulur) veya gerekçeyle reddetme; tedarikçiye bildirim |
| **Tedarikçi teklifleri** | Tüm fiyat/stok ilanları, filtreler, gerekçeli yayından kaldırma ve geri alma; tedarikçiye bildirim |
| **Kampanyalar** | Onay kuyruğu, detay (indirimli ürünler ve kademeler), onay (bitiş tarihi ve ürün kontrolü), red, ana sayfada öne çıkarma, sonlandırma; tedarikçiye bildirim |
| **Siparişler** | Salt okunur liste ve detay (filtre, toplam tutar, durum geçmişi, fatura/irsaliye). Sipariş verildikçe dolacak (Aşama 5) |
| **Duyurular** | Oluştur / düzenle / sil, hedef kitle, sabitleme, zamanlı yayın ve bitiş |
| **Kullanıcılar ve yetkiler** | Tüm kullanıcılar, Oda kullanıcısı oluşturma, profil, aktif/pasif, kilit açma, geçici şifre, **kişiye özel izin tablosu** (rolden / ver / kaldır) |
| **Denetim kayıtları** | Filtrelenebilir kayıt listesi (işlem, kullanıcı, kayıt türü, tarih), Türkçe işlem adları, ayrıntı verisi |
| **Ayarlar** | Oda bilgileri, aidat engel eşiği |
| **Personel paneli** | Yönetici sayfalarını aynen kullanır; menü ve sayfalar kişinin izinlerine göre süzülür |
| **Başvuru formları** | Herkese açık üyelik ve tedarikçi başvurusu (KVKK onayı, bot tuzağı, IP başına saatte 5 başvuru sınırı), KVKK sayfası (**taslak**), giriş sayfasından bağlantı |

## 2. Güvenlik kuralları (servis katmanında, testlerle doğrulandı)

- Her işlem önce izni, sonra Oda kapsamını kontrol eder; buton gizlemek yeterli sayılmaz.
- **Yetki yükseltme engeli:** Kimse kendi iznini değiştiremez, sahip olmadığı izni başkasına veremez. Yönetici hesaplarına yalnızca yöneticiler dokunabilir. Panel izinleri kişiye özel verilemez.
- İzin değiştiğinde, hesap pasife alındığında veya firma askıya alındığında ilgili açık oturumlar anında kapanır.
- Geçici şifreler ve sıfırlama bağlantıları yalnızca bir kez, işlemi yapan kişiye gösterilir; veritabanında yalnızca özetleri tutulur.
- Vergi / TC kimlik no şifreli saklanır, ekranda maskeli gösterilir (`123******01`).
- Tüm değişiklikler denetim kaydına yazılır; hassas alanlar maskelenir.

## 3. Oluşturulan dosyalar

- **Altyapı:** `src/lib/validation.ts` (Türkçe doğrulama mesajları, para/tarih/telefon/vergi no alanları), `src/lib/action.ts` + `action-types.ts` (sunucu işlemi çalıştırıcı, hata → Türkçe mesaj), `src/lib/errors.ts`, `src/lib/format.ts`, `src/lib/slug.ts`, `src/lib/auth/assert.ts`, `src/lib/auth/oda.ts`
- **Arayüz bileşenleri:** `src/components/form/index.tsx` (form, alan hataları, tek seferlik şifre kutusu), `src/components/panel/ui.tsx` (tablo, filtre, sayfalama, rozet), `src/components/oda/*` (ortak form alanları), `src/components/public-shell.tsx`
- **Servisler:** `src/modules/members/{service,dues-admin}.ts`, `suppliers/service.ts`, `catalog/{taxonomy,products,offers-admin}.ts`, `campaigns/review.ts`, `announcements/service.ts`, `users/{service,accounts}.ts`, `admin/service.ts`, `applications/service.ts`, `notifications/service.ts`
- **Sunucu işlemleri:** `src/actions/oda.ts`, `src/actions/public.ts`
- **Sayfalar:** `src/app/yonetim/**` (25 sayfa), `src/app/personel/**` (aynı sayfalara yönlendirme), `src/app/basvuru/**`, `src/app/kvkk`
- **Testler:** `tests/integration/oda.test.ts` (17), `tests/e2e/oda-pages.test.ts` (36)

## 4. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm run build` | ✅ hatasız |
| Birim + servis testleri | ✅ 51/51 |
| Uçtan uca testler (gerçek sunucu, test veritabanı) | ✅ 56/56 |
| Tarayıcı | ✅ Yönetici girişi → yeni üye formu: hatalı telefonda alan altında Türkçe hata, girilen bilgiler korunuyor; düzeltilince kayıt + tek seferlik geçici şifre + kayda bağlantı; üye detay sayfası |

Uçtan uca testlerin doğruladıkları: yönetici sayfalarının 18'i ve detay sayfaları açılıyor; personel izinli sayfalara giriyor, kullanıcı/ayarlar/kategori/denetim/yeni üye/kampanya sayfalarında `/yetkisiz`'e yönlendiriliyor; personel menüsünde yönetici bölümleri görünmüyor; tedarikçi Oda sayfalarına giremiyor; başvuru ve KVKK sayfaları herkese açık.

## 5. Nasıl test edilir

```bash
npm run dev      # http://localhost:3000
```

- `test.yonetici` ile girip tüm menüleri deneyin; `test.personel` ile girip menünün kısıtlı olduğunu görün.
- `/basvuru` adresinden üye veya tedarikçi başvurusu yapın → yönetici panelinde "Başvuru" filtresiyle bulun → onaylayın → çıkan geçici şifreyle giriş yapın.
- Kullanıcılar → `test.personel` → izin tablosunda "Aidat kaydı girme" iznini **Kaldır** yapın → personelin oturumu kapanır, yeniden girişte aidat işlemleri görünmez.

## 6. Bilinen eksikler / sonraki aşamalara kalanlar

- **Grafikli raporlar** (satış, en çok satan ürün/kategori, kampanya performansı) sipariş verisi oluştuktan sonra, Aşama 5 sonunda eklenecek. Gösterge paneli şimdilik canlı sayıları gösteriyor.
- **Reklam, banner, paket ve dijital katalog yönetimi** Aşama 6'da.
- **Bildirimler** veritabanına yazılıyor; panelde bildirim ekranı Aşama 4–5'te. E-posta/SMS sağlayıcısı henüz seçilmedi.
- **KVKK metni taslak**; hukukçu tarafından hazırlanmalı.
- Rol bazında izin düzenleme ekranı yok (bilinçli tercih); izinler kişiye özel olarak verilir/kaldırılır.
- Yönetici, kendisinde olmayan bir izni başka bir kullanıcıda gördüğünde o satırda "Ver" seçeneği kapalıdır; kaydederse o izin "Rolden gelsin"e döner (ekranda uyarı var).
- Denetim kayıtları uygulama içinden değiştirilemez; veritabanı düzeyinde koruma (UPDATE/DELETE yetkisinin kaldırılması) Aşama 7'de.
- Sipariş ekranındaki teslimat adresi alanları, sipariş oluşturma (Aşama 5) yazıldığında netleşecek.
- Tedarikçi filtre listeleri ilk 25 firmayı gösterir (pilot için 5–10 firma yeterli; büyüyünce aramalı seçime geçilecek).
- Proje henüz git'e commit edilmedi.

## 7. Sıradaki: Aşama 4 — Tedarikçi Paneli

Firma profili ve logo, hizmet bölgeleri ve teslimat günleri, katalogdan ürün seçip teklif girme / yeni ürün talebi, toplu fiyat-stok güncelleme, kampanya oluşturma, sipariş yönetimi (onay, red, hazırlanıyor, dağıtımda, teslim, fatura/irsaliye), firma raporları, bildirimler.
