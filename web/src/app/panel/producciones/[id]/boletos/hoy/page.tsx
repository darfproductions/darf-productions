import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { listPerformances } from "@/lib/boleteria";
import { cuentaComoPendiente, type EstadoEntrega } from "@/lib/beneficios-rules";
import { getLogistica } from "@/lib/logistica";
import { hora, horario, ligaMaps, porVenir, textoDuracion } from "@/lib/logistica-rules";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { funcionDePuerta } from "../../puerta/door-rules";

export const metadata: Metadata = { title: "Hoy" };

type Fila = { user_id: string; nombre: string; estado: string | null; aviso: string | null };
const ghost = "inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

// 0127: Día de función → Hoy. Todo lo de la función del día (o la próxima) en una pantalla: horario, quién falta
// de llegar a cada llamado, boletos vendidos y escaneados, y beneficios por entregar. Cada bloque liga a su página.
export default async function HoyPage({ params, searchParams }: PageProps<"/panel/producciones/[id]/boletos/hoy">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/hoy`);
  const ventas = can(access, id, "ventas.ver"), funciones = can(access, id, "funciones.gestionar"), ensayos = can(access, id, "ensayos.gestionar");
  if (!ventas && !funciones && !ensayos) redirect(salidaBoletos(access, id, "boletos/hoy"));
  const puerta = can(access, id, "puerta.validar");
  const sp = await searchParams;
  const supabase = await createClient();
  const [todas, logistica] = await Promise.all([listPerformances(id), getLogistica(id)]);
  const conFecha = todas.filter((f) => !f.cancelada_at && f.starts_at) as (typeof todas[number] & { starts_at: string })[];
  const elegidaId = conFecha.find((f) => f.id === sp.funcion)?.id ?? funcionDePuerta(conFecha, new Date());
  const f = conFecha.find((x) => x.id === elegidaId);
  if (!f) {
    return <Card><h2 className="titular text-xl">Hoy</h2><p className="mt-2 text-sm text-texto-2">Esta obra todavía no tiene funciones con fecha.</p></Card>;
  }
  const h = horario(f, logistica);
  // Para cambiar de función: las de hoy en adelante (y la elegida), no toda la temporada pasada.
  const proximas = conFecha.filter((x) => x.id === f.id || porVenir(x.starts_at, 12)).slice(0, 8);
  const maps = ligaMaps(logistica, f.venue);
  const duracion = textoDuracion(h);

  const [{ data: llamadosData }, conteo, entregas] = await Promise.all([
    ensayos
      ? supabase.from("rehearsals").select("id, titulo, inicia, estado").eq("performance_id", f.id).order("inicia")
      : Promise.resolve({ data: [] }),
    ventas || puerta ? supabase.rpc("puerta_conteo", { p_performance: f.id }).then((r) => (r.error ? null : (r.data as { vendidos: number; entraron: number }))) : Promise.resolve(null),
    ventas || puerta || funciones ? supabase.rpc("beneficios_entregas", { p_performance: f.id }).then((r) => (r.error ? null : ((r.data ?? []) as { estado: EstadoEntrega }[]))) : Promise.resolve(null),
  ]);
  const llamados = (llamadosData ?? []) as { id: string; titulo: string; inicia: string; estado: string }[];
  const listas = await Promise.all(llamados.map(async (l) => ((await supabase.rpc("rehearsal_roster", { rid: l.id })).data ?? []) as Fila[]));
  const pendientes = entregas?.filter((e) => cuentaComoPendiente(e.estado)).length ?? 0;
  const vencidos = entregas?.filter((e) => e.estado === "vencido").length ?? 0;
  const base = `/panel/producciones/${id}`;

  return (
    <>
      <AutoRefresh seconds={30} />
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-texto-3">Función</p>
            <h2 className="titular text-2xl">{formatPerformanceDate(f.starts_at)}</h2>
            {f.venue && <p className="text-sm text-texto-2">{f.venue}{logistica?.direccion ? ` · ${logistica.direccion}` : ""}</p>}
          </div>
          {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className={ghost}><Icono nombre="externo" />Cómo llegar</a>}
        </div>
        {proximas.length > 1 && (
          <nav aria-label="Función" className="flex flex-wrap gap-2 text-sm">
            {proximas.map((x) => (
              <Link key={x.id} href={`?funcion=${x.id}`} aria-current={x.id === f.id ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 font-semibold ${x.id === f.id ? "bg-texto text-sala" : "border border-white/20 hover:border-white/50"}`}>{formatPerformanceDate(x.starts_at)}</Link>
            ))}
          </nav>
        )}
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {llamados.length > 0 && <Hito titulo="Primer llamado" valor={hora(llamados[0].inicia)} />}
          <Hito titulo="Puertas" valor={hora(h.puertas)} />
          <Hito titulo="Función" valor={hora(h.inicio)} fuerte />
          <Hito titulo="Termina aprox." valor={hora(h.termina)} />
        </ol>
        {duracion && <p className="text-xs text-texto-3">Duración: {duracion}.</p>}
        {funciones && <Link href={`${base}/boletos/funciones`} className="self-start text-xs font-bold text-violeta-claro">Cambiar horarios y llamados</Link>}
      </Card>

      {ensayos && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Llamados</h2>
          {llamados.length === 0 ? (
            <p className="text-sm text-texto-3">Esta función no tiene llamados. Se configuran una vez en <Link href={`${base}/boletos/funciones`} className="font-bold text-violeta-claro">Funciones y horarios</Link> y se crean solos en cada función.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {llamados.map((l, i) => {
                const lista = listas[i];
                const llegaron = lista.filter((p) => p.estado === "presente" || p.estado === "retardo");
                const faltan = lista.filter((p) => !p.estado);
                return (
                  <li key={l.id} className="rounded-xl bg-telon-2 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><b>{l.titulo.replace(/ · función .*/, "")}</b> <span className="text-texto-3">· {hora(l.inicia)}</span>
                        {l.estado === "cancelado" && <span className="ml-2 text-xs font-bold text-pulso">Cancelado</span>}</span>
                      <span className="flex items-center gap-2">
                        <span className="num font-bold">{llegaron.length}/{lista.length}</span>
                        <Link href={`${base}/ensayos/${l.id}`} className={ghost}><Icono nombre="check" />Lista y gafete</Link>
                      </span>
                    </div>
                    {faltan.length > 0 && (
                      <p className="mt-2 text-texto-2">
                        <span className="font-bold">Faltan:</span> {faltan.map((p) => p.nombre + (p.aviso ? ` (${p.aviso.split(":")[0].toLowerCase()})` : "")).join(", ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {(conteo || entregas) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {conteo && (
            <Card className="flex flex-col gap-2">
              <h2 className="titular text-xl">Boletos</h2>
              <p className="text-sm"><b className="num text-2xl">{conteo.entraron}</b> <span className="text-texto-2">de <span className="num">{conteo.vendidos}</span> ya entraron</span></p>
              <div className="flex flex-wrap gap-2">
                {puerta && <Link href={`${base}/puerta`} className={ghost}><Icono nombre="boleto" />Abrir Puerta</Link>}
                {ventas && <a href={`${base}/puerta/lista/${f.id}`} className={ghost}><Icono nombre="descargar" />Lista en Excel</a>}
              </div>
            </Card>
          )}
          {entregas && (
            <Card className="flex flex-col gap-2">
              <h2 className="titular text-xl">Beneficios</h2>
              {entregas.length === 0 ? <p className="text-sm text-texto-3">Esta función no tiene beneficios pagados.</p> : (
                <p className="text-sm"><b className="num text-2xl">{pendientes}</b> <span className="text-texto-2">por entregar</span>
                  {vencidos > 0 && <span className="ml-2 font-bold text-pulso">({vencidos} vencidos)</span>}</p>
              )}
              <Link href={`${base}/boletos/beneficios/entregas?funcion=${f.id}`} className={`${ghost} self-start`}><Icono nombre="destello" />Entregas</Link>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function Hito({ titulo, valor, fuerte }: { titulo: string; valor: string; fuerte?: boolean }) {
  return (
    <li className={`rounded-xl p-3 ${fuerte ? "bg-texto text-sala" : "bg-telon-2"}`}>
      <span className={`block text-xs ${fuerte ? "" : "text-texto-3"}`}>{titulo}</span>
      <span className="num text-lg font-bold">{valor}</span>
    </li>
  );
}
