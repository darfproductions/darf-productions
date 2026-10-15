import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PanelTitle } from "@/components/panel/ui";
import { ESTADO_SOLICITUD, score } from "@/lib/audition-rules";
import { ESTADO_OFERTA, TIPO_CREDITO } from "@/lib/casting-rules";
import { NIVEL_INCIDENCIA, TIPO_INCIDENCIA } from "@/lib/member-rules";
import { casa } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Icono } from "@/components/Icono";

import { NombreFicha } from "../NombreFicha";
export const metadata: Metadata = { title: "Ficha de talento" };

type H = {
  nombre: string | null; email: string;
  obras: { production_id: string; obra: string; tipo: string; papel: string | null }[];
  ofertas: { obra: string; tipo: string; papel: string | null; estado: string; fecha: string }[];
  audiciones: {
    id: string; audition_id: string; titulo: string; obra: string | null; fecha: string; estado: string; ronda: number; numero: number | null;
    llego: string | null; entro: string | null; salio: string | null; personajes: string[] | null; promedio: number | null;
    respuestas: { pregunta: string; respuesta: string }[]; videos: { titulo: string; url: string }[];
  }[];
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City" });

// Ficha de talento: todo el recorrido de una persona en DARF. El Director ve además sus
// incidencias en todas las obras; cada producción ve lo artístico (la base decide).
export default async function TalentPage({ params }: PageProps<"/panel/talento/[uid]">) {
  const { uid } = await params;
  const access = await requirePanel(`/panel/talento/${uid}`);
  if (!/^[0-9a-f-]{36}$/.test(uid)) notFound();
  const supabase = await createClient();
  const [{ data, error }, { data: altas }] = await Promise.all([supabase.rpc("talent_history", { uid }), supabase.rpc("talent_enrollments", { uid })]);
  if (error || !data) notFound();
  const altaDe = (pid: string) => ((altas ?? []) as { production_id: string; ingreso: string; baja_at: string | null; baja_motivo: string | null }[]).find((a) => a.production_id === pid);
  const h = data as H;
  const { data: inc } = casa(access, "casa.personas")
    ? await supabase.from("member_incidents").select("id, production_id, tipo, nivel, descripcion, fecha, anulada_at, productions(nombre)").eq("user_id", uid).order("fecha", { ascending: false })
    : { data: [] };
  const { data: compras } = casa(access, "casa.personas") ? await supabase.rpc("talent_purchases", { uid }) : { data: [] };
  const misCompras = (compras ?? []) as { order_code: string; obra: string; funcion: string; estado: string; total: number; boletos: number; asistio: number; created_at: string }[];
  const { data: persona } = await supabase.from("people").select("id, nombre").eq("profile_id", uid).maybeSingle();
  const incidencias = (inc ?? []) as unknown as { id: string; production_id: string; tipo: string; nivel: string; descripcion: string; fecha: string; anulada_at: string | null; productions: { nombre: string } | null }[];

  return (
    <>
      <PanelTitle eyebrow="Ficha de talento" title={h.nombre ?? h.email}>{h.email}</PanelTitle>
      {persona && casa(access, "casa.personas") && <NombreFicha id={persona.id as string} nombre={persona.nombre as string} />}
      {persona && <Link href={`/panel/talento/p/${persona.id}/perfil`} className="self-start rounded-full border border-white/25 px-4 py-2 text-sm font-bold">Perfil profesional <Icono nombre="flecha-der" /></Link>}

      <Card>
        <h2 className="titular mb-3 text-xl">Obras ({h.obras.length})</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {h.obras.map((o, i) => (
            <li key={i}><b>{o.obra}</b> · {TIPO_CREDITO[o.tipo] ?? o.tipo}{o.papel ? ` · ${o.papel}` : ""}
              {altaDe(o.production_id)?.baja_at && <span className="ml-2 text-xs font-bold text-[#fecdd3]">Baja el {new Date(`${altaDe(o.production_id)!.baja_at}T12:00:00Z`).toLocaleDateString("es-MX")}: {altaDe(o.production_id)!.baja_motivo}</span>}
              {casa(access, "casa.personas") && <> · <Link href={`/panel/producciones/${o.production_id}/expedientes/${uid}`} className="text-violeta-claro">expediente</Link></>}</li>
          ))}
          {h.obras.length === 0 && <li className="text-texto-3">Aún sin obras.</li>}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Audiciones ({h.audiciones.length})</h2>
        {h.audiciones.map((a) => (
          <details key={a.id} className="rounded-lg bg-sala px-4 py-3 text-sm">
            <summary className="cursor-pointer">
              <b>{a.titulo}</b> <span className="text-texto-3">· {a.obra ?? "Convocatoria general"} · {fecha(a.fecha)}</span>{" "}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_SOLICITUD[a.estado]?.cls}`}>{ESTADO_SOLICITUD[a.estado]?.label}</span>
              {a.promedio !== null && <span className="ml-2">Promedio <b>{score(a.promedio)}</b></span>}
            </summary>
            <div className="mt-2 flex flex-col gap-1.5">
              {a.personajes && <p>Personajes: {a.personajes.join(", ")}</p>}
              {a.numero && <p>Nº {a.numero}{a.ronda > 1 ? ` · llegó a callback ${a.ronda - 1}` : ""}</p>}
              {a.respuestas.map((r, i) => (
                <p key={i} className="break-words"><span className="text-texto-3">{r.pregunta}:</span>{" "}
                  {/^https:\/\//.test(r.respuesta) ? <a href={r.respuesta} target="_blank" rel="noreferrer" className="text-violeta-claro underline">abrir enlace</a> : r.respuesta}</p>
              ))}
              {a.videos.map((v, i) => <a key={i} href={v.url} target="_blank" rel="noreferrer" className="text-violeta-claro underline">{v.titulo} <Icono nombre="externo" /></a>)}
              <Link href={`/panel/audiciones/${a.audition_id}/aspirante/${a.id}`} className="text-xs font-bold text-violeta-claro">Abrir en la audición <Icono nombre="flecha-der" /></Link>
            </div>
          </details>
        ))}
        {h.audiciones.length === 0 && <p className="text-sm text-texto-3">Sin audiciones registradas con su cuenta.</p>}
      </Card>

      {h.ofertas.length > 0 && (
        <Card>
          <h2 className="titular mb-3 text-xl">Ofertas</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {h.ofertas.map((o, i) => (
              <li key={i}>{o.obra} · {TIPO_CREDITO[o.tipo] ?? o.tipo}{o.papel ? ` · ${o.papel}` : ""} · {fecha(o.fecha)}{" "}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_OFERTA[o.estado]?.cls}`}>{ESTADO_OFERTA[o.estado]?.label}</span></li>
            ))}
          </ul>
        </Card>
      )}

      {casa(access, "casa.personas") && (
        <Card>
          <h2 className="titular mb-3 text-xl">Como público: compras y funciones ({misCompras.length})</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {misCompras.map((c) => (
              <li key={c.order_code}><b>{c.obra}</b> · función {fecha(c.funcion)} · {c.boletos} {c.boletos === 1 ? "boleto" : "boletos"} · ${Number(c.total).toLocaleString("es-MX")} · {c.estado}
                {c.asistio > 0 && <span className="ml-1 text-exito">· asistió ({c.asistio})</span>} <span className="text-xs text-texto-3">({c.order_code})</span></li>
            ))}
            {misCompras.length === 0 && <li className="text-texto-3">Sin compras con esta cuenta.</li>}
          </ul>
        </Card>
      )}

      {casa(access, "casa.personas") && (
        <Card>
          <h2 className="titular mb-3 text-xl">Incidencias en todas las obras</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {incidencias.map((i) => (
              <li key={i.id} className={i.anulada_at ? "opacity-60" : ""}>
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${NIVEL_INCIDENCIA[i.nivel]?.cls}`}>{NIVEL_INCIDENCIA[i.nivel]?.label}</span>
                <b>{i.productions?.nombre}</b> · {TIPO_INCIDENCIA[i.tipo]} · {new Date(`${i.fecha}T12:00:00Z`).toLocaleDateString("es-MX")} · {i.descripcion}{i.anulada_at ? " (anulada)" : ""}
              </li>
            ))}
            {incidencias.length === 0 && <li className="text-texto-3">Ninguna.</li>}
          </ul>
        </Card>
      )}
    </>
  );
}
