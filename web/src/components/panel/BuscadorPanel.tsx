"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buscarPanel } from "@/lib/panel-buscar";
import { TIPO_RESULTADO, buscarAtajos, type Atajo, type Resultado } from "@/lib/panel-buscar-rules";

// Buscador del panel (0085): Ctrl/⌘+K o el botón de arriba. Primero las secciones (obra + pestaña,
// sin ir a la base) y luego personas, órdenes (DARF-/EV-), convocatorias y eventos según tus permisos.
export function BuscadorPanel({ atajos }: { atajos: Atajo[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [remotos, setRemotos] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState(0);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turno = useRef(0);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setAbierto(true); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const locales = buscarAtajos(atajos, q);
  const lista: Resultado[] = [...locales, ...remotos];

  const cambiar = (v: string) => {
    setQ(v); setSel(0);
    if (reloj.current) clearTimeout(reloj.current);
    if (v.trim().length < 2) { setRemotos([]); setBuscando(false); return; }
    setBuscando(true);
    const mio = ++turno.current;
    reloj.current = setTimeout(async () => {
      const r = await buscarPanel(v).catch(() => []);
      if (mio === turno.current) { setRemotos(r); setBuscando(false); }
    }, 250);
  };
  const cerrar = () => { setAbierto(false); setQ(""); setRemotos([]); setSel(0); };
  const ir = (r: Resultado | undefined) => { if (!r) return; cerrar(); router.push(r.href); };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-linea bg-telon px-4 py-2.5 text-left text-sm text-texto-3 hover:border-linea-2 print:hidden"
      >
        <span>🔎 Buscar obra, sección, persona, orden…</span>
        <kbd className="hidden rounded border border-linea-2 px-1.5 py-0.5 text-[11px] font-bold text-texto-2 sm:inline">Ctrl K</kbd>
      </button>
      {abierto && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Buscar en el panel" className="fixed inset-0 z-[70] flex items-start justify-center bg-[#050407]/80 px-4 pt-[10vh] backdrop-blur" onClick={cerrar}>
          <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-[22px] border border-linea-2 bg-telon shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={q}
              onChange={(e) => cambiar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cerrar();
                else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, lista.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); ir(lista[sel]); }
              }}
              placeholder="Ej. showman boletos · Ana · DARF-7K2M9A · EV-…"
              aria-label="Buscar"
              className="w-full border-b border-linea bg-transparent px-5 py-4 text-base outline-none"
            />
            <ul role="listbox" aria-label="Resultados" className="max-h-[60vh] overflow-y-auto p-2">
              {lista.map((r, i) => (
                <li key={`${r.tipo}-${r.href}-${i}`} role="option" aria-selected={i === sel}>
                  <button
                    type="button"
                    onMouseEnter={() => setSel(i)}
                    onClick={() => ir(r)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left ${i === sel ? "bg-telon-2" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.titulo}</span>
                      {r.detalle && <span className="block truncate text-xs text-texto-3">{r.detalle}</span>}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-texto-3">{TIPO_RESULTADO[r.tipo] ?? r.tipo}</span>
                  </button>
                </li>
              ))}
              {q.trim() && !lista.length && <li className="px-3 py-3 text-sm text-texto-3">{buscando ? "Buscando…" : "Sin resultados."}</li>}
              {!q.trim() && <li className="px-3 py-3 text-sm text-texto-3">Escribe el nombre de una obra y una sección, una persona o el código de una orden.</li>}
            </ul>
            <p className="hidden border-t border-linea px-5 py-2 text-[11px] text-texto-3 sm:block">↑ ↓ para moverte · Enter para abrir · Esc para cerrar</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
