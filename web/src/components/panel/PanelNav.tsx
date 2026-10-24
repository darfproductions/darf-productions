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
            {/* Las notificaciones sin leer se ven junto a Inicio (ya no tienen entrada propia). */}
            {s.id === "inicio" && badges.notificaciones ? <span className="ml-2 rounded-full bg-ciruela px-1.5 py-0.5 text-[11px] font-bold text-white" aria-label={`${badges.notificaciones} notificaciones sin leer`}>{badges.notificaciones}</span> : null}
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

/** Misma barra de subpestañas para páginas con su propio menú (Showcases, cada convocatoria): marca la abierta
 *  (la ruta más larga que coincide; la primera, que es la raíz, solo exacta). */
export function TabsBar({ label, links }: { label: string; links: { href: string; label: string }[] }) {
  const path = usePathname().replace(/\/+$/, "");
  const raiz = links[0]?.href;
  const activa = links
    .filter((x) => (x.href === raiz ? path === x.href : path === x.href || path.startsWith(`${x.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-white/10 pb-px print:hidden">
      {links.map((x) => (
        <Link key={x.href} href={x.href} aria-current={activa === x.href ? "page" : undefined}
          className={`shrink-0 border-b-2 px-3 py-3 text-sm font-bold hover:text-violeta-claro ${activa === x.href ? "border-texto" : "border-transparent text-texto-2"}`}>
          {x.label}
        </Link>
      ))}
    </nav>
  );
}
