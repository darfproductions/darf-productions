import type { Metadata } from "next";
import Link from "next/link";
import { AjustesSeccion } from "@/components/panel/AjustesSeccion";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { CopyLink } from "@/components/panel/CopyLink";
import { Card, input } from "@/components/panel/ui";
import { MODALIDAD, lugares, type Criterio } from "@/lib/audition-rules";
import { formatSlot } from "@/lib/auditions";
import { isoToLocalMx } from "@/lib/dates";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { editarPersonaje, importarPersonajes, moverPersonaje } from "../votacion-actions";
import { addAuditionMember, addField, addInvites, addRole, addSlot, removeAuditionMember, removeInvite, removeItem, saveAsTemplate, saveAudition, saveCriterios, saveOptions, setAuditionEstado, deleteAudition } from "../actions";

export const metadata: Metadata = { title: "Configurar audición" };

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";
const TIPOS: Record<string, string> = { texto: "Texto corto", parrafo: "Párrafo", enlace: "Enlace (video, portafolio)", opcion: "Opciones", si_no: "Sí / No" };
const ESTADOS = [
  { estado: "abierta", label: "Abrir inscripción", confirm: "¿Abrir la convocatoria? Aparecerá en la web y la gente podrá inscribirse." },
  { estado: "cerrada", label: "Cerrar inscripción", confirm: "¿Cerrar la inscripción? Ya nadie podrá inscribirse." },
  { estado: "finalizada", label: "Finalizar", confirm: "¿Marcar como finalizada?" },
  { estado: "borrador", label: "Volver a borrador", confirm: "¿Regresar a borrador? Deja de verse en la web." },
];

const check = "flex items-start gap-2 text-sm";

