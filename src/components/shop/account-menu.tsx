"use client";

import { withBase } from "@/lib/base-path";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface AccountLink {
  href: string;
  label: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return letters.toLocaleUpperCase("tr") || "H";
}

/** Sağ üst hesap düğmesi: tıklanınca hesap ve mağaza bağlantılarını açar. */
export function AccountMenu({ name, org, links }: { name: string; org: string | null; links: AccountLink[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pr-2.5 pl-1.5 text-left shadow-sm transition hover:border-brand-200 hover:bg-brand-50"
      >
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-700 text-xs font-bold text-white">
          {initials(name)}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-40 truncate text-sm font-semibold text-slate-900">{name}</span>
          {org && <span className="block max-w-40 truncate text-[11px] text-slate-500">{org}</span>}
        </span>
        <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 text-slate-500 transition ${open ? "rotate-180" : ""}`} fill="currentColor">
          <path d="M5.2 7.5a1 1 0 0 1 1.4 0L10 10.9l3.4-3.4a1 1 0 1 1 1.4 1.4l-4.1 4.1a1 1 0 0 1-1.4 0L5.2 8.9a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
          <div className="border-b border-slate-100 px-3 py-2 sm:hidden">
            <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
            {org && <div className="truncate text-xs text-slate-500">{org}</div>}
          </div>
          {links.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={`block px-3 py-2 text-sm font-medium ${active ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-slate-50"}`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/sifre-degistir" role="menuitem" className="block px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Şifre değiştir
          </Link>
          <form method="post" action={withBase("/api/auth/logout")} className="border-t border-slate-100">
            <button type="submit" role="menuitem" className="block w-full px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">
              Çıkış
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
