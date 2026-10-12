"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string };

/** ¿Esta liga es la sección donde estoy? (Producciones también cubre la página de cada obra). */
export function esActiva(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

// Menú de escritorio: sección activa con punto dorado; Fan Zone siempre en oro metálico.
export function MainNav({ links }: { links: NavLink[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="hidden items-center gap-5 xl:gap-8 lg:flex">
      {links.map((l) => {
        const on = esActiva(path, l.href);
        const fz = l.href === "/fan-zone";
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? "page" : undefined}
            className={`relative whitespace-nowrap py-2 text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors xl:tracking-[0.18em] ${
              fz ? "txt-oro font-bold hover:brightness-125" : on ? "text-white" : "text-texto-2 hover:text-white"
            }`}
          >
            {l.label}
            {on && <span aria-hidden="true" className="absolute -bottom-1.5 left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-oro shadow-[0_0_12px_var(--oro)]" />}
          </Link>
        );
      })}
    </nav>
  );
}