export default async function AuditionConfig({ params }: PageProps<"/panel/audiciones/[aid]">) {
  const { aid } = await params;
  const { a, may, access, config } = await requireAudition(aid, []);
  if (!may("audiciones.gestionar")) redirect(`/panel/audiciones/${aid}/${may("audiciones.evaluar") ? "evaluacion" : "registro"}`);
  // Registro permanente: solo el Director lo configura; los demás van directo a las solicitudes.
  if (!config) redirect(`/panel/audiciones/${aid}/solicitudes`);
  // ¿Puede armar el equipo propio? Obra: quien da permisos en ella. General: el Director.
  const armaEquipo = access.isDirector || (!!a.production_id && (access.byProduction[a.production_id] ?? []).includes("permisos.gestionar"));
  const supabase = await createClient();
  const [roles, slots, fields, team, teamRoles, invites, inscritos] = await Promise.all([
    supabase.from("audition_roles").select("id, nombre, descripcion").eq("audition_id", aid).order("orden"),
    supabase.rpc("audition_slot_availability", { aid }),
    supabase.from("audition_fields").select("id, etiqueta, tipo, opciones, obligatorio").eq("audition_id", aid).order("orden"),
    supabase.rpc("audition_list_members", { aid }),
    supabase.from("role_permissions").select("role_id, panel_roles(nombre, orden)").like("permission_id", "audiciones.%"),
    supabase.from("audition_invites").select("id, email, created_at").eq("audition_id", aid).order("created_at"),
    supabase.from("audition_applications").select("id", { count: "exact", head: true }).eq("audition_id", aid),
  ]);
  const nInscritos = inscritos.count ?? 0;
  const criterios = (a.criterios ?? []) as Criterio[];
  const opcionesRol = [...new Map(((teamRoles.data ?? []) as unknown as { role_id: string; panel_roles: { nombre: string; orden: number } | null }[])
    .map((r) => [r.role_id, { id: r.role_id, nombre: r.panel_roles?.nombre ?? r.role_id, orden: r.panel_roles?.orden ?? 99 }])).values()]
    .sort((x, y) => x.orden - y.orden);
  const miembros = (team.data ?? []) as { id: string; nombre: string | null; email: string; role_nombre: string }[];
  const h = { aid };

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="titular text-xl">Publicación</h2>
          {a.estado !== "borrador" && <Link href={`/audiciones/${aid}`} target="_blank" className="text-sm font-bold text-violeta-claro">Ver página pública ↗</Link>}
        </div>
        {a.visibilidad === "enlace" && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-texto-2">Solo con enlace: no aparece en la lista pública. Comparte el enlace con quienes deben inscribirse. <CopyLink path={`/audiciones/${aid}`} /></p>
        )}
        <div className="flex flex-wrap gap-2">
          {ESTADOS.filter((e) => e.estado !== a.estado && !(a.estado === "cancelada" && e.estado === "finalizada")).map((e) => (
            <ActionForm key={e.estado} inline action={setAuditionEstado} hidden={{ ...h, estado: e.estado }} confirm={e.confirm} submit={e.label} submitClass={e.estado === "abierta" ? "boton-compra rounded-full px-5 py-2 text-sm font-bold" : "rounded-full border border-white/25 px-4 py-2 text-sm font-bold"} />
          ))}
        </div>
      </Card>

      <AjustesSeccion id="datos" titulo="Datos">
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
      </AjustesSeccion>

      <AjustesSeccion id="inscripcion-y-logistica" titulo="Inscripción y logística">
        <p className="mb-3 text-sm text-texto-2">Ajusta qué se pide al inscribirse y cómo se organiza el día.</p>
        <ActionForm action={saveOptions} hidden={h} submit="Guardar opciones">
          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Qué se pide</legend>
              <label className={check}><input type="checkbox" name="pedir_foto" defaultChecked={a.pedir_foto} className="mt-1" /> Foto del aspirante</label>
              <label className={check}><input type="checkbox" name="elegir_horario" defaultChecked={a.elegir_horario} className="mt-1" /> El aspirante elige su horario (si no, se lo asignas tú en Solicitudes)</label>
              <label className={check}><input type="checkbox" name="pedir_tutor" defaultChecked={a.pedir_tutor} className="mt-1" /> Datos y autorización de mamá, papá o tutor para menores de edad</label>
              <label className={`${check} rounded-lg border border-aviso/40 p-2`}><input type="checkbox" name="autorizacion_escuela" defaultChecked={a.autorizacion_escuela} className="mt-1" />
                <span>Si no se piden datos del tutor: confirmo que la escuela u organización ya cuenta con la autorización de los padres de los menores.</span></label>
            </fieldset>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Forma de la audición
                <select className={input} name="modalidad" defaultValue={a.modalidad}>
                  {Object.entries(MODALIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <span className="text-xs font-normal text-texto-3">En línea: sin día presencial; los jueces califican los videos que manden (pide videos en “Preguntas del formulario”).</span>
              </label>
              <label className={check}><input type="checkbox" name="con_callback" defaultChecked={a.con_callback} className="mt-1" />
                <span>Habrá callback: después de la audición se elige quién pasa, se hace el callback y luego se vota.</span></label>
              <label className={check}><input type="checkbox" name="solo_invitados" defaultChecked={a.solo_invitados} className="mt-1" />
                <span>Solo invitados por correo: nadie más puede inscribirse, aunque tenga la liga (queda “solo con enlace”).</span></label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Quién la ve
                <select className={input} name="visibilidad" defaultValue={a.visibilidad}>
                  <option value="publica">Todos: aparece en la lista de audiciones</option>
                  <option value="enlace">Solo con enlace (por ejemplo, una escuela)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Números del día
                <select className={input} name="numeracion" defaultValue={a.numeracion}>
                  <option value="llegada">Al llegar (orden de llegada)</option>
                  <option value="previa">Asignación previa (lista en orden desde antes)</option>
                </select>
              </label>
            </div>
          </div>
        </ActionForm>
      </AjustesSeccion>

      <AjustesSeccion id="que-califican-los-jueces" titulo="Qué califican los jueces">
        <p className="text-sm text-texto-2">Cada criterio se califica del 1 al 5. Escríbelos separados por coma (máximo 8). Ejemplo para aéreo: Técnica, Fuerza, Flexibilidad, Seguridad, Presencia escénica.</p>
        <ActionForm action={saveCriterios} hidden={h} submit="Guardar criterios">
          <input className={input} name="criterios" required defaultValue={criterios.map((c) => c.l).join(", ")} />
        </ActionForm>
        <p className="text-xs text-texto-3">Si cambias los criterios cuando ya hay calificaciones, las anteriores se conservan pero los jueces califican con los nuevos.</p>
      </AjustesSeccion>

      {(a.solo_invitados || a.visibilidad === "enlace") && (
        <AjustesSeccion id="invitados" titulo="Invitados y liga">
          <h2 className="titular text-xl">Invitados ({(invites.data ?? []).length})</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-texto-2">
            {a.solo_invitados
              ? "Solo estos correos pueden inscribirse. Cada persona entra con su cuenta DARF (con ese mismo correo) y ve la invitación en Mi cuenta."
              : "Convocatoria cerrada: no sale en la lista pública. Se inscribe quien tenga la liga y quien invites por correo (le llega un aviso y la ve en Mi cuenta)."}
            {""}Liga de inscripción: <CopyLink path={`/audiciones/${aid}`} />
          </p>
          <ul className="flex flex-col gap-1.5">
            {(invites.data ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-sala px-3 py-1.5 text-sm">
                <span className="break-all">{i.email}</span>
                <ActionForm inline action={removeInvite} hidden={{ ...h, id: i.id as string }} confirm={`¿Quitar la invitación de ${i.email}?`} submit="Quitar" submitClass={ghost} />
              </li>
            ))}
          </ul>
          <ActionForm action={addInvites} hidden={h} submit="Invitar">
            <textarea className={`${input} min-h-20`} name="emails" required placeholder="Uno o varios correos, separados por coma o en renglones distintos" />
          </ActionForm>
        </AjustesSeccion>
      )}

      <AjustesSeccion id="equipo-de-esta-convocatoria" titulo="Equipo de esta convocatoria">
        <p className="text-sm text-texto-2">
          {a.production_id
            ? "El equipo de la obra ya tiene acceso según sus roles. Aquí puedes sumar personas solo para esta convocatoria (por ejemplo, un juez invitado)."
            : "Personas que trabajan esta convocatoria general: mesa de registro, jueces o dirección. Solo el Director puede armar este equipo."}
        </p>
        <ul className="flex flex-col gap-2">
          {miembros.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
              <span><b>{m.nombre || m.email}</b> <span className="text-texto-3">· {m.email} · {m.role_nombre}</span></span>
              {armaEquipo && <ActionForm inline action={removeAuditionMember} hidden={{ ...h, id: m.id }} confirm={`¿Quitar el rol ${m.role_nombre} a ${m.nombre || m.email}?`} submit="Quitar" submitClass={ghost} />}
            </li>
          ))}
          {miembros.length === 0 && <li className="text-sm text-texto-3">Nadie agregado aún.</li>}
        </ul>
        {armaEquipo && (
          <ActionForm action={addAuditionMember} hidden={h} submit="Agregar al equipo">
            <input className={`${input} max-w-md`} name="email" type="email" required placeholder="correo@ejemplo.com (debe tener cuenta DARF)" />
            <div className="flex flex-wrap gap-2">
              {opcionesRol.map((r) => (
                <label key={r.id} className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-sm has-[:checked]:border-white">
                  <input type="checkbox" name="role" value={r.id} /> {r.nombre}
                </label>
              ))}
            </div>
          </ActionForm>
        )}
      </AjustesSeccion>

      <AjustesSeccion id="personajes" titulo="Personajes">
        <p className="text-sm text-texto-2">El orden es la importancia: el de arriba es el más importante. Con personajes, los jueces marcan opciones por persona y al final se vota el cast.</p>
        {a.production_id && (
          <ActionForm inline action={importarPersonajes} hidden={h} submit="Traer personajes de la obra" submitClass={ghost} />
        )}
        <ol className="flex flex-col gap-2">
          {(roles.data ?? []).map((r, i, arr) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-sala px-3 py-2">
              <details className="min-w-0 flex-1">
                <summary className="cursor-pointer"><span className="mr-2 font-mono text-xs text-texto-3">{i + 1}</span><b>{r.nombre}</b>{r.descripcion && <span className="block text-sm text-texto-3">{r.descripcion}</span>}</summary>
                <div className="mt-2">
                  <ActionForm action={editarPersonaje} hidden={{ ...h, id: r.id }} submit="Guardar" submitClass={ghost}>
                    <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                      <input className={input} name="nombre" required defaultValue={r.nombre} aria-label="Personaje" />
                      <input className={input} name="descripcion" defaultValue={r.descripcion ?? ""} aria-label="Descripción" />
                    </div>
                  </ActionForm>
                </div>
              </details>
              <span className="flex items-center gap-1.5">
                {i > 0 && <ActionForm inline action={moverPersonaje} hidden={{ ...h, id: r.id, dir: "-1" }} submit="↑" submitClass={ghost} />}
                {i < arr.length - 1 && <ActionForm inline action={moverPersonaje} hidden={{ ...h, id: r.id, dir: "1" }} submit="↓" submitClass={ghost} />}
                <ActionForm inline action={removeItem} hidden={{ ...h, tabla: "audition_roles", id: r.id }} confirm={`¿Quitar a ${r.nombre}?`} submit="Quitar" submitClass={ghost} />
              </span>
            </li>
          ))}
        </ol>
        <ActionForm action={addRole} hidden={h} submit="Agregar personaje">
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input className={input} name="nombre" required placeholder="Personaje" />
            <input className={input} name="descripcion" placeholder="Descripción breve (edad, tesitura, baile…)" />
          </div>
        </ActionForm>
      </AjustesSeccion>

      <AjustesSeccion id="horarios" titulo="Horarios">
        <ul className="flex flex-col gap-2">
          {((slots.data ?? []) as { id: string; inicia: string; sala: string | null; cupo: number; ocupados: number }[]).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sala px-3 py-2 text-sm">
              <span><b>{formatSlot(s.inicia)}</b>{s.sala ? ` · ${s.sala}` : ""} · {s.ocupados} de {s.cupo} ({lugares(s.cupo, s.ocupados)} libres)</span>
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
      </AjustesSeccion>

      <AjustesSeccion id="preguntas-del-formulario" titulo="Preguntas del formulario">
        <p className="text-sm text-texto-2">Nombre, teléfono y fecha de nacimiento se piden siempre; foto y horario según las opciones de arriba. Pide solo lo necesario.</p>
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
      </AjustesSeccion>
      <AjustesSeccion id="guardar-como-plantilla" titulo="Guardar como plantilla">
        <p className="mb-3 text-sm text-texto-2">Guarda las opciones, preguntas, criterios y requisitos de esta convocatoria para crear otras iguales después.</p>
        <ActionForm action={saveAsTemplate} hidden={h} submit="Guardar plantilla">
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input className={input} name="nombre" required maxLength={60} placeholder="Ej. Aéreo DARF" defaultValue={a.titulo} />
            <input className={input} name="descripcion" maxLength={300} placeholder="Para qué sirve (opcional)" />
          </div>
        </ActionForm>
      </AjustesSeccion>
      <AjustesSeccion id="cancelar-o-borrar" titulo="Cancelar o borrar">
        {a.estado !== "cancelada" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-texto-2"><b>Cancelar</b> (si ya no se hará): se conserva todo, ya nadie puede inscribirse y {nInscritos ? `los ${nInscritos} inscritos verán` : "quien se haya inscrito verá"} “Convocatoria cancelada” en su página y en Mi cuenta. Se puede reabrir después.</p>
            <ActionForm inline action={setAuditionEstado} hidden={{ ...h, estado: "cancelada" }} confirm="¿Cancelar esta convocatoria? Ya nadie podrá inscribirse y los inscritos lo verán." submit="Cancelar convocatoria" submitClass="rounded-full border border-[#ff8fa3]/60 px-4 py-2 text-sm font-bold text-[#ff8fa3]" />
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-bold">Borrar para siempre (si quedó mal hecha)</summary>
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-texto-2">
              Se borra la convocatoria con {nInscritos ? <b>{nInscritos} inscripciones</b> : "sus inscripciones"}, calificaciones, horarios, preguntas, invitaciones, videos (enlaces) y fotos. <b>No se puede deshacer.</b>
              {nInscritos > 0 && " Como ya tiene inscritos, solo puede borrarla quien arma su equipo (en una general, el Director). Si solo se suspendió, mejor cancélala."}
            </p>
            <ActionForm action={deleteAudition} hidden={h} confirm="¿Borrar para siempre? No se puede deshacer." submit="Borrar convocatoria" submitClass="self-start rounded-full bg-[#be123c] px-5 py-2 text-sm font-bold text-white">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Para confirmar, escribe el título: <span className="font-normal text-texto-3">{a.titulo}</span>
                <input className={`${input} max-w-md`} name="confirmar" required autoComplete="off" />
              </label>
            </ActionForm>
          </div>
        </details>
      </AjustesSeccion>
    </>
  );
}
