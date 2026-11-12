"use client";

import { useActionState, useState } from "react";
import { Icono } from "@/components/Icono";
import { ligaTraspaso, whatsappTraspasoUrl } from "@/lib/traspaso-rules";
import { crearTraspaso, type TraspasoState } from "../../../actions";

const campo = "w-full min-w-0 rounded-lg border border-white/10 bg-sala px-3 py-2.5 text-texto outline-none focus:border-violeta-claro";

// Elegir qué boletos, a qué correo, y mandar. Al terminar, la liga para compartir por WhatsApp.
export function PasarForm({ order, boletos, obra, funcion, origen }: { order: string; boletos: { id: string; etiqueta: string }[]; obra: string; funcion: string; origen: string }) {
  const [state, run, pending] = useActionState<TraspasoState, FormData>(crearTraspaso, null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set(boletos.length === 1 ? [boletos[0].id] : []));
  const [copiada, setCopiada] = useState(false);
  if (state?.ok && state.token) {
    const liga = ligaTraspaso(origen, state.token);
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-exito/40 bg-telon p-5">
        <p className="font-bold"><Icono nombre="check" /> {state.message}</p>
        <p className="text-sm text-texto-2">Cuando acepte, los boletos aparecen en su cuenta con QR nuevos y salen de la tuya. Hasta entonces siguen contigo y puedes cancelar el traspaso desde Mi cuenta.</p>
        <div className="flex flex-wrap items-center gap-2">
          <a href={whatsappTraspasoUrl({ obra, funcion, boletos: marcados.size, liga })} target="_blank" rel="noreferrer" className="rounded-full bg-[#25d366] px-5 py-3 text-sm font-bold text-[#062b16]">Mandar la liga por WhatsApp</a>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(liga).then(() => setCopiada(true)); }} className="rounded-full border border-white/30 px-5 py-3 text-sm font-bold hover:border-white/60">{copiada ? "Liga copiada" : "Copiar liga"}</button>
        </div>
        <a href="/cuenta" className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Volver a Mi cuenta</a>
      </div>
    );
  }
  const toggle = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <form action={run} className="flex flex-col gap-5 rounded-2xl bg-telon p-5">
      <input type="hidden" name="order" value={order} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">¿Qué boletos pasas?</legend>
        {boletos.map((b) => (
          <label key={b.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${marcados.has(b.id) ? "border-violeta-claro bg-ciruela/20" : "border-white/10 bg-sala hover:border-white/30"}`}>
            <input type="checkbox" name="ticket" value={b.id} checked={marcados.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4" />
            <b>{b.etiqueta}</b>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo de la persona
        <input name="email" type="email" required autoComplete="off" className={campo} placeholder="ella@correo.com" />
        <span className="text-xs font-normal text-texto-3">Si ya tiene cuenta en DARF con ese correo, le avisamos y solo ella podrá aceptar. Si no, le mandas la liga y la acepta al crear su cuenta.</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Mensaje (opcional)
        <input name="mensaje" maxLength={300} className={campo} placeholder="Ej. Para ti y tu mamá, ¡nos vemos ahí!" />
      </label>
      <p className="text-xs text-texto-3">Al aceptar, se generan QR nuevos y los boletos que pasaste dejan de servir en tu cuenta (PDF y Wallet incluidos). Se puede hasta antes de que empiece la función.</p>
      <button disabled={pending || marcados.size === 0} className="self-start rounded-full bg-texto px-6 py-3 text-sm font-bold text-sala disabled:opacity-50">
        {pending ? "Enviando…" : marcados.size === 1 ? "Pasar 1 boleto" : `Pasar ${marcados.size} boletos`}
      </button>
      {state && !state.ok && <p role="alert" className="text-sm font-semibold text-[#ff8fa3]">{state.message}</p>}
    </form>
  );
}
