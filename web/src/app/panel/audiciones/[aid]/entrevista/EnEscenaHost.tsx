"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pasarSiguiente, ponerEnEscena } from "../../actions";

const btn = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/60 disabled:opacity-60";

// 0115: el host decide quién está en escena; los jueces lo ven en su pantalla en unos segundos.
export function EnEscenaHost({ aid, actual, esta }: {
  aid: string; actual: { app: string; numero: number | null; nombre: string } | null; esta?: { app: string; nombre: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const correr = (fn: () => Promise<{ ok: boolean; message?: string; app?: string | null }>, abrir: boolean) => start(async () => {
    setMsg(null);
    const r = await fn();
    if (!r.ok || r.message) setMsg(r.message ?? "No se pudo.");
    if (r.ok && abrir && r.app) router.push(`/panel/audiciones/${aid}/entrevista/${r.app}`);
    else router.refresh();
  });
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-sala p-4 ring-1 ring-lila/40">
      <p className="text-sm">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-lila">En escena · lo ven los jueces</span>
        <span className="block text-lg font-bold">{actual ? `${actual.numero ? `Nº ${actual.numero} · ` : ""}${actual.nombre}` : "Nadie"}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => correr(() => pasarSiguiente(aid), true)} className="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala disabled:opacity-60">
          {pending ? "Un momento…" : "Pasar al siguiente"}
        </button>
        {esta && esta.app !== actual?.app && (
          <button type="button" disabled={pending} onClick={() => correr(() => ponerEnEscena(aid, esta.app), false)} className={btn}>Poner en escena a {esta.nombre.split(" ")[0]}</button>
        )}
        {actual && <button type="button" disabled={pending} onClick={() => correr(() => ponerEnEscena(aid, null), false)} className={btn}>Nadie en escena</button>}
      </div>
      {msg && <p role="status" className="text-sm font-semibold text-aviso">{msg}</p>}
    </div>
  );
}

/** Botón chico en la lista: poner a esta persona en escena y abrir su entrevista. */
export function PonerEnEscena({ aid, app }: { aid: string; app: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={pending} className="rounded-full border border-white/25 px-3 py-1 text-xs font-bold hover:border-white/60 disabled:opacity-60"
        onClick={() => start(async () => {
          const r = await ponerEnEscena(aid, app);
          if (!r.ok) { setErr(r.message ?? "No se pudo."); return; }
          router.push(`/panel/audiciones/${aid}/entrevista/${app}`);
        })}>{pending ? "…" : "Poner en escena"}</button>
      {err && <span role="alert" className="text-[11px] text-aviso">{err}</span>}
    </span>
  );
}
