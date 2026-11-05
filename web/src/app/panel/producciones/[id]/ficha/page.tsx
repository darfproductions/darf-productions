import type { Metadata } from "next";
import Link from "next/link";
import { AjustesSeccion } from "@/components/panel/AjustesSeccion";
import { Card } from "@/components/panel/ui";
import { FichaForm, HitosEditor, LugaresEditor, TIPOS_LUGAR, cargarHitosLugares, textoHito, type FichaObra } from "@/components/panel/obra/FichaEditor";
import { ImprimirBoton } from "@/components/panel/obra/ImprimirBoton";
import { cargarPersonajes } from "@/components/panel/obra/PersonajesEditor";
import { cargarPuestos, estadoPuesto } from "@/components/panel/obra/PuestosEditor";
import { mayus } from "@/lib/dates";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { assetUrl } from "@/lib/productions";
import { AREAS, CATEGORIAS, resumenPersonaje, textoMeses } from "@/lib/produccion-nueva-rules";
import { etiquetaTipo } from "@/lib/tipo-obra-rules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ficha de la producción" };

type Obra = FichaObra & { nombre: string; temporada: string | null; logo_path: string | null; fecha: string | null };
const fechaHora = (iso: string) => mayus(new Intl.DateTimeFormat("es-MX", {
  weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City",
}).format(new Date(iso)));
const ESTADO_AUDICION: Record<string, string> = { borrador: "En preparación", abierta: "Inscripción abierta", cerrada: "Inscripción cerrada", finalizada: "Terminada", cancelada: "Cancelada" };

