/** Giriş ekranı: harita rotaları, sevkiyat kamyonu ve ürün taşıyan personel. */
export function DeliveryScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 820 430"
      className={className}
      role="img"
      aria-label="Esnaf Tedarik kamyonu, harita üzerindeki sevkiyat rotaları ve koli taşıyan personel"
    >
      <rect x="6" y="6" width="808" height="418" rx="28" fill="#f3f6f8" />

      {/* Kıtalar */}
      <g fill="#d5dee6">
        <path d="M70 78c40-28 96-18 120 10 18 22 10 48-8 62-28 8-70 2-92-22-16-18-28-34-20-50z" />
        <path d="M150 150c28-8 48 10 52 34 4 28-10 52-36 58-30 6-58-12-62-40-4-24 16-46 46-52z" />
        <path d="M250 70c70-30 150-10 190 28 28 26 18 58-8 74-40 24-110 16-150-10-28-18-48-58-32-92z" />
        <path d="M470 120c50-20 110 0 130 36 16 28 4 58-24 70-36 16-86 4-108-24-18-24-16-62 2-82z" />
        <path d="M620 86c36-16 78-4 96 22 14 20 8 46-12 58-28 16-70 6-86-16-14-18-12-48 2-64z" />
        <ellipse cx="210" cy="250" rx="34" ry="16" />
      </g>

      {/* Rotalar */}
      <g fill="none" strokeWidth="3" strokeLinecap="round">
        <path d="M120 110 C 220 70, 300 150, 430 120 S 620 80, 700 130" stroke="#e11d48" strokeDasharray="8 7" />
        <path d="M150 190 C 250 150, 360 210, 500 170 S 680 150, 740 190" stroke="#1e3a5f" strokeDasharray="2 8" />
        <path d="M180 150 C 260 190, 340 120, 460 160" stroke="#e11d48" strokeDasharray="8 7" />
      </g>

      {/* Küçük konum pinleri */}
      <g>
        <path d="M168 96c-8 0-14 6-14 14 0 10 14 24 14 24s14-14 14-24c0-8-6-14-14-14z" fill="#2457c5" />
        <circle cx="168" cy="110" r="4" fill="#fff" />
        <path d="M300 168c-8 0-14 6-14 14 0 10 14 24 14 24s14-14 14-24c0-8-6-14-14-14z" fill="#e11d48" />
        <circle cx="300" cy="182" r="4" fill="#fff" />
        <path d="M640 150c-7 0-12 5-12 12 0 9 12 20 12 20s12-11 12-20c0-7-5-12-12-12z" fill="#2457c5" />
        <circle cx="640" cy="162" r="3.5" fill="#fff" />
      </g>

      {/* Uçak ve gemi */}
      <g fill="#7f8c9b">
        <path d="M470 96l28-6-8 10 16 2-16 4 6 8-22-8-6 6 2-16z" />
        <path d="M250 214h34l8 8H246l-10-6 8-6h6zm6 8h22" stroke="#7f8c9b" strokeWidth="2" />
      </g>

      {/* Büyük pin: ekran başındaki operasyon */}
      <g>
        <path d="M610 36c-34 0-62 28-62 62 0 46 62 104 62 104s62-58 62-104c0-34-28-62-62-62z" fill="#e11d48" />
        <circle cx="610" cy="98" r="40" fill="#fff" />
        <circle cx="610" cy="84" r="11" fill="#3a2a22" />
        <path d="M596 98h28c2 0 4 2 4 6v12H592v-12c0-4 2-6 4-6z" fill="#2457c5" />
        <rect x="586" y="112" width="48" height="22" rx="3" fill="#8ec6ea" />
        <rect x="590" y="115" width="40" height="14" rx="1" fill="#e8f6fb" />
      </g>

      {/* Zemin */}
      <rect x="28" y="300" width="764" height="96" fill="#e4eaee" />
      <rect x="28" y="300" width="764" height="8" fill="#d5dee4" />

      {/* Kutular ve transpalet */}
      <g>
        <rect x="48" y="262" width="46" height="38" rx="3" fill="#f4e2c4" stroke="#e2c48a" />
        <rect x="62" y="246" width="46" height="38" rx="3" fill="#fff" stroke="#d7e0e6" />
        <path d="M118 292h70l8 18H126z" fill="#d64545" />
        <rect x="112" y="308" width="92" height="8" rx="2" fill="#b9c4cc" />
        <circle cx="128" cy="322" r="7" fill="#2c333a" />
        <circle cx="186" cy="322" r="7" fill="#2c333a" />
      </g>

      {/* Personel */}
      <g>
        <circle cx="168" cy="232" r="16" fill="#f0c7a4" />
        <path d="M154 230c1-16 12-22 16-22 10 0 16 8 16 18-6-4-12-2-16 2-6-6-12-4-16 2z" fill="#2b211c" />
        <path d="M150 250h36l6 48h-48z" fill="#2457c5" />
        <path d="M156 298h10l-2 24h-12z" fill="#1d3f86" />
        <path d="M176 298h12l4 24h-14z" fill="#1d3f86" />
        <ellipse cx="160" cy="324" rx="8" ry="4" fill="#1a1f24" />
        <ellipse cx="186" cy="324" rx="8" ry="4" fill="#1a1f24" />
        <path d="M184 268c16 4 28 2 36-6" stroke="#f0c7a4" strokeWidth="8" strokeLinecap="round" />
      </g>

      {/* Kamyon */}
      <g>
        <rect x="300" y="214" width="292" height="108" rx="10" fill="#3b82f6" />
        <path d="M348 246h78l-28 28 28 28h-78z" fill="#fff" />
        <text
          x="470"
          y="268"
          textAnchor="middle"
          fill="#fff"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="15"
          fontWeight="800"
          letterSpacing="0.6"
        >
          ESNAF
        </text>
        <text
          x="470"
          y="288"
          textAnchor="middle"
          fill="#dbeafe"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="13"
          fontWeight="800"
          letterSpacing="1"
        >
          TEDARİK
        </text>
        <path d="M584 236h92c16 0 28 10 34 26l16 40H584z" fill="#eef3f6" />
        <path d="M612 250h62c8 0 16 6 20 16H612z" fill="#9fd4ee" />
        <circle cx="360" cy="330" r="20" fill="#2c333a" />
        <circle cx="360" cy="330" r="8" fill="#d5dee4" />
        <circle cx="500" cy="330" r="20" fill="#2c333a" />
        <circle cx="500" cy="330" r="8" fill="#d5dee4" />
        <circle cx="668" cy="330" r="20" fill="#2c333a" />
        <circle cx="668" cy="330" r="8" fill="#d5dee4" />
        <rect x="690" y="292" width="16" height="10" rx="2" fill="#f3c978" />
      </g>
    </svg>
  );
}
