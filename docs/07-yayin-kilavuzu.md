# Aşama 7 — Yayın Kılavuzu, Güvenlik Kontrol Listesi ve Son Durum

Tarih: 18.11.2026 · Bu belge sunucu kurulumu, yedekleme, güncelleme ve canlıya geçiş adımlarını içerir.

## 1. Sunucu gereksinimleri (pilot: 20–30 bakkal, 5–10 tedarikçi)

- Ubuntu 24.04, 2 vCPU, 4 GB RAM, 40 GB SSD (Türkiye'de barındırma — KVKK açısından önerilir)
- Docker + Docker Compose eklentisi, Nginx, Certbot
- Bir alan adı (ör. `tedarik.samsunbakkallar.org.tr`)

## 2. İlk kurulum

```bash
git clone <depo> /opt/esnaf-tedarik && cd /opt/esnaf-tedarik
cp .env.production.example .env.production   # şifre, DATA_ENCRYPTION_KEY, APP_URL doldurun
docker compose --env-file .env.production up -d --build
docker compose run --rm app npx tsx prisma/seed.ts   # izinler, roller, Oda, kategoriler, ilçeler, ilk yönetici
```

Seed, `admin` kullanıcısının **geçici şifresini bir kez** ekrana yazar; ilk girişte değiştirilir.

> ⚠️ `DATA_ENCRYPTION_KEY` kaybolursa şifreli alanlar (üye VKN/TCKN) çözülemez. Anahtarı şifre kasasında saklayın.
> ⚠️ Canlıda `SEED_TEST_USERS` ve `npm run db:demo` **kullanılmaz** (demo yükleyici `NODE_ENV=production` iken çalışmaz).

Nginx: `deploy/nginx.conf` dosyasını `/etc/nginx/sites-available/` altına kopyalayın, alan adını değiştirin, `snippets/esnaf-proxy.conf` dosyasını oluşturun, `certbot --nginx -d <alan adı>` çalıştırın.

## 3. Bileşenler

| Servis | Görev |
|---|---|
| `db` | PostgreSQL 16 (ICU Türkçe sıralama) |
| `migrate` | Her başlatmada bekleyen migration'ları uygular, sonra kapanır |
| `app` | Web uygulaması (yalnızca 127.0.0.1:3000; dışarıya Nginx açar). `/api/health` sağlık kontrolü |
| `worker` | E-posta bildirimlerini gönderir; süresi dolan kampanya, banner, paket ve oturumları kapatır (30 sn) |

## 4. E-posta (isteğe bağlı)

`.env.production` içinde `SMTP_URL` ve `MAIL_FROM` doldurulursa:
- Tüm bildirimler (yeni sipariş, durum değişikliği, onay/red…) ayrıca e-postayla gönderilir. Adres: kullanıcının e-postası → üye/tedarikçi firmanın e-postası.
- **Şifremi unuttum** sayfası kendi kendine sıfırlama formuna dönüşür (IP başına 15 dakikada 5 talep; kullanıcının var olup olmadığı ifşa edilmez).

Doldurulmazsa sistem panel içi bildirimlerle çalışır, şifre sıfırlamayı Oda yapar. SMS için sağlayıcı seçildiğinde aynı kuyruk yapısına (`Notification.channel = SMS`) bir gönderici eklenir.

## 5. Yedekleme ve geri yükleme

```bash
crontab -e
15 3 * * * /opt/esnaf-tedarik/deploy/backup.sh >> /var/log/esnaf-backup.log 2>&1
```

Veritabanı (`pg_dump` özel biçim) ve yüklenen dosyalar (`tar.gz`) 14 gün saklanır. **Yedekleri sunucu dışına da kopyalayın.** Geri yükleme komutları betiğin sonunda yazılıdır; geliştirme ortamında yedek alınıp boş veritabanına geri yüklenerek doğrulandı.

## 6. Güncelleme

```bash
cd /opt/esnaf-tedarik && git pull
./deploy/backup.sh                      # önce yedek
docker compose --env-file .env.production up -d --build   # migrate servisi migration'ları uygular, app/worker yeniden başlar
```

Sütun türü değiştiren migration'dan sonra `app` mutlaka yeniden başlamalıdır (yukarıdaki komut bunu yapar).

## 7. Güvenlik kontrol listesi

| Kontrol | Durum |
|---|---|
| Şifreler Argon2id; politika (en az 10 karakter, harf+rakam); ilk girişte zorunlu değişim | ✅ |
| Kaba kuvvet: kullanıcı başına 5 hatada 15 dk kilit, IP başına sınır; Nginx'te ek hız sınırı | ✅ |
| Oturum veritabanında, `HttpOnly` + `Secure` + `SameSite` çerez; şifre değişince diğer oturumlar kapanır | ✅ |
| CSRF: oturum API'lerinde köken kontrolü, sunucu işlemlerinde Next.js koruması | ✅ |
| Rol + izin + satır kapsamı (firma/üye izolasyonu) servis katmanında; tüm modüller için testli | ✅ |
| Güvenlik başlıkları: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy | ✅ |
| Dosya yükleme: içerik imzasıyla tür kontrolü, boyut sınırı, rastgele ad, web kökü dışında, yalnızca girişli kullanıcıya | ✅ |
| Hassas alan şifreleme (VKN/TCKN, AES-256-GCM); denetim kaydında maskeleme | ✅ |
| Açık yönlendirme: banner hedefi yalnızca `/magaza…` | ✅ |
| Denetim kaydı (yalnızca eklenir) | ✅ |
| Bağımlılık taraması: `npm audit --omit=dev` | Yayın öncesi çalıştırın |
| Dış sızma testi (bağımsız firma) | Canlı öncesi önerilir |

## 8. KVKK

- Aydınlatma metni `/kvkk` sayfasındadır; başvuru formlarında açık onay alınır. **Metnin son hali Oda hukuk danışmanınca onaylanmalıdır.**
- Kişisel veriler Türkiye'de barındırılmalı; yedekler şifreli ortamda saklanmalı.
- Kayıt silme/anonimleştirme talepleri Oda yöneticisi tarafından denetim kaydıyla yürütülür.

## 9. Canlıya geçiş adımları

1. Sunucu kurulumu, HTTPS, yedekleme cron'u, sunucu dışı yedek kopyası
2. `admin` ile giriş → Oda bilgileri ve ayarlar (aidat kuralı, varsayılan ürün limiti)
3. Oda personeli hesapları, gerçek üye ve tedarikçi kayıtları (veya başvuru formları)
4. Tedarikçilere eğitim: hizmet bölgeleri, ürün ve fiyat girişi (`docs/kilavuz-tedarikci.md`)
5. Üyelere eğitim (`docs/kilavuz-uye.md`), pilot başlangıcı
6. İlk hafta: günlük yedek kontrolü, `/yonetim/denetim` ve sunucu günlüklerinin izlenmesi

## 10. Bilinen sınırlar / sonraki geliştirmeler

- SMS bildirimi: sağlayıcı seçimi bekleniyor (kuyruk altyapısı hazır).
- Dosyalar sunucu diskinde (yedeklenir). Çok sunuculu yapıya geçilirse S3 uyumlu depolama sürücüsü eklenmeli (`src/lib/storage.ts` tek giriş noktasıdır).
- Kısmi sipariş onayı (tedarikçinin miktar düşürmesi) pilot sonrasına bırakıldı.
- Arama `contains` tabanlı; ürün sayısı binleri aşarsa PostgreSQL tam metin araması eklenebilir.

## 11. Bu aşamada eklenen kod

- E-posta bildirim altyapısı (SMTP, kuyruk + işçi), e-postayla şifre sıfırlama: `src/lib/mailer.ts`, `src/modules/notifications/dispatch.ts`, `scripts/worker.ts`, `src/app/api/auth/forgot-password`
- Sağlık kontrolü `src/app/api/health`; ürünlerde "En düşük birim fiyat" sıralaması; Oda rapor tablolarının dar ekranda kırpılması düzeltildi
- Yayın dosyaları: `Dockerfile`, `docker-compose.yml`, `.env.production.example`, `deploy/nginx.conf`, `deploy/backup.sh`
- Kullanıcı kılavuzları: `docs/kilavuz-uye.md`, `docs/kilavuz-tedarikci.md`, `docs/kilavuz-oda.md`

## 12. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| `typecheck` / `lint` / `build` | ✅ hatasız |
| Birim + servis testleri | ✅ **110/110** (yeni: e-posta kuyruğu, şifre sıfırlama ve hız sınırı, fiyat sıralaması) |
| Uçtan uca testler | ✅ **139/139** |
| Yedekleme | ✅ `backup.sh` ile alınan yedek boş veritabanına geri yüklendi, veriler eksiksiz |
| İşçi | ✅ `npm run worker -- --once` |
| Docker imajı | ⚠️ Geliştirme ortamında derleme kapsayıcısı internete çıkamadığı için doğrulanamadı; ilk kurulumda kontrol edin |
