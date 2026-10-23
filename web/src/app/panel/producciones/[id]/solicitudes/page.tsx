import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { RequestCard } from "@/components/requests/RequestCard";
import { signDocs } from "@/lib/members";
import { can, canAny } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { TIPO_SOLICITUD, type RequestEstado, type RequestTipo } from "@/lib/request-rules";
import { listRequests } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";
import { ReviewForm } from "./ReviewForm";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Solicitudes del elenco" };

const ESTADOS: [RequestEstado | "todas", string][] = [["pendiente", "Por revisar"], ["aprobada", "Aprobadas"], ["rechazada", "Rechazadas"], ["todas", "Todas"]];

// Solicitudes del elenco (0070): cada quien ve y revisa los tipos de su permiso
// (faltas y llegadas tarde: ensayos · documentos: expedientes · pagos: mensualidades).
export default async function Solicitudes({ params, searchParams }: PageProps<"/panel/producciones/[id]/solicitudes">) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/solicitudes`);
  if (!canAny(access, id, ["ensayos.gestionar", "expedientes.ver", "mensualidades.gestionar"])) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [todas, { data: gente }] = await Promise.all([listRequests(id, { limit: 500 }), supabase.rpc("request_people", { pid: id })]);
  const nombre = new Map(((gente ?? []) as { user_id: string; nombre: string }[]).map((g) => [g.user_id, g.nombre]));
  const estado = (ESTADOS.find(([k]) => k === sp.estado)?.[0] ?? "pendiente") as RequestEstado | "todas";
  const tipo = (Object.keys(TIPO_SOLICITUD) as RequestTipo[]).find((t) => t === sp.tipo) ?? null;
  const lista = todas.filter((r) => (estado === "todas" || r.estado === estado) && (!tipo || r.tipo === tipo));
  const pendientes = todas.filter((r) => r.estado === "pendiente");
  const urls = await signDocs(lista.map((r) => r.archivo_path));
  const verFicha = can(access, id, "expedientes.ver") || can(access, id, "mensualidades.gestionar");
  const qs = (e: string, t: string | null) => `?estado=${e}${t ? `&tipo=${t}` : ""}`;
  const chip = (activo: boolean) => `rounded-full border px-3 py-1.5 font-semibold ${activo ? "border-texto bg-texto text-sala" : "border-white/20 hover:border-white/50"}`;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Solicitudes del elenco</h2>
        <p className="text-sm text-texto-2">
          Faltas con aviso, llegadas tarde, documentos, comprobantes de pago y otros temas que manda el elenco desde su portal. Al aprobar, la falta queda justificada,
          la hora de la llegada tarde se vuelve su hora de entrada, el pago se registra o el documento queda recibido. Al rechazar, escribe la razón: el integrante la ve.
        </p>
        <nav aria-label="Estado" className="flex flex-wrap gap-2 text-sm">
          {ESTADOS.map(([k, l]) => (
            <Link key={k} href={qs(k, tipo)} aria-current={estado === k ? "page" : undefined} className={chip(estado === k)}>
              {l}{k === "pendiente" && pendientes.length ? ` (${pendientes.length})` : ""}
            </Link>
          ))}
        </nav>
        <nav aria-label="Tipo" className="flex flex-wrap gap-2 text-xs">
          <Link href={qs(estado, null)} className={chip(!tipo)}>Todos los tipos</Link>
          {(Object.keys(TIPO_SOLICITUD) as RequestTipo[]).map((t) => (
            <Link key={t} href={qs(estado, t)} className={chip(tipo === t)}><Icono nombre={TIPO_SOLICITUD[t].icono} /> {TIPO_SOLICITUD[t].corto}</Link>
          ))}
        </nav>
      </Card>

      {lista.length === 0 ? (
        <Card className="text-sm text-texto-2">{estado === "pendiente" ? <>No hay solicitudes por revisar. <Icono nombre="check" /></> : "No hay solicitudes con este filtro."}</Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {lista.map((r) => (
            <li key={r.id} className="min-w-0">
              <RequestCard r={r} url={r.archivo_path ? urls.get(r.archivo_path) : undefined} persona={nombre.get(r.user_id) ?? "Integrante"}>
                {verFicha && <Link href={`/panel/producciones/${id}/expedientes/${r.user_id}`} className="self-start text-xs font-bold text-violeta-claro">Ver su ficha <Icono nombre="flecha-der" /></Link>}
                {r.estado === "pendiente" && <ReviewForm pid={id} id={r.id} tipo={r.tipo} monto={r.monto} conDoc={!!r.doc_type_id} />}
              </RequestCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
