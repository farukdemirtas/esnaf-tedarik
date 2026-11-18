/**
 * DEMO verisi tanımı. Tüm marka ve firma adları kurgusaldır; gerçek kişi/kurum değildir.
 * Yalnızca `npm run db:demo` ile, geliştirme/sunum ortamında yüklenir.
 */

export const DEMO_PASSWORD = "55";

/** Kolay demo girişleri: demo1…demo9, şifre hepsinde 55 */
export const DEMO_USERS = {
  admin: "demo1",
  staff: "demo2",
  suppliers: ["demo3", "demo4", "demo5"] as const,
  worker: "demo6",
  members: ["demo7", "demo8", "demo9"] as const,
} as const;

export const DEMO_USERNAMES = [
  DEMO_USERS.admin,
  DEMO_USERS.staff,
  ...DEMO_USERS.suppliers,
  DEMO_USERS.worker,
  ...DEMO_USERS.members,
] as const;

export interface DemoProduct {
  slug: string;
  name: string;
  category: string;
  brand: string;
  unitType: "ADET" | "KG" | "LITRE" | "PAKET";
  unitAmount?: number;
  barcode: string;
  color: string;
  /** [tedarikçi sırası (0..2), koli fiyatı, koli içi adet, stok] */
  offers: [number, number, number, number][];
}

export const DEMO_SUPPLIERS = [
  { key: "1", slug: "demo-toptan-gida", tradeName: "Demo Toptan Gıda", legalName: "Demo Toptan Gıda Ltd. Şti. (DEMO)", minOrderAmount: 1500, description: "DEMO firma: kuru gıda, kahvaltılık ve atıştırmalık toptan dağıtım." },
  { key: "2", slug: "demo-icecek-dagitim", tradeName: "Demo İçecek Dağıtım", legalName: "Demo İçecek Dağıtım A.Ş. (DEMO)", minOrderAmount: 1000, description: "DEMO firma: su, gazlı içecek, meyve suyu ve süt ürünleri dağıtımı." },
  { key: "3", slug: "demo-temizlik-toptan", tradeName: "Demo Temizlik Toptan", legalName: "Demo Temizlik Ürünleri Tic. (DEMO)", minOrderAmount: 750, description: "DEMO firma: temizlik ve kişisel bakım ürünleri." },
] as const;

export const DEMO_MEMBERS = [
  { key: "1", username: DEMO_USERS.members[0], fullName: "Demo Bakkal Sahibi 1", businessName: "Demo Bakkal Atakum", district: "Atakum", line: "Demo Mahallesi, Deneme Sokak No 1" },
  { key: "2", username: DEMO_USERS.members[1], fullName: "Demo Market Sahibi 2", businessName: "Demo Market İlkadım", district: "İlkadım", line: "Örnek Caddesi No 12" },
  { key: "3", username: DEMO_USERS.members[2], fullName: "Demo Bakkal Sahibi 3", businessName: "Demo Bakkal Canik", district: "Canik", line: "Gösterim Sokak No 7" },
] as const;

