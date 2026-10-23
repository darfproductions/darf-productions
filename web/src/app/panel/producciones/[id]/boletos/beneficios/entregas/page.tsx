import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { listPerformances } from "@/lib/boleteria";
import { ESTADOS_ENTREGA, ORDEN_ESTADO, TIPOS_BENEFICIO, cuentaComoPendiente, mensajeEntrega, textoLimite, type EstadoEntrega, type MomentoEntrega, type TipoBeneficio } from "@/lib/beneficios-rules";
import { ligaWhatsApp } from "@/lib/pago-rules";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { marcarEntrega } from "./actions";

export const metadata: Metadata = { title: "Entregas de beneficios" };

type Fila = {
  ticket_id: string; order_code: string; comprador: string; telefono: string; lugar: string; zona: string;
  beneficio_id: string; beneficio: string; tipo: TipoBeneficio; entrega: MomentoEntrega; entrega_dias: number | null;
  desde: string; limite: string; estado: EstadoEntrega; entregado_at: string | null; entregado_por: string | null; nota: string | null;
};
const FILTROS = { pendientes: "Por entregar", vencidos: "Vencidos", hoy: "Ya se pueden entregar", entregados: "Entregados", todos: "Todos" } as const;
type Filtro = keyof typeof FILTROS;
const pasa: Record<Filtro, (e: EstadoEntrega) => boolean> = {
  pendientes: cuentaComoPendiente, vencidos: (e) => e === "vencido", hoy: (e) => e === "hoy", entregados: (e) => e === "entregado", todos: () => true,
};
const TONO: Record<string, string> = { ok: "bg-exito/15 text-exito", alerta: "bg-aviso/15 text-aviso", error: "bg-pulso/20 text-pulso", neutro: "bg-white/10 text-texto-2" };
const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";
const cuando = (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// 0125: lista de entregas de beneficios por función. Lo pagado se tiene que entregar: aquí se ve, persona por
// persona, qué falta, qué ya se venció y qué se entregó (quién, cuándo y una nota). Se marca aquí o en la puerta.
export default async function EntregasPage({ params, searchParams }: PageProps<"/panel/producciones/[id]/boletos/beneficios/entregas">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/beneficios/entregas`);
  const ver = can(access, id, "ventas.ver") || can(access, id, "puerta.validar") || can(access, id, "funciones.gestionar");
  if (!ver) redirect(salidaBoletos(access, id, "boletos/beneficios"));
  const marca = can(access, id, "puerta.validar") || can(access, id, "ventas.operar") || can(access, id, "funciones.gestionar");
  const sp = await searchParams;
  const supabase = await createClient();
  const [funcionesTodas, { data: obra }] = await Promise.all([listPerformances(id), supabase.from("productions").select("nombre").eq("id", id).maybeSingle()]);
  const funciones = funcionesTodas.filter((f) => !f.cancelada_at);
  const ahora = new Date().getTime();
  const elegida = funciones.find((f) => f.id === sp.funcion) ?? funciones.find((f) => f.starts_at && Date.parse(f.starts_at) > ahora - 6 * 3600_000) ?? funciones.at(-1);
  const { data } = elegida ? await supabase.rpc("beneficios_entregas", { p_performance: elegida.id }) : { data: [] };
  const todas = ((data ?? []) as Fila[]).sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || a.limite.localeCompare(b.limite));
  const filtro: Filtro = typeof sp.ver === "string" && sp.ver in FILTROS ? (sp.ver as Filtro) : "pendientes";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filas = todas.filter((f) => pasa[filtro](f.estado) && (!q || sinAcentos(`${f.comprador} ${f.telefono} ${f.order_code} ${f.lugar} ${f.beneficio}`).includes(sinAcentos(q))));
  const cuenta = (fl: Filtro) => todas.filter((f) => pasa[fl](f.estado)).length;
  // Totales por beneficio.
  const porBeneficio = new Map<string, { nombre: string; tipo: TipoBeneficio; total: number; entregados: number; vencidos: number }>();
  for (const f of todas) {
    const t = porBeneficio.get(f.beneficio_id) ?? { nombre: f.beneficio, tipo: f.tipo, total: 0, entregados: 0, vencidos: 0 };
    t.total++; if (f.estado === "entregado") t.entregados++; if (f.estado === "vencido") t.vencidos++;
    porBeneficio.set(f.beneficio_id, t);
  }
  const liga = (x: Record<string, string>) => `?${new URLSearchParams({ ...(elegida ? { funcion: elegida.id } : {}), ver: filtro, ...(q ? { q } : {}), ...x })}`;

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="titular text-xl">Entregas de beneficios</h2>
            <p className="text-sm text-texto-2">Lo que cada persona pagó además de su lugar: qué falta, qué ya se venció y qué se entregó. Se marca aquí o en la Puerta al escanear el boleto.</p>
          </div>
          <Link href={`/panel/producciones/${id}/boletos/beneficios`} className={ghost}>Configurar beneficios</Link>
        </div>
        {funciones.length === 0 ? <p className="text-sm text-texto-3">Todavía no hay funciones.</p> : (
          <nav aria-label="Función" className="flex flex-wrap gap-2 text-sm">
            {funciones.map((f) => (
              <Link key={f.id} href={`?funcion=${f.id}`} aria-current={elegida?.id === f.id ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 font-semibold ${elegida?.id === f.id ? "bg-texto text-sala" : "border border-white/20 hover:border-white/50"}`}>{formatPerformanceDate(f.starts_at)}</Link>
            ))}
          </nav>
        )}
        {porBeneficio.size > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...porBeneficio.values()].map((b) => (
              <li key={b.nombre} className="flex items-center justify-between gap-2 rounded-xl bg-telon-2 p-3 text-sm">
                <span className="flex items-center gap-2"><Icono nombre={TIPOS_BENEFICIO[b.tipo].icono} />{b.nombre}</span>
                <span className="text-right"><b className="num">{b.entregados}</b>/<span className="num">{b.total}</span>
                  {b.vencidos > 0 && <span className="block text-xs font-bold text-pulso">{b.vencidos} vencidos</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {elegida && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <nav aria-label="Filtro" className="flex flex-wrap gap-2 text-sm">
              {(Object.keys(FILTROS) as Filtro[]).map((fl) => (
                <Link key={fl} href={liga({ ver: fl })} aria-current={filtro === fl ? "page" : undefined}
                  className={`rounded-full px-3 py-1.5 font-semibold ${filtro === fl ? "bg-texto text-sala" : "border border-white/20 hover:border-white/50"}`}>
                  {FILTROS[fl]} <span className="num">{cuenta(fl)}</span>
                </Link>
              ))}
            </nav>
            <a href={`/panel/producciones/${id}/boletos/beneficios/entregas/exportar?funcion=${elegida.id}`} className={`${ghost} inline-flex items-center gap-1.5`}><Icono nombre="descargar" />Excel</a>
          </div>
          <form className="flex gap-2">
            <input type="hidden" name="funcion" value={elegida.id} />
            <input type="hidden" name="ver" value={filtro} />
            <input className={`${input} flex-1`} name="q" defaultValue={q} placeholder="Buscar por nombre, teléfono, orden o lugar" aria-label="Buscar" />
            <button className={ghost}>Buscar</button>
          </form>
          {filas.length === 0 ? (
            <p className="text-sm text-texto-3">{todas.length === 0 ? "Esta función no tiene beneficios pagados." : filtro === "pendientes" ? "No falta nada por entregar." : "No hay nada con este filtro."}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/10">
              {filas.map((f) => {
                const est = ESTADOS_ENTREGA[f.estado];
                const wa = f.estado !== "entregado" ? ligaWhatsApp(f.telefono, mensajeEntrega({ comprador: f.comprador, beneficio: f.beneficio, obra: (obra?.nombre as string) ?? "", lugar: f.lugar, limite: f.limite, entrega: f.entrega })) : null;
                const hidden = { pid: id, ticket: f.ticket_id, beneficio: f.beneficio_id };
                return (
                  <li key={`${f.ticket_id}-${f.beneficio_id}`} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <b>{f.comprador}</b>
                        <span className="text-texto-3">{f.lugar}{f.lugar !== f.zona ? ` · ${f.zona}` : ""} · {f.order_code}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Icono nombre={TIPOS_BENEFICIO[f.tipo].icono} />{f.beneficio}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TONO[est.tono]}`}>{est.label}</span>
                      </span>
                      {f.estado === "entregado" && f.entregado_at
                        ? <span className="text-xs text-texto-3">Entregado {cuando(f.entregado_at)}{f.entregado_por ? ` por ${f.entregado_por}` : ""}{f.nota ? ` · "${f.nota}"` : ""}</span>
                        : <span className="text-xs text-texto-3">{textoLimite(f.limite, f.entrega)}</span>}
                    </div>
                    {marca && (
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={`${ghost} inline-flex items-center gap-1.5`}><Icono nombre="telefono" />WhatsApp</a>}
                        {f.estado === "entregado"
                          ? <ActionForm inline action={marcarEntrega} hidden={{ ...hidden, entregado: "0" }} confirm={`¿Deshacer la entrega de "${f.beneficio}" a ${f.comprador}?`} submit="Deshacer" submitClass={ghost} />
                          : (
                            <ActionForm inline action={marcarEntrega} hidden={{ ...hidden, entregado: "1" }} submit="Entregado" submitClass="rounded-full bg-texto px-3 py-1.5 text-xs font-bold text-sala disabled:opacity-60">
                              <input className={`${input} w-44 py-1.5 text-xs`} name="nota" maxLength={200} placeholder="Nota (opcional)" aria-label={`Nota de la entrega a ${f.comprador}`} />
                            </ActionForm>
                          )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