// Ficha de la producción (0135): todo lo que alguien del equipo puede preguntar, en una sola página y en PDF.
export default async function Ficha({ params }: PageProps<"/panel/producciones/[id]/ficha">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/ficha`);
  const editar = can(access, id, "obra.editar");
  const supabase = await createClient();
  const ahora = new Date().toISOString();
  const [{ data }, { hitos, lugares }, puestos, { personajes }, funciones, ensayos, audiciones, reparto] = await Promise.all([
    supabase.from("productions").select("nombre, temporada, estado, logo_path, fecha, frase, sinopsis, duracion, clasificacion, basada_en, idioma, venue, tentativa_desde, tentativa_hasta, tipo, con_boleteria").eq("id", id).maybeSingle(),
    cargarHitosLugares(id),
    cargarPuestos(id),
    cargarPersonajes(id),
    supabase.from("performances").select("id, starts_at, venue, cancelada_at").eq("production_id", id).order("starts_at"),
    supabase.from("rehearsals").select("id, titulo, inicia, lugar").eq("production_id", id).gte("inicia", ahora).neq("estado", "cancelado").order("inicia").limit(5),
    supabase.from("auditions").select("id, titulo, estado, sede, inscripcion_cierra").eq("production_id", id).order("created_at", { ascending: false }),
    supabase.from("credit_characters").select("character_id, production_credits!inner(activo, production_id, people(nombre))").eq("production_credits.production_id", id),
  ]);
  if (!data) return null;
  const o = data as unknown as Obra;
  const quien = new Map<string, string[]>();
  for (const r of (reparto.data ?? []) as unknown as { character_id: string; production_credits: { activo: boolean; people: { nombre: string } | null } }[]) {
    if (r.production_credits?.activo && r.production_credits.people) quien.set(r.character_id, [...(quien.get(r.character_id) ?? []), r.production_credits.people.nombre]);
  }
  const fechas = textoMeses(o.tentativa_desde, o.tentativa_hasta);
  const tipoLugar = new Map(TIPOS_LUGAR.map((t) => [t.valor, t.label]));
  const dato = (k: string, v: string | null | undefined) => v ? <div><dt className="text-xs font-bold uppercase tracking-wide text-texto-3">{k}</dt><dd>{v}</dd></div> : null;

  return (
    <div className="ficha flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {o.logo_path && <img src={assetUrl(o.logo_path)} alt="" className="h-16 w-24 object-contain" />}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-lila">Ficha de la producción</p>
            <h2 className="titular text-2xl">{o.nombre}{o.temporada ? ` · ${o.temporada}` : ""}</h2>
            {o.frase && <p className="text-sm text-texto-2">{o.frase}</p>}
          </div>
        </div>
        <ImprimirBoton />
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="titular text-lg">Datos generales</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {dato("Tipo de producción", etiquetaTipo(o))}
          {dato("Fechas tentativas", fechas)}
          {dato("Fechas (página pública)", o.fecha)}
          {dato("Sede", o.venue)}
          {dato("Duración", o.duracion)}
          {dato("Clasificación", o.clasificacion)}
          {dato("Basada en", o.basada_en)}
          {dato("Idioma", o.idioma)}
        </dl>
        {o.sinopsis && <div className="text-sm"><p className="text-xs font-bold uppercase tracking-wide text-texto-3">Sinopsis</p>{o.sinopsis.split(/\n\s*\n/).map((p, i) => <p key={i} className="mt-1 whitespace-pre-line">{p}</p>)}</div>}
        {editar && (
          <div className="print:hidden"><AjustesSeccion id="editar-ficha" titulo="Editar tipo, datos y fechas tentativas"><FichaForm pid={id} f={o} /></AjustesSeccion></div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h3 className="titular text-lg">Calendario</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {hitos.map((h) => <li key={h.id}><b className="text-lila">{textoHito(h)}</b> · {h.nombre}{h.notas ? <span className="text-texto-3"> — {h.notas}</span> : null}</li>)}
            {(funciones.data ?? []).filter((f) => !f.cancelada_at).map((f) => <li key={f.id}><b className="text-lila">{fechaHora(f.starts_at)}</b> · Función{f.venue ? ` · ${f.venue}` : ""}</li>)}
            {hitos.length === 0 && !(funciones.data ?? []).length && <li className="text-texto-3">Aún no hay fechas.</li>}
          </ul>
          {(ensayos.data ?? []).length > 0 && (
            <>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-texto-3">Próximos ensayos</p>
              <ul className="flex flex-col gap-1 text-sm">
                {(ensayos.data ?? []).map((e) => <li key={e.id}><b>{fechaHora(e.inicia)}</b> · {e.titulo}{e.lugar ? ` · ${e.lugar}` : ""}</li>)}
              </ul>
            </>
          )}
        </Card>
        <Card className="flex flex-col gap-2">
          <h3 className="titular text-lg">Lugares</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {lugares.map((l) => (
              <li key={l.id}>
                <span className="mr-2 text-xs font-bold uppercase tracking-wide text-lila">{tipoLugar.get(l.tipo) ?? l.tipo}</span><b>{l.nombre}</b>
                {l.direccion && <span className="block text-texto-2">{l.direccion}</span>}
                {l.mapa_url && <a href={l.mapa_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-violeta-claro">{l.mapa_url}</a>}
                {l.notas && <span className="block text-xs text-texto-3">{l.notas}</span>}
              </li>
            ))}
            {lugares.length === 0 && <li className="text-texto-3">Aún no hay lugares.</li>}
          </ul>
        </Card>
      </div>

      {editar && (
        <div className="grid gap-4 md:grid-cols-2 print:hidden">
          <AjustesSeccion id="editar-calendario" titulo="Editar calendario"><HitosEditor pid={id} hitos={hitos} /></AjustesSeccion>
          <AjustesSeccion id="editar-lugares" titulo="Editar lugares"><LugaresEditor pid={id} lugares={lugares} /></AjustesSeccion>
        </div>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="titular text-lg">Equipo</h3>
          {can(access, id, "permisos.gestionar") && <Link href={`/panel/producciones/${id}/permisos#puestos`} className="text-xs font-bold text-violeta-claro print:hidden">Editar equipo</Link>}
        </div>
        {AREAS.map((a) => {
          const l = puestos.filter((p) => p.area === a.valor);
          if (!l.length) return null;
          return (
            <div key={a.valor}>
              <p className="text-xs font-bold uppercase tracking-wide text-texto-3">{a.label}</p>
              <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                {l.map((p) => { const e = estadoPuesto(p); return <li key={p.id}><b>{p.puesto}:</b> <span className={e.cls}>{e.texto}</span>{p.telefono ? <span className="text-texto-3"> · {p.telefono}</span> : null}</li>; })}
              </ul>
            </div>
          );
        })}
        {puestos.length === 0 && <p className="text-sm text-texto-3">Aún no hay puestos.</p>}
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="titular text-lg">Personajes</h3>
          {(editar || can(access, id, "elenco.gestionar")) && <Link href={`/panel/producciones/${id}/elenco#personajes`} className="text-xs font-bold text-violeta-claro print:hidden">Editar personajes</Link>}
        </div>
        {CATEGORIAS.map((c) => {
          const l = personajes.filter((p) => p.categoria === c.valor);
          if (!l.length) return null;
          return (
            <div key={c.valor}>
              <p className="text-xs font-bold uppercase tracking-wide text-texto-3">{c.label}</p>
              <ul className="mt-1 flex flex-col gap-2 text-sm">
                {l.map((p) => (
                  <li key={p.id} className="break-inside-avoid">
                    <b>{p.nombre}</b>{quien.get(p.id) ? <span className="text-exito"> — {quien.get(p.id)!.join(", ")}</span> : <span className="text-texto-3"> — sin asignar</span>}
                    {resumenPersonaje(p) && <span className="block text-xs text-lila">{resumenPersonaje(p)}</span>}
                    {p.descripcion && <span className="block text-texto-2">{p.descripcion}</span>}
                    {p.rasgos && <span className="block text-xs text-texto-3">Notas: {p.rasgos}</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {personajes.length === 0 && <p className="text-sm text-texto-3">Aún no hay personajes.</p>}
      </Card>

      {(audiciones.data ?? []).length > 0 && (
        <Card className="flex flex-col gap-2">
          <h3 className="titular text-lg">Audiciones</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {(audiciones.data ?? []).map((a) => (
              <li key={a.id}><b>{a.titulo}</b> · {ESTADO_AUDICION[a.estado] ?? a.estado}{a.sede ? ` · ${a.sede}` : ""}{a.inscripcion_cierra ? ` · cierra ${fechaHora(a.inscripcion_cierra)}` : ""}</li>
            ))}
          </ul>
        </Card>
      )}
      <p className="hidden text-xs print:block">DARF Productions · {o.nombre} · ficha generada el {new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(new Date())}</p>
    </div>
  );
}
