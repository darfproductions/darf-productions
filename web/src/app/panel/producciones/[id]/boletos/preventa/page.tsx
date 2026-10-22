import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { CopyLink } from "@/components/panel/CopyLink";
import { Card, input } from "@/components/panel/ui";
import { listPerformances } from "@/lib/boleteria";
import { getPanelProduction } from "@/lib/panel-data";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/tickets";
import { crearCodigoPreventa, estadoCodigoPreventa } from "../actions";
import { CompartirWhatsApp } from "./CompartirWhatsApp";

export const metadata: Metadata = { title: "Preventa privada" };

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";
type Fila = { id: string; codigo: string; nombre: string; max_personas: number | null; activo: boolean; created_at: string; personas: number; boletos: number; vendido: number };

// Preventa privada (0123): códigos con liga para invitar; quien la usa compra antes que el Club Fan.
export default async function PreventaPrivadaPage({ params }: PageProps<"/panel/producciones/[id]/boletos/preventa">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/preventa`);
  const editar = can(access, id, "funciones.gestionar");
  if (!editar && !can(access, id, "ventas.ver")) redirect(salidaBoletos(access, id, "boletos/preventa"));
  const supabase = await createClient();
  const [p, funciones, { data: res }, { data: obra }] = await Promise.all([
    getPanelProduction(id), listPerformances(id),
    supabase.rpc("preventa_codigos_resumen", { pid: id }),
    supabase.from("preventa_privada_obras").select("desde, max_por_persona").eq("production_id", id).maybeSingle(),
  ]);
  const codigos = (res ?? []) as Fila[];
  const { data: fechas } = await supabase.from("productions").select("preventa_desde").eq("id", id).maybeSingle();
  const desde = obra?.desde as string | undefined;
  const hasta = fechas?.preventa_desde as string | null | undefined;
  const conPrivada = funciones.filter((f) => !f.cancelada_at).length;
  const texto = `Te invitamos a la preventa privada de ${p?.nombre ?? "DARF Productions"}${desde && hasta ? ` (del ${formatPerformanceDate(desde)} al ${formatPerformanceDate(hasta)})` : ""}. Activa tu acceso aquí:`;
  return (
    <>
      <Card className="flex flex-col gap-2">
        <h2 className="titular text-xl">Preventa privada</h2>
        <p className="text-sm text-texto-2">Cada código tiene su liga. Quien la abre (con su cuenta) puede apartar en la etapa privada, antes que el Club Fan, y también durante la preventa del Club Fan. El público no ve nada de esto: solo &quot;La venta abre el…&quot;.</p>
        {desde ? (
          <p className="text-sm"><b>Fechas:</b> privada desde el {formatPerformanceDate(desde)}{hasta ? ` hasta el ${formatPerformanceDate(hasta)} (abre el Club Fan)` : ""}{obra?.max_por_persona ? ` · máximo ${obra.max_por_persona} por persona y función` : ""}.</p>
        ) : (
          <p className="text-sm font-semibold text-aviso">Todavía no hay fecha de preventa privada: ponla en <Link href={`/panel/producciones/${id}/boletos/funciones`} className="underline">Funciones y precios, en Preventas</Link>{conPrivada ? "" : " (y crea funciones)"}. Los códigos ya se pueden repartir.</p>
        )}
      </Card>

      {codigos.map((c) => {
        const path = `/preventa/${c.codigo}`;
        return (
          <Card key={c.id} className={`flex flex-col gap-3 ${c.activo ? "" : "opacity-70"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">{c.nombre}{!c.activo && <span className="ml-2 text-xs text-texto-3">desactivado</span>}</p>
                <p className="num text-2xl font-black tracking-[0.06em]">{c.codigo}</p>
              </div>
              <dl className="flex gap-5 text-sm">
                <div><dt className="text-xs text-texto-3">Personas</dt><dd className="font-bold">{c.personas}{c.max_personas ? ` / ${c.max_personas}` : ""}</dd></div>
                <div><dt className="text-xs text-texto-3">Boletos pagados</dt><dd className="font-bold">{c.boletos}</dd></div>
                <div><dt className="text-xs text-texto-3">Vendido</dt><dd className="font-bold">{formatMoney(Number(c.vendido))}</dd></div>
              </dl>
            </div>
            <p className="break-all text-xs text-texto-3">Liga: {path}</p>
            <div className="flex flex-wrap gap-2">
              <CopyLink path={path} />
              {c.activo && <CompartirWhatsApp path={path} texto={texto} />}
              {editar && <ActionForm inline action={estadoCodigoPreventa} hidden={{ pid: id, id: c.id, activo: c.activo ? "0" : "1" }}
                confirm={c.activo ? "¿Desactivar? Quien ya lo usó pierde el acceso a la preventa privada." : undefined} submit={c.activo ? "Desactivar" : "Activar"} submitClass={ghost} />}
            </div>
          </Card>
        );
      })}
      {codigos.length === 0 && <Card><p className="text-sm text-texto-2">Aún no hay códigos. Crea uno por grupo (familias del elenco, patrocinadores, prensa…) para saber cuánto vende cada uno.</p></Card>}

      {editar && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Nuevo código</h2>
          <ActionForm action={crearCodigoPreventa} hidden={{ pid: id }} submit="Crear código">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">¿Para quién es? *
                <input className={input} name="nombre" required minLength={2} maxLength={80} placeholder="Familias del elenco" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Máximo de personas (vacío = sin límite)
                <input className={input} name="max_personas" type="number" min={1} placeholder="50" />
              </label>
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
