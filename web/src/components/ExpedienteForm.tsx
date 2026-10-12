"use client";

import { useActionState } from "react";
import { saveMemberFile, type FileState } from "@/app/expediente/actions";
import type { PersonFile } from "@/lib/member-rules";

const field = "rounded-lg border border-white/10 bg-sala px-3 py-2.5 font-normal text-texto";
const lbl = "flex flex-col gap-1.5 text-sm font-semibold";

// Formulario del expediente único de la persona (lo usan el integrante y la producción).
// "propio": lo llena la persona; al guardar confirma que sus datos están vigentes en esta obra.
export function ExpedienteForm({ pid, uid, f, esMenor, propio }: { pid: string; uid: string; f: PersonFile | null; esMenor: boolean; propio?: boolean }) {
  const [state, run, pending] = useActionState<FileState, FormData>(saveMemberFile, null);
  const v = (k: keyof PersonFile) => (f?.[k] ?? "") as string | number;
  return (
    <form action={run} className="flex flex-col gap-5">
      <input type="hidden" name="pid" value={pid} />
      <input type="hidden" name="uid" value={uid} />
      {propio && <input type="hidden" name="confirmar" value="on" />}
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-bold">Datos personales</legend>
        <label className={lbl}>Fecha de nacimiento *<input className={field} type="date" name="fecha_nacimiento" defaultValue={v("fecha_nacimiento")} /></label>
        <label className={lbl}>Teléfono *<input className={field} type="tel" name="telefono" defaultValue={v("telefono")} /></label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-bold">Contacto de emergencia *</legend>
        <label className={lbl}>Nombre<input className={field} name="emergencia_nombre" defaultValue={v("emergencia_nombre")} /></label>
        <label className={lbl}>Teléfono<input className={field} type="tel" name="emergencia_telefono" defaultValue={v("emergencia_telefono")} /></label>
        <label className={lbl}>Parentesco<input className={field} name="emergencia_parentesco" defaultValue={v("emergencia_parentesco")} /></label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-bold">Madre, padre o tutor {esMenor ? "*" : "(si eres menor de edad)"}</legend>
        <label className={lbl}>Nombre<input className={field} name="tutor_nombre" defaultValue={v("tutor_nombre")} /></label>
        <label className={lbl}>Teléfono<input className={field} type="tel" name="tutor_telefono" defaultValue={v("tutor_telefono")} /></label>
        <label className={lbl}>Correo<input className={field} type="email" name="tutor_email" defaultValue={v("tutor_email")} /></label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-bold">Salud (solo lo ve la producción)</legend>
        <label className={lbl}>Alergias * <span className="font-normal text-texto-3">(escribe “Ninguna” si no hay)</span><input className={field} name="alergias" defaultValue={v("alergias")} /></label>
        <label className={lbl}>Tipo de sangre<input className={field} name="tipo_sangre" defaultValue={v("tipo_sangre")} placeholder="O+, A-…" /></label>
        <label className={lbl}>Condiciones médicas o lesiones<textarea className={`${field} min-h-16`} name="condiciones" defaultValue={v("condiciones")} /></label>
        <label className={lbl}>Medicamentos<textarea className={`${field} min-h-16`} name="medicamentos" defaultValue={v("medicamentos")} /></label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-bold">Medidas para vestuario</legend>
        <label className={lbl}>Altura (cm)<input className={field} type="number" step="0.5" name="altura_cm" defaultValue={v("altura_cm")} /></label>
        <label className={lbl}>Pecho (cm)<input className={field} type="number" step="0.5" name="pecho_cm" defaultValue={v("pecho_cm")} /></label>
        <label className={lbl}>Cintura (cm)<input className={field} type="number" step="0.5" name="cintura_cm" defaultValue={v("cintura_cm")} /></label>
        <label className={lbl}>Cadera (cm)<input className={field} type="number" step="0.5" name="cadera_cm" defaultValue={v("cadera_cm")} /></label>
        <label className={lbl}>Talla de ropa<input className={field} name="talla_ropa" defaultValue={v("talla_ropa")} placeholder="CH, M, G…" /></label>
        <label className={lbl}>Calzado (MX)<input className={field} name="talla_calzado" defaultValue={v("talla_calzado")} /></label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="rounded-full bg-texto px-6 py-3 text-sm font-bold text-sala disabled:opacity-60">{pending ? "Guardando…" : "Guardar expediente"}</button>
        {state && <span role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
