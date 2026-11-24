"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { input } from "@/components/panel/ui";
import { validarCallback } from "@/lib/audicion-vivo-rules";
import { cerrarRonda } from "../../actions";
import { marcarCallback } from "../../votacion-actions";

// «Elegir callback» (0167): la lista (casillas name="pasa") llega como children. Abajo se elige si el callback es hoy
// mismo u otra fecha (fecha, hora y lugar) y «Llamar a callback» lo abre y les avisa (con su QR si es otra fecha),
// igual que «Terminar audiciones» en Modo audición. «Solo guardar» deja la selección sin avisar todavía.
export function LlamarCallback({ aid, children }: { aid: string; children: React.ReactNode }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [cuando, setCuando] = useState<"hoy" | "otra_fecha" | "">("");
  const [fecha, setFecha] = useState("");
  const [lugar, setLugar] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const pasan = () => (form.current ? new FormData(form.current).getAll("pasa").map(String) : []);
  const llamar = () => {
    const ids = pasan();
    const err = validarCallback(cuando, cuando === "otra_fecha" ? `${fecha}:00-06:00` : null, ids.length);
    if (err) { setMsg({ ok: false, texto: err }); return; }
    if (!confirm(`¿Llamar a ${ids.length} ${ids.length === 1 ? "persona" : "personas"} a callback ${cuando === "hoy" ? "hoy mismo" : "en la fecha que pusiste"}? Se les avisa en su cuenta${cuando === "otra_fecha" ? " y por correo con su QR" : ""}.`)) return;
    start(async () => {
      const r = await cerrarRonda(aid, { destino: "callback", pasan: ids, cuando: cuando as "hoy" | "otra_fecha", fecha, lugar });
      setMsg({ ok: r.ok, texto: r.message });
      if (r.ok) router.refresh();
    });
  };
  const guardar = () => {
    if (!form.current) return;
    const datos = new FormData(form.current);
    datos.set("aid", aid);
    start(async () => {
      const r = await marcarCallback(null, datos);
      setMsg(r ? { ok: r.ok, texto: r.ok ? "Selección guardada. Todavía no se les avisa: dale «Llamar a callback» cuando esté lista." : r.message } : null);
      if (r?.ok) router.refresh();
    });
  };

  return (
    <form ref={form} onSubmit={(e) => { e.preventDefault(); llamar(); }} className="flex flex-col gap-4">
      {children}
      <div className="flex flex-col gap-2 rounded-xl bg-sala p-3">
        <p className="text-sm font-bold">¿Cuándo es el callback?</p>
        <div className="flex flex-wrap gap-2">
          {([["hoy", "Hoy mismo"], ["otra_fecha", "Otra fecha"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setCuando(v)} aria-pressed={cuando === v}
              className={`rounded-full border px-4 py-2 text-sm font-bold ${cuando === v ? "border-texto bg-texto text-sala" : "border-white/25"}`}>{l}</button>
          ))}
        </div>
        {cuando === "otra_fecha" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold">Fecha y hora<input className={input} type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold">Lugar (opcional)<input className={input} value={lugar} maxLength={200} onChange={(e) => setLugar(e.target.value)} placeholder="Si es otro lugar" /></label>
          </div>
        )}
        {cuando === "hoy" && <p className="text-xs text-texto-3">Se les avisa en su cuenta que es hoy y que se queden cerca. La fila del callback se arma solo con los llamados.</p>}
        {cuando === "otra_fecha" && <p className="text-xs text-texto-3">Les llega el aviso con fecha, lugar y su mismo QR (y un recordatorio un día antes). Sale en el calendario del equipo.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className="rounded-full bg-texto px-5 py-3 text-sm font-bold text-sala disabled:opacity-60">{pending ? "Un momento…" : "Llamar a callback"}</button>
        <button type="button" disabled={pending} onClick={guardar} className="rounded-full border border-white/25 px-4 py-3 text-sm font-bold disabled:opacity-60">Solo guardar la selección</button>
      </div>
      {msg && <p role="status" className={`text-sm font-semibold ${msg.ok ? "text-exito" : "text-aviso"}`}>{msg.texto}</p>}
    </form>
  );
}
