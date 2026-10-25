import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { AudienceFields } from "@/components/panel/AudienceFields";
import { Card, input } from "@/components/panel/ui";
import { audienceLabel, type Audience } from "@/lib/audience";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { removeAnnouncement, sendAnnouncement } from "./actions";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Comunicados" };

type Ann = Audience & { id: string; titulo: string; cuerpo: string; importante: boolean; created_at: string };
type St = { user_id: string; nombre: string; leido_at: string | null };
const POR_PAGINA = 20;

// Comunicados con confirmación de lectura: quién ya lo leyó y quién no.
export default async function Comunicados({ params, searchParams }: PageProps<"/panel/producciones/[id]/comunicados">) {
  const { id } = await params;
  const todos = (await searchParams).todos === "1";
  const access = await requirePanel(`/panel/producciones/${id}/comunicados`);
  if (!can(access, id, "comunicados.enviar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [{ data: anns, count }, { data: roster }] = await Promise.all([
    // Los 20 más recientes (con "Ver todos"); cada uno pide su lista de lectura.
    supabase.from("announcements").select("*", { count: "exact" }).eq("production_id", id).order("created_at", { ascending: false }).limit(todos ? 1000 : POR_PAGINA),
    supabase.rpc("cast_roster", { pid: id }),
  ]);
  const lista = (anns ?? []) as Ann[];
  const gente = (roster ?? []) as { user_id: string; nombre: string }[];
  const nombres = new Map(gente.map((g) => [g.user_id, g.nombre]));
  const estados = await Promise.all(lista.map((a) => supabase.rpc("announcement_read_status", { aid: a.id })));
  const fmt = (iso: string) => new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" });

  return (
    <div className="flex flex-col gap-4">
      <details className="group rounded-[22px] border border-linea bg-telon" open={lista.length === 0}>
        <summary className="cursor-pointer list-none px-5 py-4 font-bold text-violeta-claro">+ Nuevo comunicado</summary>
        <div className="border-t border-linea p-5">
        <ActionForm action={sendAnnouncement} hidden={{ pid: id }} submit="Enviar comunicado">
          <input className={input} name="titulo" required maxLength={160} placeholder="Ej. Cambio de horario del ensayo general" />
          <textarea className={`${input} min-h-28`} name="cuerpo" required maxLength={5000} placeholder="Mensaje" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="importante" /> Importante (se destaca arriba en su portal)</label>
          <AudienceFields gente={gente} />
        </ActionForm>
        </div>
      </details>
      {lista.map((a, i) => {
        const st = (estados[i].data ?? []) as St[];
        const leidos = st.filter((x) => x.leido_at);
        const faltan = st.filter((x) => !x.leido_at);
        return (
          <Card key={a.id} className={`flex flex-col gap-2 ${a.importante ? "border border-aviso/40" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">{a.importante && <span className="mr-2 text-aviso"><Icono nombre="punto" /></span>}{a.titulo}</p>
                <p className="text-xs text-texto-3">{fmt(a.created_at)} · Para: {audienceLabel(a, nombres)}</p>
              </div>
              <ActionForm inline action={removeAnnouncement} hidden={{ pid: id, id: a.id }} confirm="¿Quitar este comunicado? Deja de verse en los portales." submit="Quitar" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold" />
            </div>
            <p className="whitespace-pre-line text-sm">{a.cuerpo}</p>
            <p className="text-sm"><b>{leidos.length} de {st.length}</b> lo leyeron</p>
            {faltan.length > 0 && <p className="text-xs text-texto-2">Faltan: {faltan.map((x) => x.nombre).join(", ")}</p>}
            {leidos.length > 0 && (
              <details className="text-xs text-texto-3"><summary className="cursor-pointer">Quién lo leyó</summary>
                <ul className="mt-1">{leidos.map((x) => <li key={x.user_id}>{x.nombre} · {fmt(x.leido_at as string)}</li>)}</ul>
              </details>
            )}
          </Card>
        );
      })}
      {lista.length === 0 && <Card>Aún no hay comunicados.</Card>}
      {!todos && (count ?? 0) > lista.length && (
        <Link href="?todos=1" className="self-center rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50">Ver todos ({count})</Link>
      )}
    </div>
  );
}
