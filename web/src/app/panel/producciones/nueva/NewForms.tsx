"use client";

import { useActionState, useState } from "react";
import { Notice, button, input } from "@/components/panel/ui";
import { productionIdFrom } from "@/lib/panel-nav";
import { TIPOS_OBRA } from "@/lib/tipo-obra-rules";
import { duplicateProduction, type NewState } from "./actions";
import { crearProyecto } from "../obra-actions";

function NameFields({ nombreDefault = "" }: { nombreDefault?: string }) {
  const [nombre, setNombre] = useState(nombreDefault);
  const [temporada, setTemporada] = useState("");
  const [id, setId] = useState("");
  const [tocado, setTocado] = useState(false);
  const sugerido = productionIdFrom(nombre, temporada);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold">Nombre de la obra
        <input className={input} name="nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Teen Beach Movie" />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold">Temporada
        <input className={input} name="temporada" value={temporada} onChange={(e) => setTemporada(e.target.value)} placeholder="2027" />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Dirección web
        <span className="flex flex-wrap items-center gap-1 text-texto-3">
          <span className="break-all">darfproductions.com/producciones/</span>
          <input className={`${input} min-w-0 flex-1 basis-48`} name="id" required value={tocado ? id : sugerido} onChange={(e) => { setTocado(true); setId(e.target.value); }} pattern="[a-z0-9][a-z0-9_\-]{1,39}" />
        </span>
        <span className="text-xs font-normal text-texto-3">Solo minúsculas, números y guiones. No se puede cambiar después.</span>
      </label>
    </div>
  );
}

export function CreateForm() {
  const [state, run, pending] = useActionState<NewState, FormData>(crearProyecto, null);
  return (
    <form action={run} className="flex flex-col gap-4">
      <NameFields />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Tipo de producción <span className="font-normal text-texto-3">(se puede cambiar después en Ficha de la producción)</span></legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPOS_OBRA.map((t, i) => (
            <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/15 p-3 has-[:checked]:border-texto has-[:checked]:bg-telon-2">
              <input type="radio" name="tipo" value={t.id} defaultChecked={i === 0} className="mt-1" />
              <span className="text-sm"><b>{t.label}</b><span className="block text-xs text-texto-2">{t.que}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-sm text-texto-2">Luego te llevamos paso a paso: identidad (logo, fondo y colores), ficha, equipo y personajes.</p>
      <button disabled={pending} className={`${button} self-start`}>{pending ? "Creando…" : "Empezar"}</button>
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
    </form>
  );
}

export function DuplicateForm({ obras }: { obras: { id: string; nombre: string }[] }) {
  const [state, run, pending] = useActionState<NewState, FormData>(duplicateProduction, null);
  return (
    <form action={run} className="flex flex-col gap-4">
      <label className="flex max-w-md flex-col gap-1.5 text-sm font-semibold">Obra original
        <select className={input} name="src" required defaultValue="">
          <option value="" disabled>Elige…</option>
          {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      </label>
      <NameFields />
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-semibold">Qué copiar además del kit, textos y ficha</legend>
        <label className="flex items-center gap-2"><input type="checkbox" name="canciones" defaultChecked /> Canciones y actos</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="equipos" defaultChecked /> Equipos (creativo, producción, crew, técnico) — sin fotos ni reparto</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="permisos" /> Permisos del panel (quién tiene qué rol)</label>
      </fieldset>
      <button disabled={pending} className={`${button} self-start`}>{pending ? "Duplicando…" : "Duplicar en borrador"}</button>
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
    </form>
  );
}
