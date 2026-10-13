import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { porCarpeta } from "@/lib/materials";
import { cuando } from "@/lib/panel-home-rules";
import { getTeamSpace, signTeamFiles, teamReadStatus, teamRoles, teamRoster } from "@/lib/team";
import {
  closeMeeting, removeMeeting, removeTeamAnnouncement, removeTeamMaterial, removeTeamNote,
  saveMeeting, saveTeamMaterial, sendTeamAnnouncement, sendTeamNote,
} from "@/lib/team-actions";
import { acuerdosTexto, espacioId, teamAudienceLabel, TIPO_JUNTA } from "@/lib/team-rules";
import { MaterialComments } from "./MaterialComments";
import { PeopleChecks, TeamAudienceFields } from "./TeamAudienceFields";
import { TeamFileUpload } from "./TeamFileUpload";

const quitar = "text-xs font-bold text-[#ff8fa3]";
const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

export const SECCIONES = [
  { id: "notas", label: "Notas de dirección" },
  { id: "juntas", label: "Juntas y llamados" },
  { id: "avisos", label: "Avisos" },
  { id: "materiales", label: "Materiales" },
] as const;
export type Seccion = (typeof SECCIONES)[number]["id"];

// Portal del equipo para quien lo maneja (0065): notas de dirección, juntas (con resumen y
// transcript al terminar), avisos con "Enterado" y materiales. pid null = espacio general de DARF.
export async function TeamManager({ pid, seccion, base }: { pid: string | null; seccion: Seccion; base: string }) {
  const [space, roles, gente] = await Promise.all([getTeamSpace(pid), teamRoles(), teamRoster(pid)]);
  const esp = espacioId(pid);
  const h = { espacio: esp };
  const rolNombre = new Map(roles.map((r) => [r.id, r.nombre]));
  const persona = new Map(gente.map((g) => [g.user_id, g.nombre]));
  const files = await signTeamFiles([...space.materiales.map((m) => m.archivo_path), ...space.juntas.map((j) => j.transcript_path)]);
  const pendientes = space.notas.filter((n) => !n.atendida_at).length;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Portal del equipo" className="flex flex-wrap gap-2 text-sm">
        {SECCIONES.map((s) => (
          <Link key={s.id} href={`${base}?seccion=${s.id}`} className={`rounded-full border px-3 py-1.5 font-semibold ${seccion === s.id ? "border-texto" : "border-white/20 hover:border-white/50"}`}>
            {s.label}{s.id === "notas" && pendientes ? ` (${pendientes})` : ""}
          </Link>
        ))}
        <Link href={`/cuenta/equipo/${esp}`} className="ml-auto text-sm font-bold text-violeta-claro">Ver como lo ve el equipo ↗</Link>
      </nav>

      {seccion === "notas" && (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="titular text-xl">Nueva nota</h2>
            <p className="text-sm text-texto-2">Para un rol o personas del equipo. Quien la recibe la marca como atendida y puede responder.</p>
            <ActionForm action={sendTeamNote} hidden={h} submit="Enviar nota">
              <input className={input} name="contexto" placeholder="Contexto (opcional): Ensayo general 14/oct" maxLength={120} />
              <textarea className={`${input} min-h-24`} name="cuerpo" required maxLength={3000} placeholder="Ej. Revisar la entrada de luces del acto 2; el seguidor llega tarde." />
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="mb-1 font-semibold">¿Para quién?</legend>
                <div className="flex flex-wrap gap-3">{roles.map((r) => <label key={r.id} className="flex items-center gap-1 text-xs"><input type="checkbox" name="para_roles" value={r.id} /> {r.nombre}</label>)}</div>
                <PeopleChecks gente={gente} name="para_personas" />
              </fieldset>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="urgente" /> Urgente</label>
            </ActionForm>
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="titular text-xl">Notas enviadas</h2>
            {space.notas.length === 0 && <p className="text-sm text-texto-2">Aún no hay notas.</p>}
            {space.notas.map((n) => (
              <div key={n.id} className="flex flex-col gap-1 rounded-xl bg-sala p-4 text-sm">
                <p className="text-xs text-texto-3">
                  {n.contexto ? `${n.contexto} · ` : ""}{fecha(n.created_at)} · Para: {[...n.para_roles.map((r) => rolNombre.get(r) ?? r), ...n.para_personas.map((p) => persona.get(p) ?? "—")].join(", ")}
                  {n.prioridad === "urgente" && <b className="ml-2 text-[#ff8fa3]">URGENTE</b>}
                </p>
                <p className="whitespace-pre-line">{n.cuerpo}</p>
                {n.atendida_at ? (
                  <p className="text-xs text-exito">✓ Atendida por {persona.get(n.atendida_por ?? "") ?? "alguien del equipo"} · {fecha(n.atendida_at)}{n.respuesta ? ` — “${n.respuesta}”` : ""}</p>
                ) : <p className="text-xs text-aviso">Pendiente</p>}
                <ActionForm inline action={removeTeamNote} hidden={{ ...h, id: n.id }} confirm="¿Borrar esta nota?" submit="Borrar" submitClass={quitar} />
              </div>
            ))}
          </Card>
        </>
      )}

      {seccion === "juntas" && (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="titular text-xl">Agendar junta o llamado</h2>
            <ActionForm action={saveMeeting} hidden={h} submit="Agendar">
              <div className="grid gap-2 sm:grid-cols-3">
                <select className={input} name="tipo" defaultValue="junta" aria-label="Tipo">{Object.entries(TIPO_JUNTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <input className={`${input} sm:col-span-2`} name="titulo" required placeholder="Ej. Junta de producción" />
                <input className={input} name="inicia" type="datetime-local" required aria-label="Fecha y hora" />
                <input className={input} name="lugar" placeholder="Lugar (opcional)" />
                <input className={input} name="enlace" type="url" placeholder="Videollamada https:// (opcional)" />
              </div>
              <textarea className={`${input} min-h-20`} name="agenda" placeholder="Agenda (opcional): temas a tratar" />
              <TeamAudienceFields roles={roles} gente={gente} pregunta="¿Quién va?" />
            </ActionForm>
          </Card>
          {space.juntas.length === 0 && <Card><p className="text-sm text-texto-2">Aún no hay juntas.</p></Card>}
          {space.juntas.map((j) => (
            <Card key={j.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold">{TIPO_JUNTA[j.tipo] ?? j.tipo}: {j.titulo}</p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${j.estado === "realizada" ? "bg-[#14532d] text-[#bbf7d0]" : "bg-telon-2 text-texto-2"}`}>{j.estado === "realizada" ? "Realizada" : "Programada"}</span>
              </div>
              <p className="text-sm text-texto-2">{cuando(j.inicia)}{j.lugar ? ` · ${j.lugar}` : ""} · {teamAudienceLabel(j, rolNombre, persona)}
                {j.enlace && <> · <a href={j.enlace} target="_blank" rel="noreferrer" className="font-bold text-violeta-claro">Videollamada ↗</a></>}</p>
              {j.agenda && <p className="whitespace-pre-line text-sm"><b>Agenda:</b> {j.agenda}</p>}
              <details className="rounded-xl bg-sala p-4" open={j.estado === "programada" && new Date(j.inicia) < new Date()}>
                <summary className="cursor-pointer text-sm font-bold">{j.estado === "realizada" ? "Editar resumen y transcript" : "Cerrar la junta: resumen, acuerdos y transcript"}</summary>
                <div className="mt-3">
                  <ActionForm action={closeMeeting} hidden={{ ...h, id: j.id }} submit={j.estado === "realizada" ? "Guardar" : "Cerrar junta"}>
                    <label className="flex flex-col gap-1 text-sm font-semibold">Resumen
                      <textarea className={`${input} min-h-28`} name="resumen" defaultValue={j.resumen ?? ""} maxLength={20000} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-semibold">Acuerdos <span className="font-normal text-texto-3">(uno por renglón: pendiente | responsable | fecha)</span>
                      <textarea className={`${input} min-h-20 font-mono text-xs`} name="acuerdos" defaultValue={acuerdosTexto(j.acuerdos ?? [])} placeholder="Mandar rider técnico | Staff | 20 oct" />
                    </label>
                    <div className="flex flex-col gap-1 text-sm font-semibold">Transcripción
                      <span className="font-normal text-texto-3">Sube el archivo (txt, pdf o Word de Zoom, Meet o Teams) o pégalo abajo.</span>
                      <TeamFileUpload pid={pid} carpeta="juntas" name="transcript_path" label={j.transcript_path ? "Reemplazar archivo" : "Subir transcript"} />
                      <textarea className={`${input} min-h-20 text-xs`} name="transcript_texto" defaultValue={j.transcript_texto ?? ""} placeholder="…o pega aquí el texto" />
                    </div>
                    <input className={input} name="grabacion_url" type="url" defaultValue={j.grabacion_url ?? ""} placeholder="Enlace a la grabación https:// (opcional)" />
                  </ActionForm>
                </div>
              </details>
              {j.transcript_path && files.get(j.transcript_path) && <a href={files.get(j.transcript_path)} className="text-sm font-bold text-violeta-claro">Abrir transcript ↗</a>}
              <ActionForm inline action={removeMeeting} hidden={{ ...h, id: j.id }} confirm="¿Borrar esta junta?" submit="Borrar junta" submitClass={quitar} />
            </Card>
          ))}
        </>
      )}

      {seccion === "avisos" && (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="titular text-xl">Nuevo aviso</h2>
            <ActionForm action={sendTeamAnnouncement} hidden={h} submit="Enviar aviso">
              <input className={input} name="titulo" required maxLength={160} placeholder="Título" />
              <textarea className={`${input} min-h-24`} name="cuerpo" required maxLength={5000} placeholder="Mensaje" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="importante" /> Importante</label>
              <TeamAudienceFields roles={roles} gente={gente} />
            </ActionForm>
          </Card>
          {await Promise.all(space.avisos.slice(0, 20).map(async (a) => {
            const lect = await teamReadStatus(a.id);
            const leidos = lect.filter((x) => x.leido_at).length;
            return (
              <Card key={a.id} className="flex flex-col gap-2">
                <p className="font-bold">{a.importante && <span className="mr-2 text-[#ff8fa3]">●</span>}{a.titulo}</p>
                <p className="text-xs text-texto-3">{fecha(a.created_at)} · {teamAudienceLabel(a, rolNombre, persona)} · {leidos} de {lect.length} enterados</p>
                <p className="whitespace-pre-line text-sm">{a.cuerpo}</p>
                {lect.some((x) => !x.leido_at) && <p className="text-xs text-texto-3">Faltan: {lect.filter((x) => !x.leido_at).map((x) => x.nombre).join(", ")}</p>}
                <ActionForm inline action={removeTeamAnnouncement} hidden={{ ...h, id: a.id }} confirm="¿Borrar este aviso?" submit="Borrar" submitClass={quitar} />
              </Card>
            );
          }))}
        </>
      )}

      {seccion === "materiales" && (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="titular text-xl">Agregar material</h2>
            <p className="text-sm text-texto-2">Material de maestros, planos, rider técnico, horarios… Archivo privado (máx. 50 MB) o enlace.</p>
            <ActionForm action={saveTeamMaterial} hidden={h} submit="Agregar material">
              <div className="grid gap-2 sm:grid-cols-3">
                <input className={`${input} sm:col-span-2`} name="titulo" required placeholder="Ej. Plan de clases de canto" />
                <input className={input} name="carpeta" placeholder="Carpeta (opcional): Maestros" />
                <input className={`${input} sm:col-span-3`} name="descripcion" placeholder="Nota (opcional)" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <TeamFileUpload pid={pid} carpeta="materiales" name="archivo_path" />
                <span className="text-sm text-texto-3">o</span>
                <input className={`${input} min-w-0 flex-1`} name="url" type="url" placeholder="Enlace https:// (Drive, YouTube…)" />
              </div>
              <TeamAudienceFields roles={roles} gente={gente} />
            </ActionForm>
          </Card>
          {porCarpeta(space.materiales).map(([carpeta, xs]) => (
            <Card key={carpeta || "-"} className="flex flex-col gap-2">
              <h3 className="font-bold">{carpeta || "Sin carpeta"}</h3>
              {xs.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
                  <span>
                    <a href={m.url ?? files.get(m.archivo_path ?? "") ?? "#"} target="_blank" rel="noreferrer" className="font-bold hover:text-violeta-claro">{m.titulo} ↗</a>
                    <span className="block text-xs text-texto-3">{teamAudienceLabel(m, rolNombre, persona)} · subió {persona.get(m.created_by ?? "") ?? "alguien del equipo"}{m.descripcion ? ` · ${m.descripcion}` : ""}</span>
                  </span>
                  <ActionForm inline action={removeTeamMaterial} hidden={{ ...h, id: m.id }} confirm="¿Quitar este material?" submit="Quitar" submitClass={quitar} />
                  <div className="w-full"><MaterialComments espacio={esp} materialId={m.id} comentarios={space.comentarios.filter((c) => c.material_id === m.id)} nombres={persona} yo="" puedeBorrarTodo /></div>
                </div>
              ))}
            </Card>
          ))}
          {space.materiales.length === 0 && <Card><p className="text-sm text-texto-2">Aún no hay materiales.</p></Card>}
        </>
      )}
    </div>
  );
}

export function seccionValida(v: unknown): Seccion {
  return SECCIONES.some((s) => s.id === v) ? (v as Seccion) : "notas";
}

