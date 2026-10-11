"use client";

import { useActionState, useState } from "react";
import { ageAt, lugares } from "@/lib/audition-rules";
import type { AuditionField, AuditionRole, AuditionSlot, MyApplication } from "@/lib/auditions";
import { checkImage } from "@/lib/image-rules";
import { createClient } from "@/lib/supabase/client";
import { applyToAudition, type ApplyState } from "./actions";

const field = "rounded-lg bg-sala px-3 py-3 font-normal";
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Formulario de inscripción. Si la persona es menor (a la fecha de la audición) y la
// convocatoria lo pide, solicita datos y autorización de su madre, padre o tutor.
// Foto y horario también dependen de las opciones de la convocatoria (0037).
export function ApplyForm(props: {
  aid: string;
  userId: string;
  roles: AuditionRole[];
  fields: AuditionField[];
  slots: AuditionSlot[];
  fechaAudicion: string | null;
  opciones: { pedirFoto: boolean; pedirTutor: boolean };
  defaults: { nombre: string; telefono: string };
  previa: MyApplication | null;
}) {
  const p = props.previa;
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyToAudition, null);
  const [nac, setNac] = useState(p?.fecha_nacimiento ?? "");
  const [foto, setFoto] = useState(p?.foto_path ?? "");
  const [fotoMsg, setFotoMsg] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const fechaAudicion = props.fechaAudicion ? new Date(props.fechaAudicion) : new Date();
  const edad = nac ? ageAt(nac, fechaAudicion) : null;
  const menor = edad !== null && edad < 18 && props.opciones.pedirTutor;

  async function subirFoto(file: File) {
    setFotoMsg("");
    setSubiendo(true);
    try {
      const bmp = await createImageBitmap(file);
      const check = checkImage("retrato", { type: file.type, size: file.size, width: bmp.width, height: bmp.height });
      bmp.close();
      if (!check.ok) return setFotoMsg(check.errors.join(" "));
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${props.aid}/${props.userId}/foto-${Date.now().toString(36)}.${ext}`;
      const { error } = await createClient().storage.from("audiciones").upload(path, file, { contentType: file.type });
      if (error) return setFotoMsg(`No se pudo subir: ${error.message}`);
      setFoto(path);
      setFotoMsg(["Foto lista.", ...check.warnings].join(" "));
    } catch {
      setFotoMsg("No se pudo leer la imagen.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <form action={action} className="grid gap-4 rounded-2xl bg-telon p-6 sm:grid-cols-2">
      <input type="hidden" name="aid" value={props.aid} />
      <input type="hidden" name="foto_path" value={foto} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre completo *
        <input className={field} name="nombre" required defaultValue={p?.nombre ?? props.defaults.nombre} autoComplete="name" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono *
        <input className={field} name="telefono" type="tel" required defaultValue={p?.telefono ?? props.defaults.telefono} autoComplete="tel" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Fecha de nacimiento *
        <input className={field} name="fecha_nacimiento" type="date" required value={nac} onChange={(e) => setNac(e.target.value)} />
        {edad !== null && <span className="text-xs font-normal text-texto-3">Tendrás {edad} años el día de la audición.</span>}
      </label>
      {props.opciones.pedirFoto && <div className="flex flex-col gap-1.5 text-sm font-semibold">Foto (rostro, vertical)
        <label className="cursor-pointer self-start rounded-full border border-white/25 px-4 py-2.5 text-sm font-bold hover:border-white/50">
          {subiendo ? "Subiendo…" : foto ? "Cambiar foto" : "Subir foto"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={subiendo} onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirFoto(f); }} />
        </label>
        {fotoMsg && <span className="text-xs font-normal text-texto-2">{fotoMsg}</span>}
      </div>}

      {props.roles.length > 0 && (
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-semibold">¿Para qué personajes audicionas?</legend>
          <div className="flex flex-wrap gap-2">
            {props.roles.map((r) => (
              <label key={r.id} className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-sm has-[:checked]:border-white">
                <input type="checkbox" name="roles" value={r.id} defaultChecked={p?.roles.includes(r.id)} /> {r.nombre}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {props.slots.length > 0 && (
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-semibold">Elige tu horario *</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {props.slots.map((s) => {
              const libres = lugares(s.cupo, s.ocupados) + (p?.slot_id === s.id && p.estado !== "cancelado" ? 1 : 0);
              return (
                <label key={s.id} className={`flex items-center gap-3 rounded-lg bg-sala px-3 py-3 text-sm ${libres ? "cursor-pointer" : "opacity-50"}`}>
                  <input type="radio" name="slot_id" value={s.id} required disabled={!libres} defaultChecked={p?.slot_id === s.id} />
                  <span><span className="font-bold capitalize">{fmt(s.inicia)}</span>{s.sala ? ` · ${s.sala}` : ""}<span className="block text-texto-3">{libres ? `${libres} lugares` : "Lleno"}</span></span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {props.fields.map((f) => {
        const name = `campo_${f.id}`;
        const def = p?.respuestas?.[f.id] ?? "";
        const label = `${f.etiqueta}${f.obligatorio ? " *" : ""}`;
        if (f.tipo === "parrafo")
          return <label key={f.id} className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">{label}<textarea className={`${field} min-h-28`} name={name} required={f.obligatorio} defaultValue={def} /></label>;
        if (f.tipo === "opcion" || f.tipo === "si_no") {
          const ops = f.tipo === "si_no" ? ["Sí", "No"] : f.opciones ?? [];
          return (
            <label key={f.id} className="flex flex-col gap-1.5 text-sm font-semibold">{label}
              <select className={field} name={name} required={f.obligatorio} defaultValue={def}>
                <option value="">Elige…</option>
                {ops.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          );
        }
        return <label key={f.id} className="flex flex-col gap-1.5 text-sm font-semibold">{label}<input className={field} name={name} type={f.tipo === "enlace" ? "url" : "text"} required={f.obligatorio} defaultValue={def} placeholder={f.tipo === "enlace" ? "https://" : ""} /></label>;
      })}

      {menor && (
        <fieldset className="grid gap-3 rounded-xl border border-[#f2b544]/40 p-4 sm:col-span-2 sm:grid-cols-3">
          <legend className="px-1 text-sm font-bold text-[#f2b544]">Eres menor de edad: datos de tu madre, padre o tutor</legend>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre *<input className={field} name="tutor_nombre" required defaultValue={p?.tutor_nombre ?? ""} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono *<input className={field} name="tutor_telefono" type="tel" required defaultValue={p?.tutor_telefono ?? ""} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo<input className={field} name="tutor_email" type="email" defaultValue={p?.tutor_email ?? ""} /></label>
          <label className="flex items-start gap-2 text-sm sm:col-span-3"><input type="checkbox" name="consentimiento_tutor" required className="mt-1" /> Como madre, padre o tutor, autorizo esta inscripción y que se usen sus datos solo para esta audición.</label>
        </fieldset>
      )}

      <div className="flex flex-col gap-2 text-sm sm:col-span-2">
        <label className="flex items-start gap-2"><input type="checkbox" name="consentimiento_datos" required className="mt-1" /> Autorizo a DARF Productions a usar mis datos solo para esta audición. *</label>
        <label className="flex items-start gap-2"><input type="checkbox" name="consentimiento_imagen" defaultChecked={p?.consentimiento_imagen} className="mt-1" /> Autorizo que se tomen fotos o video durante la audición para uso interno de la producción.</label>
      </div>

      {state && <p role={state.ok ? "status" : "alert"} className={`sm:col-span-2 ${state.ok ? "text-[#7ee2a8]" : "text-[#ff8fa3]"}`}>{state.message}</p>}
      <button disabled={pending || subiendo} className="boton-compra rounded-full px-6 py-4 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-60 sm:col-span-2">
        {pending ? "Enviando…" : p && p.estado !== "cancelado" ? "Guardar cambios" : "Inscribirme"}
      </button>
    </form>
  );
}
