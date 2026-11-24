import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { PrintButton } from "@/components/PrintButton";
import { MODALIDAD, type AuditionOptions, type Criterio } from "@/lib/audition-rules";
import { ESTADO_OFERTA, offerLabel } from "@/lib/casting-rules";
import { agruparPorPersona, conNumero, type Evaluaciones, type Expediente } from "@/lib/evaluaciones-rules";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { LoQuePusieron } from "../votacion/LoQuePusieron";
import { Encabezado, Seccion, Votos, celda, fechaMx, th } from "./Secciones";

export const metadata: Metadata = { title: "Expediente" };

// Expediente de la audición (0166): datos, jueces, evaluaciones de cada juez, callback, votación (qué votó cada juez),
// cast, ofertas y entrevistas. Solo la dirección. Se imprime o se guarda como PDF desde el navegador.
export default async function ExpedientePage({ params }: PageProps<"/panel/audiciones/[aid]/expediente">) {
  const { aid } = await params;
  const { a } = await requireAudition(aid, ["audiciones.gestionar"], "/expediente");
  const supabase = await createClient();
  const [{ data, error }, { data: ev }] = await Promise.all([
    supabase.rpc("audition_expediente", { aid }),
    supabase.rpc("audition_evaluaciones", { aid }),
  ]);
  if (error) return <Card>{error.message}</Card>;
  const e = data as Expediente;
  const evs = (ev ?? { personas: [], evaluaciones: [], criterios: [], fase: e.fase }) as Evaluaciones;
  const criterios = (evs.criterios ?? a.criterios ?? []) as Criterio[];
  const porPersona = agruparPorPersona(evs.evaluaciones);
  const fechas = e.desde ? (fechaMx(e.desde) === fechaMx(e.hasta) ? fechaMx(e.desde) : `${fechaMx(e.desde)} al ${fechaMx(e.hasta)}`) : "—";
  const dato = (k: string, v: React.ReactNode) => <div><dt className="text-xs font-bold uppercase tracking-[0.1em] text-texto-3 print:text-black/60">{k}</dt><dd className="font-semibold">{v}</dd></div>;

  return (
    <div className="flex flex-col gap-7 print:gap-5 print:text-black">
      <Card className="flex flex-col gap-2 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/panel/audiciones/${aid}/cast`} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Cast</Link>
          <div className="flex flex-wrap items-center gap-3">
            <a href={`/panel/audiciones/${aid}/exportar/evaluaciones`} className="text-sm font-bold text-violeta-claro">Evaluaciones en Excel <Icono nombre="flecha-abajo" /></a>
            <PrintButton label="Guardar como PDF" />
          </div>
        </div>
        {e.fase !== "enviado" && <p className="text-sm text-aviso">El cast todavía no se manda: el expediente queda completo cuando se envía.</p>}
      </Card>

      <Encabezado e={e} que="Expediente de audición" />

      <Seccion titulo="La audición">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
          {dato("Fechas", fechas)}
          {dato("Modalidad", MODALIDAD[e.modalidad as AuditionOptions["modalidad"]] ?? e.modalidad)}
          {e.sede && dato("Sede", e.sede)}
          {dato("Inscritos", e.conteos.inscritos)}
          {dato("Llegaron", e.conteos.llegaron)}
          {e.con_callback && dato("Pasaron a callback", e.conteos.callback)}
          {dato("Seleccionados", e.conteos.seleccionados)}
          {e.conteos.cancelaron > 0 && dato("Cancelaron", e.conteos.cancelaron)}
        </dl>
        <p className="text-sm"><b>Jueces:</b> {e.jueces.join(", ") || "—"}</p>
      </Seccion>

      {e.cast && (
        <Seccion titulo="Cast asignado">
          <table className="w-full border-collapse text-sm print:text-xs">
            <thead><tr><th className={th}>Personaje</th><th className={th}>Quién</th></tr></thead>
            <tbody>{e.cast.map((c) => <tr key={c.personaje}><td className={`${celda} font-bold`}>{c.personaje}</td><td className={celda}>{c.personas.join(", ")}</td></tr>)}</tbody>
          </table>
        </Seccion>
      )}

      {e.ofertas.length > 0 && (
        <Seccion titulo="Ofertas y respuestas">
          <table className="w-full border-collapse text-sm print:text-xs">
            <thead><tr><th className={th}>Aspirante</th><th className={th}>Papel</th><th className={th}>Estado</th><th className={th}>Enviada</th><th className={th}>Respondió</th></tr></thead>
            <tbody>
              {e.ofertas.map((o, i) => (
                <tr key={i}>
                  <td className={celda}>{conNumero(o)}</td><td className={celda}>{offerLabel(o)}</td>
                  <td className={`${celda} font-semibold`}>{ESTADO_OFERTA[o.estado]?.label ?? o.estado}</td>
                  <td className={celda}>{fechaMx(o.enviada)}</td><td className={celda}>{fechaMx(o.respondida) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Seccion>
      )}

      {e.con_callback && (
        <Seccion titulo="Callback">
          {e.callback.length === 0 ? <p className="text-sm text-texto-3">Nadie pasó a callback.</p> : (
            <p className="text-sm">{e.callback.length} {e.callback.length === 1 ? "persona" : "personas"}: {e.callback.map(conNumero).join(", ")}</p>
          )}
        </Seccion>
      )}

      {e.votacion && <Seccion titulo="Votación final" salto><Votos votacion={e.votacion} /></Seccion>}

      <Seccion titulo="Evaluaciones de los jueces" salto>
        <p className="text-sm text-texto-2 print:text-black/70">Por aspirante: lo que puso cada juez en la audición y en el callback (calificaciones, opciones de personaje y notas).</p>
        {evs.personas.length === 0 && <p className="text-sm text-texto-3">Ningún juez calificó ni marcó opciones.</p>}
        {evs.personas.map((p) => (
          <div key={p.id} className="flex flex-col gap-2 border-t border-white/10 pt-3 print:break-inside-avoid print:border-black/20">
            <h3 className="font-bold">{conNumero(p)}{p.edad ? <span className="font-normal text-texto-3 print:text-black/60"> · {p.edad} años</span> : null}</h3>
            <LoQuePusieron rondas={porPersona.get(p.id) ?? []} criterios={criterios} imprimir />
          </div>
        ))}
      </Seccion>

      {e.entrevistas.length > 0 && (
        <Seccion titulo="Entrevistas del día" salto>
          {e.entrevistas.map((x, i) => (
            <div key={i} className="flex flex-col gap-1 border-t border-white/10 pt-3 text-sm print:break-inside-avoid print:border-black/20">
              <h3 className="font-bold">{conNumero(x)}{x.por ? <span className="font-normal text-texto-3 print:text-black/60"> · entrevistó {x.por}</span> : null}</h3>
              {(x.respuestas ?? []).filter((r) => r.respuesta).map((r, j) => <p key={j}><b>{r.pregunta}</b> {r.respuesta}</p>)}
              {x.extra && <p><b>Notas:</b> {x.extra}</p>}
            </div>
          ))}
        </Seccion>
      )}
    </div>
  );
}
