import type { Metadata } from "next";
import Link from "next/link";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { describeAudit, tipoBitacora, TIPOS_BITACORA, type AuditRow } from "@/lib/audit";
import { localMxToIso } from "@/lib/dates";
import { requireCasa } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bitácora" };

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

const PAGINA = 150;
const TOPE = 1000;
const dia = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
/** Día siguiente (para "hasta" inclusivo). */
const siguiente = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

// Solo el Director: quién cambió qué y cuándo. Nadie la puede editar ni borrar.
// Bloque 4C: filtros por obra, persona, tipo de acción y fechas (hora de México), y "Ver más".
export default async function AuditPage({ searchParams }: PageProps<"/panel/bitacora">) {
  await requireCasa("casa.bitacora", "/panel/bitacora");
  const sp = await searchParams;
  const val = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const obra = val("obra");
  const persona = /^[0-9a-f-]{36}$/.test(val("persona")) ? val("persona") : "";
  const tipo = tipoBitacora(val("tipo"));
  const desde = dia(val("desde"));
  const hasta = dia(val("hasta"));
  const cuantos = Math.min(TOPE, Math.max(PAGINA, Number(val("n")) || PAGINA));

  const supabase = await createClient();
  let q = supabase.from("audit_log").select("*", { count: "exact" }).order("at", { ascending: false }).limit(cuantos);
  if (obra) q = q.eq("production_id", obra);
  if (persona) q = q.eq("actor", persona);
  if (tipo) {
    q = q.in("tabla", tipo.tablas);
    if (tipo.accion) q = q.eq("accion", tipo.accion);
  }
  if (desde) q = q.gte("at", localMxToIso(`${desde}T00:00`)!);
  if (hasta) q = q.lt("at", localMxToIso(`${siguiente(hasta)}T00:00`)!);
  const [{ data: rows, count }, { data: prods }, { data: roles }, { data: actores }] = await Promise.all([
    q,
    supabase.from("productions").select("id, nombre").order("nombre"),
    supabase.from("panel_roles").select("id, nombre"),
    supabase.rpc("audit_actores"),
  ]);
  const log = (rows ?? []) as AuditRow[];
  const total = count ?? log.length;

  // Nombres de las personas que aparecen (el Director puede leer perfiles).
  const ids = new Set<string>();
  for (const r of log) {
    if (r.actor) ids.add(r.actor);
    const row = (r.despues ?? r.antes ?? {}) as Record<string, unknown>;
    for (const k of ["user_id", "asignado_a", "respondido_por"]) if (typeof row[k] === "string") ids.add(row[k] as string);
    if (r.tabla === "profiles" && typeof row.id === "string") ids.add(row.id);
  }
  const { data: people } = ids.size
    ? await supabase.from("profiles").select("id, nombre").in("id", [...ids])
    : { data: [] as { id: string; nombre: string | null }[] };
  const personName = new Map((people ?? []).map((p) => [p.id, p.nombre || "Sin nombre"]));
  const prodName = new Map((prods ?? []).map((p) => [p.id as string, p.nombre as string]));
  const roleName = new Map((roles ?? []).map((r) => [r.id as string, r.nombre as string]));
  const names = {
    person: (id: unknown) => personName.get(String(id)) ?? "una cuenta",
    role: (id: unknown) => roleName.get(String(id)) ?? String(id),
    production: (id: unknown) => prodName.get(String(id)) ?? String(id),
  };
  const filtros = !!(obra || persona || tipo || desde || hasta);
  const masLiga = () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ obra, persona, tipo: tipo?.id ?? "", desde, hasta })) if (v) p.set(k, v);
    p.set("n", String(Math.min(TOPE, cuantos + PAGINA)));
    return `/panel/bitacora?${p.toString()}`;
  };

  return (
    <>
      <PanelTitle eyebrow="Ajustes" title="Bitácora">
        Registro automático de cambios: permisos, obras, boletos, audiciones, pagos y más. No se puede editar ni borrar.
      </PanelTitle>
      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros de la bitácora">
          <label className="flex flex-col gap-1 text-sm font-semibold">Obra
            <select name="obra" defaultValue={obra} className={input}>
              <option value="">Todas</option>
              {(prods ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">Persona
            <select name="persona" defaultValue={persona} className={input}>
              <option value="">Todas</option>
              {((actores ?? []) as { id: string; nombre: string }[]).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">Tipo de acción
            <select name="tipo" defaultValue={tipo?.id ?? ""} className={input}>
              <option value="">Todas</option>
              {TIPOS_BITACORA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">Desde
            <input type="date" name="desde" defaultValue={desde} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">Hasta
            <input type="date" name="hasta" defaultValue={hasta} className={input} />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-5">
            <button className="rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala">Filtrar</button>
            {filtros && <Link href="/panel/bitacora" className="text-sm font-bold text-violeta-claro">Limpiar filtros</Link>}
            <span className="text-sm text-texto-3">{total === 1 ? "1 cambio" : `${total.toLocaleString("es-MX")} cambios`}{total > log.length ? ` · mostrando ${log.length}` : ""}</span>
          </div>
        </form>
      </Card>
      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {log.map((r) => (
            <li key={r.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <p className="font-semibold">{describeAudit(r, names)}</p>
              <p className="shrink-0 text-sm text-texto-3">{r.actor ? names.person(r.actor) : "Sistema"} · {fecha(r.at)}</p>
            </li>
          ))}
          {log.length === 0 && <li className="px-5 py-4 text-texto-2">{filtros ? "No hay cambios con esos filtros." : "Sin cambios registrados todavía."}</li>}
        </ul>
      </Card>
      {total > log.length && cuantos < TOPE && <Link href={masLiga()} className="self-start rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50">Ver más</Link>}
      {total > log.length && cuantos >= TOPE && <p className="text-sm text-texto-3">Se muestran los {TOPE} más recientes. Usa los filtros para encontrar algo más viejo.</p>}
    </>
  );
}
