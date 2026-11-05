"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { paginasDePestana, tabActiva, type GrupoTabs } from "@/lib/panel-nav";

// Pestañas de la obra en dos filas (0085, esqueleto nuevo 0138): arriba las siete pestañas fijas y, abajo, UNA fila
// con las páginas de la pestaña abierta, agrupadas por sección (Preparar · Vender · Día de función; Elenco ·
// Integrantes · Equipo). Ya no hay tercera fila. Siempre se marca dónde estás; el número dice cuántos pendientes hay
// ahí. En celular se deslizan y la abierta queda a la vista.
export function ObraTabs({ base, grupos, conteo }: { base: string; grupos: GrupoTabs[]; conteo: Record<string, number> }) {
  const path = usePathname();
  const caja = useRef<HTMLDivElement>(null);
  // Si la pestaña abierta queda fuera de la vista (celular, o una fila larga), se desliza hasta ella; si ya se ve, no se mueve nada.
  useEffect(() => {
    caja.current?.querySelectorAll<HTMLElement>("[aria-current=page]").forEach((el) => {
      const nav = el.closest("nav");
      if (!nav || nav.scrollWidth <= nav.clientWidth) return;
      const r = el.getBoundingClientRect(), n = nav.getBoundingClientRect();
      if (r.left < n.left || r.right > n.right) nav.scrollLeft += r.left - n.left - (n.width - r.width) / 2;
    });
  }, [path]);
  const { grupo, tab, item } = tabActiva(grupos, path.startsWith(base) ? path.slice(base.length) : "");
  const abierto = grupos.find((g) => g.id === grupo) ?? null;
  const secciones = abierto ? paginasDePestana(abierto) : [];
  const paginaActiva = item ?? tab;
  const deTab = (t: GrupoTabs["tabs"][number]) => (conteo[t.id] ?? 0) + (t.items ?? []).reduce((s, i) => s + (conteo[i.id] ?? 0), 0);
  const total = (g: GrupoTabs) => g.tabs.reduce((s, t) => s + deTab(t), 0);
  const liga = (p: string) => `${base}${p ? `/${p}` : ""}`;
  const num = (n: number) => (n ? <span className="ml-1.5 rounded-full bg-aviso px-1.5 py-0.5 text-[10px] font-bold text-sala" aria-label={`${n} pendientes`}>{n}</span> : null);
  const nPaginas = secciones.reduce((s, x) => s + x.paginas.length, 0);
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
      {abierto && nPaginas > 1 && (
        <nav aria-label={abierto.label} className="-mx-1 flex items-center gap-1.5 overflow-x-auto py-2.5">
          {secciones.map((sec, k) => (
            <span key={sec.seccion || k} className={`flex shrink-0 items-center gap-1.5 ${k > 0 ? "ml-2 border-l border-white/15 pl-3" : ""}`}>
              {sec.seccion && <span className="mr-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-texto-3">{sec.seccion}</span>}
              {sec.paginas.map((p) => (
                <Link
                  key={p.id}
                  href={liga(p.path)}
                  aria-current={p.id === paginaActiva ? "page" : undefined}
                  className={`flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[13px] font-semibold ${p.id === paginaActiva ? "border-texto bg-texto text-sala" : "border-white/20 text-texto-2 hover:border-white/50"}`}
                >
                  {p.label}{num(conteo[p.id] ?? 0)}
                </Link>
              ))}
            </span>
          ))}
        </nav>
      )}
    </div>
  );
}
