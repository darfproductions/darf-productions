"use client";

import { useState, useTransition } from "react";
import { avisoAnticipacion, TIPOS_EVENTO } from "@/lib/showcase-rules";
import { solicitarShowcase } from "../../actions";

const field = "rounded-lg bg-sala px-3 py-3 font-normal";

// Formulario para contratar un showcase (0121): se guarda en el panel y abre WhatsApp con todo.
export function ContratarForm({ planId, planNombre, nombre: nombreInicial, telefono: telInicial, correo: correoInicial }: {
  planId: string; planNombre: string; nombre?: string; telefono?: string; correo?: string;
}) {
  const [f, setF] = useState({ nombre: nombreInicial ?? "", telefono: telInicial ?? "", correo: correoInicial ?? "", fecha: "", horario: "", lugar: "", tipo: "", personas: "", notas: "" });
  const [error, setError] = useState("");
  const [wa, setWa] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const aviso = avisoAnticipacion(f.fecha || null);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await solicitarShowcase(planId, { planNombre, nombre: f.nombre, telefono: f.telefono, correo: f.correo, fecha: f.fecha, horario: f.horario, lugar: f.lugar, tipo: f.tipo, personas: f.personas ? Number(f.personas) : null, notas: f.notas });
      if (!r.ok) return setError(r.message);
      setWa(r.whatsappUrl);
      if (r.whatsappUrl) window.location.assign(r.whatsappUrl);
    });
  }

  if (wa) {
    return (
      <div role="status" className="flex max-w-2xl flex-col items-start gap-4 rounded-2xl bg-telon p-8">
        <p className="titular text-3xl">¡Recibimos tu solicitud!</p>
        <p className="text-texto-2">Te estamos llevando a WhatsApp con la información para seguir ahí. Si no se abrió, toca el botón.</p>
        <a href={wa} className="rounded-full bg-[#25d366] px-6 py-4 text-sm font-bold text-[#062b16]">Abrir WhatsApp</a>
      </div>
    );
  }
  return (
    <form onSubmit={enviar} className="flex max-w-2xl flex-col gap-4 rounded-2xl bg-telon p-6 md:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Tu nombre *<input required minLength={2} maxLength={120} autoComplete="name" className={field} value={f.nombre} onChange={set("nombre")} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono (WhatsApp) *<input required type="tel" autoComplete="tel" className={field} value={f.telefono} onChange={set("telefono")} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo (opcional)<input type="email" autoComplete="email" className={field} value={f.correo} onChange={set("correo")} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Fecha del evento<input type="date" className={field} value={f.fecha} onChange={set("fecha")} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Horario<input className={field} placeholder="Ej. 6:00 p.m." maxLength={60} value={f.horario} onChange={set("horario")} /></label>
        {aviso && <p className="rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm sm:col-span-2">{aviso}</p>}
        <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Lugar o ciudad<input className={field} maxLength={200} placeholder="Ej. Colegio ABC, Querétaro" value={f.lugar} onChange={set("lugar")} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Tipo de evento
          <select className={field} value={f.tipo} onChange={set("tipo")}><option value="">Elige…</option>{TIPOS_EVENTO.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">¿Cuántas personas asisten?<input type="number" min={1} max={100000} inputMode="numeric" className={field} value={f.personas} onChange={set("personas")} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Notas o especificaciones
          <textarea maxLength={1500} className={`${field} min-h-28`} placeholder="Medidas del espacio, audio e iluminación, canciones o temas que te gustaría…" value={f.notas} onChange={set("notas")} />
        </label>
      </div>
      {error && <p role="alert" className="text-[#ff8fa3]">{error}</p>}
      <button disabled={pending} className="fb fb-luz self-start disabled:opacity-50">{pending ? "Enviando…" : "Enviar y seguir en WhatsApp"}</button>
      <p className="text-xs text-texto-3">Guardamos tu solicitud para darle seguimiento y abrimos WhatsApp con esta información. La fecha, el pago y las condiciones se confirman por escrito con DARF.</p>
    </form>
  );
}
