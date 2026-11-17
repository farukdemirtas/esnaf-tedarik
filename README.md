# ESNAF TEDARİK

**Ortak Güç, Ortak Kazanç** — Esnaf odası bünyesinde çok satıcılı dijital toptan tedarik platformu.

Next.js 15 · TypeScript · PostgreSQL 16 · Prisma · Tailwind CSS · Zod · Argon2id

## Belgeler

- [docs/01-analiz-ve-mimari.md](docs/01-analiz-ve-mimari.md) — Analiz, mimari, roller, veritabanı, sipariş akışı
- [docs/02-asama-2-temel-altyapi.md](docs/02-asama-2-temel-altyapi.md) — Aşama 2 raporu: tamamlananlar, testler, eksikler
- [docs/03-asama-3-yonetim-paneli.md](docs/03-asama-3-yonetim-paneli.md) — Aşama 3 raporu: yönetici ve personel paneli
- [docs/04-asama-4-tedarikci-paneli.md](docs/04-asama-4-tedarikci-paneli.md) — Aşama 4 raporu: tedarikçi paneli
- [docs/DEVAM-NOTU.md](docs/DEVAM-NOTU.md) — **Kaldığımız yer, yeni bilgisayarda kurulum ve Aşama 5 planı**

## Kurulum

```bash
npm install
cp .env.example .env          # DATABASE_URL ve DATA_ENCRYPTION_KEY doldurulur
npm run db:deploy             # migration'ları uygular
npm run db:seed               # izinler, roller, Oda, kategoriler, ilçeler, ilk yönetici
npm run dev                   # http://localhost:3000
```

`SEED_TEST_USERS=1 npm run db:seed` her rolden **TEST** etiketli hesap ekler (yalnızca geliştirme/test).

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
