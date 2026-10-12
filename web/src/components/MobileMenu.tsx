"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { esActiva, type NavLink } from "./MainNav";

// Menú del celular a pantalla completa (guía de UI): secciones grandes, Fan Zone en oro y
// Audiciones en pulso. Se cierra al navegar, con Esc o con la ✕; bloquea el scroll de atrás.
export function MobileMenu({ links, account, panel }: { links: NavLink[]; account: NavLink; panel: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const path = usePathname();
  const boton = useRef<HTMLButtonElement>(null);
  const primero = useRef<HTMLAnchorElement>(null);
  const [visto, setVisto] = useState(path);

  // Al cambiar de página, el menú se cierra (patrón de React: ajustar estado en el render).
  if (visto !== path) {
    setVisto(path);
    setAbierto(false);
  }

  useEffect(() => {
    if (!abierto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primero.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", tecla);
    const btn = boton.current;
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener("keydown", tecla);
      btn?.focus();
    };
  }, [abierto]);

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú"
        aria-expanded={abierto}
        aria-controls="menu-movil"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-linea-2 lg:hidden"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {/* En un portal: el encabezado tiene desenfoque (backdrop-filter) y eso encerraría el menú fijo. */}
      {abierto && createPortal(
        <div id="menu-movil" role="dialog" aria-modal="true" aria-label="Menú" className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-sala lg:hidden">
          <div aria-hidden="true" className="haz absolute inset-0 opacity-50" />
          <div className="relative flex h-[68px] shrink-0 items-center justify-between border-b border-linea px-5">
            <span className="text-xs font-bold uppercase tracking-[0.32em] text-texto-3">Menú</span>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar menú" className="flex h-11 w-11 items-center justify-center rounded-full border border-linea-2 text-lg">✕</button>
          </div>
          <nav aria-label="Menú" className="relative flex flex-col px-5 py-4">
            {[...links, ...(panel ? [{ href: "/panel", label: "Panel" }] : [])].map((l, i) => {
              const on = esActiva(path, l.href);
              const color = l.href === "/fan-zone" ? "txt-oro" : l.href === "/audiciones" ? "text-pulso" : "text-texto";
              return (
                <Link
                  key={l.href}
                  ref={i === 0 ? primero : undefined}
                  href={l.href}
                  aria-current={on ? "page" : undefined}
                  onClick={() => setAbierto(false)}
                  className="flex min-h-14 items-center justify-between border-b border-linea px-1 py-3"
                >
                  <span className={`text-[26px] font-black uppercase tracking-[-0.02em] ${color}`}>{l.label}</span>
                  <span aria-hidden="true" className={on ? "text-oro" : "text-texto-3"}>{on ? "●" : "→"}</span>
                </Link>
              );
            })}
          </nav>
          <div className="relative mt-auto flex flex-col gap-2.5 p-5 pb-10">
            <Link href="/fan-zone" onClick={() => setAbierto(false)} className="fb fb-fz">Únete a la Fan Zone</Link>
            <Link href={account.href} onClick={() => setAbierto(false)} className="fb fb-o">{account.label}</Link>
            <Link href="/cartelera" onClick={() => setAbierto(false)} className="fb fb-luz">Comprar boletos</Link>
            <p className="pt-2 text-center text-xs text-texto-3">@darfproductions · Jóvenes para jóvenes</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