export const DEMO_PRODUCTS: DemoProduct[] = [
  { slug: "demo-dogal-su-05", name: "Doğal Kaynak Suyu 0,5 L", category: "Su ve Maden Suyu", brand: "Yayla Pınarı (Demo)", unitType: "LITRE", unitAmount: 0.5, barcode: "8690000000011", color: "#38bdf8", offers: [[1, 96, 24, 120], [0, 102, 24, 60]] },
  { slug: "demo-dogal-su-15", name: "Doğal Kaynak Suyu 1,5 L", category: "Su ve Maden Suyu", brand: "Yayla Pınarı (Demo)", unitType: "LITRE", unitAmount: 1.5, barcode: "8690000000028", color: "#0ea5e9", offers: [[1, 72, 6, 200]] },
  { slug: "demo-maden-suyu", name: "Sade Maden Suyu 200 ml", category: "Su ve Maden Suyu", brand: "Kaya Kaynak (Demo)", unitType: "LITRE", unitAmount: 0.2, barcode: "8690000000035", color: "#22d3ee", offers: [[1, 168, 24, 80], [0, 175, 24, 40]] },
  { slug: "demo-kola-1l", name: "Kola 1 L", category: "Gazlı İçecekler", brand: "Gazoz Usta (Demo)", unitType: "LITRE", unitAmount: 1, barcode: "8690000000042", color: "#dc2626", offers: [[1, 336, 12, 90], [0, 349, 12, 30]] },
  { slug: "demo-gazoz-250", name: "Sade Gazoz 250 ml", category: "Gazlı İçecekler", brand: "Gazoz Usta (Demo)", unitType: "LITRE", unitAmount: 0.25, barcode: "8690000000059", color: "#84cc16", offers: [[1, 288, 24, 70]] },
  { slug: "demo-ayran-200", name: "Ayran 200 ml", category: "Süt ve Süt Ürünleri", brand: "Karadeniz Süt (Demo)", unitType: "LITRE", unitAmount: 0.2, barcode: "8690000000066", color: "#e2e8f0", offers: [[1, 264, 24, 60], [0, 270, 24, 25]] },
  { slug: "demo-sut-1l", name: "Tam Yağlı Süt 1 L", category: "Süt ve Süt Ürünleri", brand: "Karadeniz Süt (Demo)", unitType: "LITRE", unitAmount: 1, barcode: "8690000000073", color: "#f8fafc", offers: [[1, 432, 12, 50]] },
  { slug: "demo-beyaz-peynir", name: "Tam Yağlı Beyaz Peynir 500 g", category: "Kahvaltılık Ürünler", brand: "Karadeniz Süt (Demo)", unitType: "KG", unitAmount: 0.5, barcode: "8690000000080", color: "#fef9c3", offers: [[0, 1440, 8, 20], [1, 1395, 8, 12]] },
  { slug: "demo-findik-ezmesi", name: "Kakaolu Fındık Ezmesi 350 g", category: "Kahvaltılık Ürünler", brand: "Fındıkköy (Demo)", unitType: "ADET", barcode: "8690000000097", color: "#78350f", offers: [[0, 1080, 12, 30]] },
  { slug: "demo-recel-cilek", name: "Çilek Reçeli 380 g", category: "Kahvaltılık Ürünler", brand: "Sabah Sofrası (Demo)", unitType: "ADET", barcode: "8690000000103", color: "#be123c", offers: [[0, 720, 12, 40]] },
  { slug: "demo-siyah-cay-1kg", name: "Siyah Çay 1 kg", category: "İçecekler", brand: "Rize Bahçesi (Demo)", unitType: "KG", unitAmount: 1, barcode: "8690000000110", color: "#92400e", offers: [[0, 1650, 6, 45], [1, 1690, 6, 20]] },
  { slug: "demo-turk-kahvesi", name: "Türk Kahvesi 100 g", category: "İçecekler", brand: "Köpüklü (Demo)", unitType: "ADET", barcode: "8690000000127", color: "#451a03", offers: [[0, 1100, 24, 25]] },
  { slug: "demo-kirmizi-mercimek", name: "Kırmızı Mercimek 1 kg", category: "Konserve ve Bakliyat", brand: "Bereket Bakliyat (Demo)", unitType: "KG", unitAmount: 1, barcode: "8690000000134", color: "#f97316", offers: [[0, 690, 10, 60]] },
  { slug: "demo-pirinc-baldo", name: "Baldo Pirinç 1 kg", category: "Konserve ve Bakliyat", brand: "Bereket Bakliyat (Demo)", unitType: "KG", unitAmount: 1, barcode: "8690000000141", color: "#fde68a", offers: [[0, 850, 10, 50]] },
  { slug: "demo-domates-salcasi", name: "Domates Salçası 830 g", category: "Konserve ve Bakliyat", brand: "Bahçe Sofrası (Demo)", unitType: "ADET", barcode: "8690000000158", color: "#b91c1c", offers: [[0, 780, 12, 35]] },
  { slug: "demo-patates-cipsi", name: "Patates Cipsi 150 g", category: "Atıştırmalıklar", brand: "Çıtır Usta (Demo)", unitType: "ADET", barcode: "8690000000165", color: "#facc15", offers: [[0, 504, 18, 40]] },
  { slug: "demo-tuzlu-findik", name: "Kavrulmuş Fındık 100 g", category: "Atıştırmalıklar", brand: "Fındıkköy (Demo)", unitType: "ADET", barcode: "8690000000172", color: "#a16207", offers: [[0, 900, 20, 18]] },
  { slug: "demo-sutlu-cikolata", name: "Sütlü Çikolata 80 g", category: "Çikolata ve Şekerleme", brand: "Tatlı Diyar (Demo)", unitType: "ADET", barcode: "8690000000189", color: "#7c2d12", offers: [[0, 960, 24, 30]] },
  { slug: "demo-findikli-gofret", name: "Fındıklı Gofret 36 g", category: "Bisküvi ve Gofret", brand: "Lezzet Fırını (Demo)", unitType: "ADET", barcode: "8690000000196", color: "#d97706", offers: [[0, 540, 36, 50]] },
  { slug: "demo-kremali-biskuvi", name: "Kakaolu Kremalı Bisküvi 100 g", category: "Bisküvi ve Gofret", brand: "Lezzet Fırını (Demo)", unitType: "ADET", barcode: "8690000000202", color: "#57534e", offers: [[0, 600, 24, 3]] },
  { slug: "demo-bulasik-deterjani", name: "Sıvı Bulaşık Deterjanı 1 L", category: "Temizlik Ürünleri", brand: "Parlak Ev (Demo)", unitType: "LITRE", unitAmount: 1, barcode: "8690000000219", color: "#22c55e", offers: [[2, 540, 12, 40]] },
  { slug: "demo-camasir-suyu", name: "Çamaşır Suyu 2 L", category: "Temizlik Ürünleri", brand: "Parlak Ev (Demo)", unitType: "LITRE", unitAmount: 2, barcode: "8690000000226", color: "#93c5fd", offers: [[2, 380, 8, 60]] },
  { slug: "demo-tuvalet-kagidi", name: "Tuvalet Kağıdı 32'li", category: "Temizlik Ürünleri", brand: "Yumuşak Rulo (Demo)", unitType: "PAKET", barcode: "8690000000233", color: "#e0e7ff", offers: [[2, 1120, 4, 25]] },
  { slug: "demo-sivi-sabun", name: "Sıvı Sabun 1,5 L", category: "Kişisel Bakım", brand: "Parlak Ev (Demo)", unitType: "LITRE", unitAmount: 1.5, barcode: "8690000000240", color: "#f9a8d4", offers: [[2, 600, 6, 30]] },
];
