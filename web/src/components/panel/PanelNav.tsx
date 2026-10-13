"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNav, type NavSection } from "@/lib/panel-nav";

// Menú lateral del panel con la sección activa marcada.
export function PanelNavLinks({ menu, badges = {} }: { menu: NavSection[]; badges?: Partial<Record<NavSection["id"], number>> }) {
  const { section } = activeNav(menu, usePathname());
  return (
    <>
      {menu.map((s) => {
        const on = section?.id === s.id;
        return (
          <Link
            key={s.id}
            href={s.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-lg px-3 py-2.5 font-semibold hover:bg-telon-2 hover:text-texto ${on ? "bg-telon-2 text-texto" : "text-texto-2"}`}
          >
            {s.label}
            {badges[s.id] ? <span className={`ml-2 rounded-full px-1.5 py-0.5 ${s.id === "inicio" ? "bg-aviso text-sala" : "bg-ciruela text-white"} text-[11px] font-bold`} aria-label={s.id === "inicio" ? `${badges[s.id]} pendientes` : `${badges[s.id]} sin leer`}>{badges[s.id]}</span> : null}
          </Link>
        );
      })}
    </>
  );
}

// Subpestañas de la sección (Obras · Audiciones, Directorio · Cumpleaños…), solo en sus páginas principales.
export function PanelSubTabs({ menu }: { menu: NavSection[] }) {
  const { section, sub, showSubs } = activeNav(menu, usePathname());
  if (!section || !showSubs) return null;
  return (
    <nav aria-label={section.label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-white/10 pb-px print:hidden">
      {section.subs.map((x) => (
        <Link
          key={x.href}
          href={x.href}
          aria-current={sub?.href === x.href ? "page" : undefined}
          className={`shrink-0 border-b-2 px-3 py-3 text-sm font-bold hover:text-violeta-claro ${sub?.href === x.href ? "border-texto" : "border-transparent text-texto-2"}`}
        >
          {x.label}
        </Link>
      ))}
    </nav>
  );
}
