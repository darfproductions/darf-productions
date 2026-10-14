import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";
import { porCarpeta } from "@/lib/materials";
import { cuando } from "@/lib/panel-home-rules";
import { createClient } from "@/lib/supabase/server";
import { MaterialComments } from "@/components/team/MaterialComments";
import { TeamAudienceFields } from "@/components/team/TeamAudienceFields";
import { TeamFileUpload } from "@/components/team/TeamFileUpload";
import { getTeamSpace, signTeamFiles, teamRoles, teamRosterPublic } from "@/lib/team";
import { attendNote, markTeamRead, removeTeamMaterial, saveTeamMaterial } from "@/lib/team-actions";
import { espacioPid, separarJuntas, TIPO_JUNTA } from "@/lib/team-rules";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Mi equipo" };

const caja = "flex flex-col gap-3 rounded-2xl bg-telon p-5";
const campo = "rounded-lg bg-sala px-3 py-2 text-sm font-normal";
const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Portal del equipo (0065): lo que me toca como parte del equipo de una producción o de DARF.
export default async function MiEquipo({ params }: PageProps<"/cuenta/equipo/[id]">) {
  const { id } = await params;
  const session = await requireSession(`/cuenta/equipo/${id}`);
  const pid = espacioPid(id);
  const supabase = await createClient();
  const [{ data: mios }, { data: gestiona }] = await Promise.all([
    supabase.rpc("my_team_productions"),
    supabase.rpc("team_can_manage", { pid }),
  ]);
  const yo = ((mios ?? []) as { production_id: string | null; nombre: string; roles: string[] }[]).find((x) => x.production_id === pid);
  let nombre = yo?.nombre;
  if (!yo && !gestiona) notFound();
  if (!nombre) nombre = pid ? ((await supabase.from("productions").select("nombre").eq("id", pid).maybeSingle()).data?.nombre as string | undefined) ?? pid : "DARF (general)";

  const [space, roles, gente] = await Promise.all([getTeamSpace(pid), teamRoles(), teamRosterPublic(pid)]);
  const nombres = new Map(gente.map((g) => [g.user_id, g.nombre]));
  const { data: leidos } = await supabase.from("team_announcement_reads").select("announcement_id").eq("user_id", session.userId);
  const yaLei = new Set((leidos ?? []).map((r) => r.announcement_id as string));
  const files = await signTeamFiles([...space.materiales.map((m) => m.archivo_path), ...space.juntas.map((j) => j.transcript_path)]);
  const h = { espacio: id };
  const { proximas, pasadas } = separarJuntas(space.juntas);
  const notasPend = space.notas.filter((n) => !n.atendida_at);
  const sinLeer = space.avisos.filter((a) => !yaLei.has(a.id));

  return (
    <main className="pb-16">
      <PageHeading eyebrow="Mi equipo" title={nombre}>
        {yo?.roles?.length ? `Tu rol: ${yo.roles.join(", ")}.` : gestiona ? "Lo ves porque manejas el portal del equipo." : ""}
      </PageHeading>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-5 md:px-16">
        <Link href="/cuenta" className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Mi cuenta</Link>
        <ul className="grid gap-3 sm:grid-cols-3">
          <li className={caja}><span className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Notas pendientes</span><span className="text-3xl font-black">{notasPend.length}</span></li>
          <li className={caja}><span className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Avisos sin leer</span><span className="text-3xl font-black">{sinLeer.length}</span></li>
          <li className={caja}><span className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Próxima junta</span><span className="font-bold">{proximas[0] ? `${cuando(proximas[0].inicia)} · ${proximas[0].titulo}` : "—"}</span></li>
        </ul>

        <section className="flex flex-col gap-3">
          <h2 className="titular text-2xl">Notas de dirección</h2>
          {space.notas.length === 0 && <p className="text-texto-2">No tienes notas.</p>}
          {space.notas.map((n) => (
            <div key={n.id} className={`${caja} ${n.prioridad === "urgente" && !n.atendida_at ? "border border-[#ff8fa3]/50" : ""}`}>
              <p className="text-xs text-texto-3">{n.contexto ? `${n.contexto} · ` : ""}{fecha(n.created_at)}{n.prioridad === "urgente" && <b className="ml-2 text-[#ff8fa3]">URGENTE</b>}</p>
              <p className="whitespace-pre-line">{n.cuerpo}</p>
              {n.atendida_at ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-exito"><Icono nombre="check" /> Atendida {fecha(n.atendida_at)}{n.respuesta ? ` — “${n.respuesta}”` : ""}</span>
                  <ActionForm inline action={attendNote} hidden={{ ...h, id: n.id, deshacer: "1" }} submit="Marcar pendiente" submitClass="text-xs font-bold text-violeta-claro" />
                </div>
              ) : (
                <ActionForm action={attendNote} hidden={{ ...h, id: n.id }} submit="Marcar atendida" submitClass="self-start rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala">
                  <input className={campo} name="respuesta" maxLength={2000} placeholder="Respuesta (opcional): listo, lo vemos el jueves…" />
                </ActionForm>
              )}
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="titular text-2xl">Juntas y llamados</h2>
          {space.juntas.length === 0 && <p className="text-texto-2">No hay juntas.</p>}
          {[...proximas, ...pasadas].map((j) => (
            <div key={j.id} className={caja}>
              <p className="font-bold">{TIPO_JUNTA[j.tipo] ?? j.tipo}: {j.titulo} <span className="ml-2 text-xs font-normal text-texto-3">{j.estado === "realizada" ? "Realizada" : "Programada"}</span></p>
              <p className="text-sm text-texto-2">{cuando(j.inicia)}{j.lugar ? ` · ${j.lugar}` : ""}
                {j.enlace && j.estado === "programada" && <> · <a href={j.enlace} target="_blank" rel="noreferrer" className="font-bold text-violeta-claro">Entrar a la videollamada <Icono nombre="externo" /></a></>}</p>
              {j.agenda && <p className="whitespace-pre-line text-sm"><b>Agenda:</b> {j.agenda}</p>}
              {j.resumen && <div className="text-sm"><b>Resumen</b><p className="whitespace-pre-line text-texto-2">{j.resumen}</p></div>}
              {(j.acuerdos ?? []).length > 0 && (
                <div className="text-sm"><b>Acuerdos</b>
                  <ul className="mt-1 flex flex-col gap-1">{j.acuerdos.map((a, k) => <li key={k}><Icono nombre="punto" className="h-2 w-2 opacity-70" /> {a.texto}{a.responsable ? ` — ${a.responsable}` : ""}{a.fecha ? ` (${a.fecha})` : ""}</li>)}</ul>
                </div>
              )}
              <div className="flex flex-wrap gap-3 text-sm font-bold">
                {j.transcript_path && files.get(j.transcript_path) && <a href={files.get(j.transcript_path)} target="_blank" rel="noreferrer" className="text-violeta-claro">Transcript <Icono nombre="externo" /></a>}
                {j.grabacion_url && <a href={j.grabacion_url} target="_blank" rel="noreferrer" className="text-violeta-claro">Grabación <Icono nombre="externo" /></a>}
              </div>
              {j.transcript_texto && <details className="text-sm"><summary className="cursor-pointer font-bold">Ver transcript</summary><p className="mt-2 max-h-96 overflow-auto whitespace-pre-line rounded-lg bg-sala p-3 text-xs text-texto-2">{j.transcript_texto}</p></details>}
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="titular text-2xl">Avisos</h2>
          {space.avisos.length === 0 && <p className="text-texto-2">No hay avisos.</p>}
          {space.avisos.map((a) => (
            <div key={a.id} className={`${caja} ${a.importante && !yaLei.has(a.id) ? "border border-aviso/50" : ""}`}>
              <p className="font-bold">{a.importante && <span className="mr-2 text-aviso"><Icono nombre="punto" /></span>}{a.titulo}</p>
              <p className="text-xs text-texto-3">{fecha(a.created_at)}</p>
              <p className="whitespace-pre-line text-sm">{a.cuerpo}</p>
              {yaLei.has(a.id) ? <p className="text-xs text-exito"><Icono nombre="check" /> Enterado</p>
                : yo ? <ActionForm inline action={markTeamRead} hidden={{ ...h, id: a.id }} submit="Enterado" submitClass="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala" /> : null}
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="titular text-2xl">Materiales</h2>
          <details className={caja}>
            <summary className="cursor-pointer font-bold">+ Subir material o información para el equipo</summary>
            <div className="mt-3">
              <ActionForm action={saveTeamMaterial} hidden={h} submit="Compartir">
                <div className="grid gap-2 sm:grid-cols-3">
                  <input className={`${campo} sm:col-span-2`} name="titulo" required maxLength={160} placeholder="Ej. Plan de vestuario acto 1" />
                  <input className={campo} name="carpeta" maxLength={80} placeholder="Carpeta (opcional)" />
                  <input className={`${campo} sm:col-span-3`} name="descripcion" maxLength={2000} placeholder="Nota (opcional)" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <TeamFileUpload pid={pid} carpeta="materiales" name="archivo_path" />
                  <span className="text-sm text-texto-3">o</span>
                  <input className={`${campo} min-w-0 flex-1`} name="url" type="url" placeholder="Enlace https://" />
                </div>
                <TeamAudienceFields roles={roles} gente={gente} />
              </ActionForm>
            </div>
          </details>
          {space.materiales.length === 0 && <p className="text-texto-2">No hay materiales.</p>}
          {porCarpeta(space.materiales).map(([carpeta, xs]) => (
            <div key={carpeta || "-"} className={caja}>
              <h3 className="font-bold">{carpeta || "General"}</h3>
              {xs.map((m) => (
                <div key={m.id} className="flex flex-col gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <a href={m.url ?? files.get(m.archivo_path ?? "") ?? "#"} target="_blank" rel="noreferrer" className="hover:text-violeta-claro">
                      <b>{m.titulo} <Icono nombre="externo" /></b>
                      <span className="block text-xs text-texto-3">Subió {nombres.get(m.created_by ?? "") ?? "el equipo"}{m.descripcion ? ` · ${m.descripcion}` : ""}</span>
                    </a>
                    {(m.created_by === session.userId || gestiona) && (
                      <ActionForm inline action={removeTeamMaterial} hidden={{ ...h, id: m.id }} confirm="¿Quitar este material?" submit="Quitar" submitClass="text-xs font-bold text-[#ff8fa3]" />
                    )}
                  </div>
                  <MaterialComments espacio={id} materialId={m.id} comentarios={space.comentarios.filter((c) => c.material_id === m.id)} nombres={nombres} yo={session.userId} puedeBorrarTodo={!!gestiona} />
                </div>
              ))}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
