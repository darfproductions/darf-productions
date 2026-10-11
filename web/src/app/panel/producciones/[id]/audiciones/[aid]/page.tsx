import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { lugares } from "@/lib/audition-rules";
import { formatSlot } from "@/lib/auditions";
import { isoToLocalMx } from "@/lib/dates";
import { getPanelAudition } from "@/lib/panel-auditions";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addField, addRole, addSlot, removeItem, saveAudition, setAuditionEstado } from "../actions";

export const metadata: Metadata = { title: "Configurar audición" };

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";
const TIPOS: Record<string, string> = { texto: "Texto corto", parrafo: "Párrafo", enlace: "Enlace (video, portafolio)", opcion: "Opciones", si_no: "Sí / No" };
const ESTADOS = [
  { estado: "abierta", label: "Abrir inscripción", confirm: "¿Abrir la convocatoria? Aparecerá en la web y la gente podrá inscribirse." },
  { estado: "cerrada", label: "Cerrar inscripción", confirm: "¿Cerrar la inscripción? Ya nadie podrá inscribirse." },
  { estado: "finalizada", label: "Finalizar", confirm: "¿Marcar como finalizada?" },
  { estado: "borrador", label: "Volver a borrador", confirm: "¿Regresar a borrador? Deja de verse en la web." },
];

export default async function AuditionConfig({ params }: PageProps<"/panel/producciones/[id]/audiciones/[aid]">) {
  const { id, aid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/audiciones/${aid}`);
  if (!can(access, id, "audiciones.gestionar")) {
    redirect(`/panel/producciones/${id}/audiciones/${aid}/${can(access, id, "audiciones.evaluar") ? "evaluacion" : "registro"}`);
  }
  const a = await getPanelAudition(aid);
  if (!a) redirect(`/panel/producciones/${id}/audiciones`);
  const supabase = await createClient();
  const [roles, slots, fields] = await Promise.all([
    supabase.from("audition_roles").select("id, nombre, descripcion").eq("audition_id", aid).order("orden"),
    supabase.rpc("audition_slot_availability", { aid }),
    supabase.from("audition_fields").select("id, etiqueta, tipo, opciones, obligatorio").eq("audition_id", aid).order("orden"),
  ]);
  const h = { pid: id, aid };

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="titular text-xl">Publicación</h2>
          {a.estado !== "borrador" && <Link href={`/audiciones/${aid}`} target="_blank" className="text-sm font-bold text-violeta-claro">Ver página pública ↗</Link>}
        </div>
        <div className="flex flex-wrap gap-2">
          {ESTADOS.filter((e) => e.estado !== a.estado).map((e) => (
            <ActionForm key={e.estado} inline action={setAuditionEstado} hidden={{ ...h, estado: e.estado }} confirm={e.confirm} submit={e.label} submitClass={e.estado === "abierta" ? "boton-compra rounded-full px-5 py-2 text-sm font-bold" : "rounded-full border border-white/25 px-4 py-2 text-sm font-bold"} />
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="titular mb-3 text-xl">Datos</h2>
        <ActionForm action={saveAudition} hidden={h} submit="Guardar datos">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Título<input className={input} name="titulo" required defaultValue={a.titulo} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Descripción<textarea className={`${input} min-h-24`} name="descripcion" defaultValue={a.descripcion ?? ""} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Requisitos (qué preparar, qué llevar)<textarea className={`${input} min-h-24`} name="requisitos" defaultValue={a.requisitos ?? ""} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Sede<input className={input} name="sede" defaultValue={a.sede ?? ""} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Inscripción hasta (CDMX)<input className={input} type="datetime-local" name="cierra" defaultValue={isoToLocalMx(a.inscripcion_cierra)} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Edad mínima<input className={input} type="number" min={3} max={99} name="edad_min" defaultValue={a.edad_min ?? ""} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Edad máxima<input className={input} type="number" min={3} max={99} name="edad_max" defaultValue={a.edad_max ?? ""} /></label>
          </div>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Personajes</h2>
        <ul className="flex flex-col gap-2">
          {(roles.data ?? []).map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 rounded-lg bg-sala px-3 py-2">
              <span><b>{r.nombre}</b>{r.descripcion && <span className="block text-sm text-texto-3">{r.descripcion}</span>}</span>
              <ActionForm inline action={removeItem} hidden={{ ...h, tabla: "audition_roles", id: r.id }} confirm={`¿Quitar a ${r.nombre}?`} submit="Quitar" submitClass={ghost} />
            </li>
          ))}
        </ul>
        <ActionForm action={addRole} hidden={h} submit="Agregar personaje">
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input className={input} name="nombre" required placeholder="Personaje" />
            <input className={input} name="descripcion" placeholder="Descripción breve (edad, tesitura, baile…)" />
          </div>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Horarios</h2>
        <ul className="flex flex-col gap-2">
          {((slots.data ?? []) as { id: string; inicia: string; sala: string | null; cupo: number; ocupados: number }[]).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sala px-3 py-2 text-sm">
              <span><b className="capitalize">{formatSlot(s.inicia)}</b>{s.sala ? ` · ${s.sala}` : ""} · {s.ocupados} de {s.cupo} ({lugares(s.cupo, s.ocupados)} libres)</span>
              <ActionForm inline action={removeItem} hidden={{ ...h, tabla: "audition_slots", id: s.id }} confirm={s.ocupados ? `Este horario tiene ${s.ocupados} inscritos; quedarán sin horario. ¿Quitarlo?` : "¿Quitar este horario?"} submit="Quitar" submitClass={ghost} />
            </li>
          ))}
        </ul>
        <ActionForm action={addSlot} hidden={h} submit="Agregar horario">
          <div className="grid gap-2 sm:grid-cols-3">
            <input className={input} type="datetime-local" name="inicia" required aria-label="Fecha y hora" />
            <input className={input} type="number" min={1} max={500} name="cupo" required placeholder="Cupo" />
            <input className={input} name="sala" placeholder="Sala (opcional)" />
          </div>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Preguntas del formulario</h2>
        <p className="text-sm text-texto-2">Nombre, teléfono, fecha de nacimiento, foto, personajes y horario ya se piden siempre. Pide solo lo necesario.</p>
        <ul className="flex flex-col gap-2">
          {(fields.data ?? []).map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg bg-sala px-3 py-2 text-sm">
              <span><b>{f.etiqueta}</b> · {TIPOS[f.tipo]}{f.obligatorio ? " · obligatoria" : ""}{f.opciones ? ` (${(f.opciones as string[]).join(", ")})` : ""}</span>
              <ActionForm inline action={removeItem} hidden={{ ...h, tabla: "audition_fields", id: f.id }} confirm="¿Quitar esta pregunta?" submit="Quitar" submitClass={ghost} />
            </li>
          ))}
        </ul>
        <ActionForm action={addField} hidden={h} submit="Agregar pregunta">
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
            <input className={input} name="etiqueta" required placeholder="Ej. Enlace a video cantando" />
            <select className={input} name="tipo" defaultValue="texto">{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input className={`${input} sm:col-span-2`} name="opciones" placeholder="Si es de opciones: Soprano, Contralto, Tenor, Barítono" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="obligatorio" /> Obligatoria</label>
        </ActionForm>
      </Card>
    </>
  );
}
