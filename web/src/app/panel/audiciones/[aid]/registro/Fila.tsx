"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ORDEN_FILA, type OrdenFila } from "@/lib/audicion-vivo-rules";
import { mandarAlFinal, pasarSiguiente, reordenarFila } from "../../actions";

type Persona = { id: string; numero: number | null; nombre: string } | null;

// 0131: la fila del día en la entrada. Recepción (o el host) da "Siguiente": termina quien está en escena y pasa el
// siguiente que ya llegó; los jueces lo ven en su pantalla en unos segundos.
export function FilaEnVivo({ aid, actual, sigue, esperan, callback }: { aid: string; actual: Persona; sigue: Persona; esperan: number; callback: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const nombre = (p: Persona) => (p ? `${p.numero ? `Nº ${p.numero} · ` : ""}${p.nombre}` : "");

  const siguiente = () => start(async () => {
    setMsg(null);
    const r = await pasarSiguiente(aid);
    if (!r.ok || r.message) setMsg(r.message ?? "No se pudo.");
    router.refresh();
  });
  const ordenar = (modo: OrdenFila) => start(async () => {
    const etiqueta = ORDEN_FILA.find((o) => o.valor === modo)!.label.toLowerCase();
    if (!confirm(`¿Ordenar ${etiqueta} a quienes esperan? Sus números pueden cambiar; quien ya pasó no se mueve.`)) return;
    const r = await reordenarFila(aid, modo);
    setMsg(r.message);
    router.refresh();
  });

  return (
    <section aria-label="Fila en vivo" className="flex flex-col gap-4 rounded-2xl bg-sala p-5 ring-2 ring-lila/50">
      {callback && <p className="rounded-full bg-lila/20 px-3 py-1 text-center text-xs font-bold uppercase tracking-[0.2em] text-lila">Ronda de callback · solo los llamados</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lila">En escena · lo ven los jueces</p>
          <p className="text-2xl font-black leading-tight">{actual ? nombre(actual) : "Nadie"}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-aviso">Sigue</p>
          <p className="text-2xl font-black leading-tight">{sigue ? nombre(sigue) : <span className="text-base font-semibold text-texto-3">Nadie esperando</span>}</p>
          <p className="text-xs text-texto-3">{esperan} {esperan === 1 ? "persona espera" : "personas esperan"}</p>
        </div>
      </div>
      <button type="button" disabled={pending || (!sigue && !actual)} onClick={siguiente}
        className="w-full rounded-2xl bg-texto py-5 text-2xl font-black tracking-wide text-sala transition active:scale-[0.99] disabled:opacity-50">
        {pending ? "Un momento…" : sigue ? "SIGUIENTE" : actual ? "TERMINAR (ya no hay más)" : "SIGUIENTE"}
      </button>
      {msg && <p role="status" className="text-sm font-semibold text-aviso">{msg}</p>}
      <details className="text-sm">
        <summary className="cursor-pointer font-bold text-texto-2">Cambiar el orden de quienes esperan</summary>
        <div className="mt-3 flex flex-col gap-2">
          {ORDEN_FILA.map((o) => (
            <button key={o.valor} type="button" disabled={pending} onClick={() => ordenar(o.valor)}
              className="flex flex-col items-start rounded-xl border border-white/15 px-4 py-2.5 text-left hover:border-white/40 disabled:opacity-60">
              <b>{o.label}</b><span className="text-xs text-texto-3">{o.ayuda}</span>
            </button>
          ))}
          <p className="text-xs text-texto-3">Quien llegue después se forma al final. Para mover a una sola persona, usa &ldquo;Al final&rdquo; en la lista.</p>
        </div>
      </details>
    </section>
  );
}

/** Botón chico en la lista: mandar a esta persona al final de la fila. */
export function AlFinal({ aid, app, nombre }: { aid: string; app: string; nombre: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={pending} className="rounded-full border border-white/25 px-3 py-1 text-xs font-bold hover:border-white/60 disabled:opacity-60"
        onClick={() => start(async () => {
          if (!confirm(`¿Mandar a ${nombre} al final de la fila?`)) return;
          const r = await mandarAlFinal(aid, app);
          if (!r.ok) { setErr(r.message ?? "No se pudo."); return; }
          router.refresh();
        })}>{pending ? "…" : "Al final"}</button>
      {err && <span role="alert" className="text-[11px] text-aviso">{err}</span>}
    </span>
  );
}
