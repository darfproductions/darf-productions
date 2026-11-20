"use client";

import { useState, useTransition } from "react";
import { Icono } from "@/components/Icono";
import { ligasSuscripcion } from "@/lib/calendario";
import { miCalendario } from "./actions";

const boton = "flex items-center justify-center gap-2 rounded-full border border-white/25 px-4 py-2.5 text-sm font-bold hover:border-white/60";

// 0156: "Mi calendario DARF": una liga privada por persona para suscribirse desde Google, Apple u Outlook. Trae solo
// lo de esta cuenta (ensayos y llamados, funciones, boletos, eventos, audiciones) y se actualiza solo.
export function MiCalendario() {
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [pending, start] = useTransition();
  const pedir = (nueva: boolean) => start(async () => {
    setMsg(null);
    const r = await miCalendario(nueva).catch(() => ({ ok: false as const, message: "Sin conexión. Intenta de nuevo." }));
    if (r.ok) { setUrl(r.url); setConfirmar(false); if (nueva) setMsg("Listo: tu liga cambió. La anterior ya no sirve; vuelve a agregar el calendario."); }
    else setMsg(r.message);
  });
  const copiar = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setMsg("Liga copiada."); } catch { setMsg("Copia la liga de arriba a mano."); }
  };
  const l = url ? ligasSuscripcion(url, "DARF · Mi calendario") : null;
  return (
    <section aria-labelledby="mi-calendario" className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
      <h2 id="mi-calendario" className="text-lg font-bold">Mi calendario DARF</h2>
      <p className="text-sm text-texto-2">Tus ensayos, llamados, funciones, boletos, eventos y audiciones en tu calendario (Google, Apple u Outlook). Se actualiza solo y solo trae lo tuyo.</p>
      {!l ? (
        <button type="button" disabled={pending} onClick={() => pedir(false)} className="self-start rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala disabled:opacity-60">
          {pending ? "Un momento…" : "Conectar mi calendario"}
        </button>
      ) : (
        <>
          <div className="grid gap-2">
            <a href={l.google} target="_blank" rel="noreferrer" className={boton}>Google Calendar <Icono nombre="externo" /></a>
            <a href={l.apple} className={boton}>Apple Calendar (iPhone, Mac)</a>
            <a href={l.outlook} target="_blank" rel="noreferrer" className={boton}>Outlook <Icono nombre="externo" /></a>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-texto-2">Otra app o hacerlo a mano</summary>
            <p className="mt-2 text-xs text-texto-3">En tu app de calendario busca «Agregar calendario desde URL» o «Suscribirse» y pega esta liga:</p>
            <p className="mt-1 select-all break-all rounded-lg bg-sala px-3 py-2 font-mono text-xs">{url}</p>
            <button type="button" onClick={copiar} className="mt-2 text-xs font-bold text-lila underline underline-offset-4">Copiar liga</button>
          </details>
          <p className="text-xs text-texto-3">Apple se actualiza en minutos; Google puede tardar hasta un día en reflejar un cambio. Los cambios de último momento te llegan también como aviso.</p>
          <p className="text-xs text-texto-3">La liga es solo tuya: quien la tenga puede ver tus fechas. Si la compartiste por error, cámbiala.</p>
          {!confirmar
            ? <button type="button" onClick={() => setConfirmar(true)} className="self-start text-xs font-bold text-texto-3 underline underline-offset-4">Cambiar mi liga</button>
            : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-aviso/40 bg-aviso/10 p-3 text-xs">
                <span className="flex-1">La liga actual deja de servir y tendrás que volver a agregar el calendario.</span>
                <button type="button" disabled={pending} onClick={() => pedir(true)} className="rounded-full bg-texto px-3 py-1.5 font-bold text-sala disabled:opacity-60">Sí, cambiarla</button>
                <button type="button" onClick={() => setConfirmar(false)} className="font-bold underline">No</button>
              </div>
            )}
        </>
      )}
      {msg && <p role="status" className="text-sm font-semibold">{msg}</p>}
    </section>
  );
}
