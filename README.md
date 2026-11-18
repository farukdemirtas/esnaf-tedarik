# ESNAF TEDARİK

**Ortak Güç, Ortak Kazanç** — Esnaf odası bünyesinde çok satıcılı dijital toptan tedarik platformu.

Next.js 15 · TypeScript · PostgreSQL 16 · Prisma · Tailwind CSS · Zod · Argon2id

## Belgeler

- [docs/01-analiz-ve-mimari.md](docs/01-analiz-ve-mimari.md) — Analiz, mimari, roller, veritabanı, sipariş akışı
- [docs/02-asama-2-temel-altyapi.md](docs/02-asama-2-temel-altyapi.md) — Aşama 2 raporu: tamamlananlar, testler, eksikler
- [docs/03-asama-3-yonetim-paneli.md](docs/03-asama-3-yonetim-paneli.md) — Aşama 3 raporu: yönetici ve personel paneli
- [docs/04-asama-4-tedarikci-paneli.md](docs/04-asama-4-tedarikci-paneli.md) — Aşama 4 raporu: tedarikçi paneli
- [docs/05-asama-5-uye-paneli.md](docs/05-asama-5-uye-paneli.md) — Aşama 5 raporu: üye paneli, sepet, sipariş motoru, Oda raporları
- [docs/06-asama-6-gelir-modeli.md](docs/06-asama-6-gelir-modeli.md) — Aşama 6 raporu: paketler, reklam, sponsorlu ürün, dijital katalog, demo verisi
- [docs/07-yayin-kilavuzu.md](docs/07-yayin-kilavuzu.md) — Sunucu kurulumu, yedekleme, güncelleme, güvenlik kontrol listesi, canlıya geçiş
- Kullanıcı kılavuzları: [üye](docs/kilavuz-uye.md) · [tedarikçi](docs/kilavuz-tedarikci.md) · [Oda](docs/kilavuz-oda.md)
- [docs/DEVAM-NOTU.md](docs/DEVAM-NOTU.md) — **Kaldığımız yer, kurulum ve sıradaki iş**

## Kurulum

```bash
npm install
cp .env.example .env          # DATABASE_URL ve DATA_ENCRYPTION_KEY doldurulur
npm run db:deploy             # migration'ları uygular
npm run db:seed               # izinler, roller, Oda, kategoriler, ilçeler, ilk yönetici
npm run dev                   # http://localhost:3000
```

`SEED_TEST_USERS=1 npm run db:seed` her rolden **TEST** etiketli hesap ekler (yalnızca geliştirme/test).

### Demo verisi (sunum için)

```bash
npm run db:demo               # demo hesaplar + örnek ürün, kampanya, sipariş, reklam, katalog
DEMO_RESET=1 npm run db:demo  # demo verisini silip yeniden yükler
```

Tüm demo hesapların şifresi **`55`** (canlı ortamda yüklenmez):

| Kullanıcı adı | Rol |
|---|---|
| `demo1` | Oda yöneticisi |
| `demo2` | Oda personeli |
| `demo3` | Demo Toptan Gıda yetkilisi |
| `demo4` | Demo İçecek Dağıtım yetkilisi (tanıtım paketi, banner) |
| `demo5` | Demo Temizlik Toptan yetkilisi (bekleyen paket/kampanya) |
| `demo6` | Demo Toptan Gıda depo çalışanı (yalnızca sipariş) |
| `demo7` | Demo Bakkal Atakum (sepette ürün, favoriler) |
| `demo8` | Demo Market İlkadım |
| `demo9` | Demo Bakkal Canik (gecikmiş aidat → sipariş kapalı) |

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` / `npm start` | Canlı derleme / çalıştırma |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run lint` | ESLint |
| `npm test` | Birim + servis (veritabanı) testleri — test veritabanı gerekir |
| `npm run test:e2e` | Uçtan uca rol testleri — test veritabanıyla çalışan sunucu gerekir |
| `npm run db:migrate` | Şema değişikliği için yeni migration |
| `npm run db:demo` | Demo verisini yükler (şifre `55`) |
| `npm run worker` | Arka plan işçisi: e-posta bildirimleri, süresi dolan kayıtlar |
| `docker compose up -d --build` | Canlı kurulum (bkz. docs/07) |

## Klasör yapısı

```
prisma/            şema, migration'lar, seed
src/app/           sayfalar ve API (yonetim, personel, tedarikci, magaza, api/auth, api/files)
src/modules/       iş mantığı (auth, members, …) — her aşamada yeni modüller eklenir
src/lib/           db, izinler, kimlik/kapsam, şifreleme, denetim kaydı, dosya depolama
src/components/    ortak arayüz bileşenleri
tests/             unit · integration · e2e
docs/              aşama raporları
```
