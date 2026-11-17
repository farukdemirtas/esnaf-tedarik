import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "ESNAF TEDARİK", template: "%s · ESNAF TEDARİK" },
  description: "Ortak Güç, Ortak Kazanç — Esnaf odası dijital toptan tedarik platformu",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#154269" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className={`${inter.variable} min-h-dvh font-sans antialiased`}>{children}</body>
    </html>
  );
}
