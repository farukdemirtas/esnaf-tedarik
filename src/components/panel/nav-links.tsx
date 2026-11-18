"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  permission?: string;
  exact?: boolean;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Panel menüsü">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative block rounded-xl px-3 py-2.5 text-[15px] font-medium transition duration-200 ${
              active
                ? "bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                : "text-brand-100/85 hover:bg-white/8 hover:text-white"
            }`}
          >
            {active && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent-400" aria-hidden />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
