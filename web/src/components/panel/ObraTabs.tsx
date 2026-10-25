"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { tabActiva, type GrupoTabs } from "@/lib/panel-nav";

// Pestañas de la obra en dos filas (0085): grupos arriba y, abajo, las pestañas del grupo abierto. En Boletos
// (0127) la segunda fila son sus secciones (Preparar, Vender, Día de función) y una tercera, chica, sus páginas.
// Siempre se marca dónde estás; el número dice cuántos pendientes hay ahí. En celular se deslizan.
export function ObraTabs({ base, grupos, conteo }: { base: string; grupos: GrupoTabs[]; conteo: Record<string, number> }) {
  const path = usePathname();
  const caja = useRef<HTMLDivElement>(null);
  // En celular, la pestaña abierta puede quedar fuera de la vista: se desliza hasta ella.
  useEffect(() => {
    caja.current?.querySelectorAll<HTMLElement>("[aria-current=page]").forEach((el) => {
      const nav = el.parentElement;
      if (nav && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = el.offsetLeft - nav.clientWidth / 2 + el.clientWidth / 2;
    });
  }, [path]);
  const { grupo, tab, item } = tabActiva(grupos, path.startsWith(base) ? path.slice(base.length) : "");
  const abierto = grupos.find((g) => g.id === grupo) ?? null;
  const seccion = abierto?.tabs.find((t) => t.id === tab && t.items?.length) ?? null;
  const deTab = (t: GrupoTabs["tabs"][number]) => (conteo[t.id] ?? 0) + (t.items ?? []).reduce((s, i) => s + (conteo[i.id] ?? 0), 0);
  const total = (g: GrupoTabs) => g.tabs.reduce((s, t) => s + deTab(t), 0);
  const liga = (p: string) => `${base}${p ? `/${p}` : ""}`;
  const num = (n: number) => (n ? <span className="ml-1.5 rounded-full bg-aviso px-1.5 py-0.5 text-[10px] font-bold text-sala" aria-label={`${n} pendientes`}>{n}</span> : null);
  return (
    <div ref={caja} className="flex flex-col print:hidden">
      <nav aria-label="Secciones de la obra" className="-mx-1 flex gap-1 overflow-x-auto border-b border-white/10 pb-px">
        {grupos.map((g) => (
          <Link
            key={g.id}
            href={liga(g.path)}
            aria-current={g.id === grupo ? "page" : undefined}
            className={`flex shrink-0 items-center border-b-2 px-3 py-3 text-sm font-bold hover:text-violeta-claro ${g.id === grupo ? "border-texto text-texto" : "border-transparent text-texto-2"}`}
          >
            {g.label}{num(total(g))}
          </Link>
        ))}
      </nav>
      {abierto && abierto.tabs.length > 1 && (
        <nav aria-label={abierto.label} className="-mx-1 flex gap-1.5 overflow-x-auto py-2.5">
          {abierto.tabs.map((t) => (
            <Link
              key={t.id}
              href={liga(t.items?.[0]?.path ?? t.path)}
              aria-current={t.id === tab ? "page" : undefined}
              className={`flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[13px] font-semibold ${t.id === tab ? "border-texto bg-texto text-sala" : "border-white/20 text-texto-2 hover:border-white/50"}`}
            >
              {t.label}{num(deTab(t))}
            </Link>
          ))}
        </nav>
      )}
      {seccion && (seccion.items?.length ?? 0) > 1 && (
        <nav aria-label={seccion.label} className="-mx-1 flex gap-4 overflow-x-auto border-b border-white/10 pb-2 text-[13px]">
          {seccion.items!.map((i) => (
            <Link key={i.id} href={liga(i.path)} aria-current={i.id === item ? "page" : undefined}
              className={`flex shrink-0 items-center px-1 py-1 font-semibold ${i.id === item ? "text-texto underline decoration-2 underline-offset-8" : "text-texto-3 hover:text-texto"}`}>
              {i.label}{num(conteo[i.id] ?? 0)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
