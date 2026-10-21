import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { listPerformances, listZones } from "@/lib/boleteria";
import { isoToLocalMx } from "@/lib/dates";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { deleteDiscount, deletePromo, saveDiscount, savePromo } from "../actions";

export const metadata: Metadata = { title: "Descuentos" };

type Code = {
  id: string; codigo: string; percent: number; valid_from: string | null; valid_until: string | null;
  max_uses_total: number | null; max_tickets_per_order: number | null; is_active: boolean; uses: number;
  category_ids: string[]; performance_ids: string[];
};
const ghost = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60";

function CodeFields({ c, zonas, funciones }: { c?: Code; zonas: { id: string; nombre: string }[]; funciones: { id: string; starts_at: string | null }[] }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Código<input className={`${input} uppercase`} name="codigo" required defaultValue={c?.codigo} placeholder="FAMILIA15" /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">% de descuento<input className={input} type="number" name="percent" min={1} max={100} required defaultValue={c?.percent} /></label>
        <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold"><input type="checkbox" name="activo" defaultChecked={c?.is_active ?? true} /> Activo</label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Válido desde<input className={input} type="datetime-local" name="desde" defaultValue={isoToLocalMx(c?.valid_from ?? null)} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Válido hasta<input className={input} type="datetime-local" name="hasta" defaultValue={isoToLocalMx(c?.valid_until ?? null)} /></label>
        <span />
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Usos totales (vacío = sin límite)<input className={input} type="number" min={1} name="max_total" defaultValue={c?.max_uses_total ?? ""} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Máx. boletos por compra<input className={input} type="number" min={1} name="max_orden" defaultValue={c?.max_tickets_per_order ?? ""} /></label>
      </div>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 font-semibold">Zonas (ninguna marcada = todas)</legend>
        {zonas.map((z) => <label key={z.id} className="flex items-center gap-1.5"><input type="checkbox" name="zona" value={z.id} defaultChecked={c?.category_ids.includes(z.id)} /> {z.nombre}</label>)}
      </fieldset>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 font-semibold">Funciones (ninguna marcada = todas)</legend>
        {funciones.map((f) => <label key={f.id} className="flex items-center gap-1.5"><input type="checkbox" name="funcion" value={f.id} defaultChecked={c?.performance_ids.includes(f.id)} /> {formatPerformanceDate(f.starts_at)}</label>)}
      </fieldset>
    </>
  );
}

type Promo = { id: string; nombre: string; percent: number; valid_from: string | null; valid_until: string | null; is_active: boolean; funciones: string[]; zonas: string[] };

function PromoFields({ c, zonas, funciones }: { c?: Promo; zonas: { id: string; nombre: string }[]; funciones: { id: string; starts_at: string | null }[] }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre (lo ve el público)<input className={input} name="nombre" required maxLength={60} defaultValue={c?.nombre} placeholder="Jueves de estreno" /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">% de descuento<input className={input} type="number" name="percent" min={1} max={100} required defaultValue={c?.percent} /></label>
        <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold"><input type="checkbox" name="activo" defaultChecked={c?.is_active ?? true} /> Activa</label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Desde (vacío = ya)<input className={input} type="datetime-local" name="desde" defaultValue={isoToLocalMx(c?.valid_from ?? null)} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Hasta (vacío = sin fin)<input className={input} type="datetime-local" name="hasta" defaultValue={isoToLocalMx(c?.valid_until ?? null)} /></label>
      </div>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 font-semibold">Funciones (ninguna marcada = todas)</legend>
        {funciones.map((f) => <label key={f.id} className="flex items-center gap-1.5"><input type="checkbox" name="funcion" value={f.id} defaultChecked={c?.funciones.includes(f.id)} /> {formatPerformanceDate(f.starts_at)}</label>)}
      </fieldset>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 font-semibold">Zonas (ninguna marcada = todas)</legend>
        {zonas.map((z) => <label key={z.id} className="flex items-center gap-1.5"><input type="checkbox" name="zona" value={z.id} defaultChecked={c?.zonas.includes(z.id)} /> {z.nombre}</label>)}
      </fieldset>
    </>
  );
}

// Códigos de descuento de la obra (mismas reglas que la 1.0: la base calcula el descuento).
export default async function DiscountsPage({ params }: PageProps<"/panel/producciones/[id]/boletos/descuentos">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/descuentos`);
  if (!can(access, id, "descuentos.gestionar")) redirect(salidaBoletos(access, id, "boletos/descuentos"));
  const supabase = await createClient();
  const [{ data, error }, zonas, todas, promosRes] = await Promise.all([
    supabase.rpc("admin_list_discount_codes", { target_production_id: id }),
    listZones(id),
    listPerformances(id),
    supabase.from("promos").select("id, nombre, percent, valid_from, valid_until, is_active, promo_performances(performance_id), promo_categories(price_category_id)").eq("production_id", id).order("created_at"),
  ]);
  const codes = (data ?? []) as Code[];
  const funciones = todas.filter((f) => !f.cancelada_at);
  const ahoraIso = new Date().toISOString();
  const promos: Promo[] = ((promosRes.data ?? []) as unknown as (Omit<Promo, "funciones" | "zonas"> & { promo_performances: { performance_id: string }[]; promo_categories: { price_category_id: string }[] })[])
    .map((p) => ({ ...p, funciones: p.promo_performances.map((x) => x.performance_id), zonas: p.promo_categories.map((x) => x.price_category_id) }));
  const fechaCorta = (iso: string | null) => formatPerformanceDate(iso).replace(/^\S+ /, "");

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="titular text-xl">Promos automáticas</h2>
          <p className="text-sm text-texto-2">Un descuento que se aplica solo, sin escribir código, en las funciones y zonas que elijas. El público ve el precio tachado y el nombre de la promo; la taquilla también cobra con ella. Si hay dos promos, gana la mayor. Un código de descuento se aplica encima.</p>
        </div>
        {promos.map((c) => {
          const vigente = c.is_active && (!c.valid_from || c.valid_from <= ahoraIso) && (!c.valid_until || c.valid_until > ahoraIso);
          return (
            <details key={c.id} className="rounded-lg bg-sala p-3">
              <summary className="cursor-pointer">
                <span className="font-bold">{c.nombre}</span> · {c.percent}% · {c.funciones.length ? `${c.funciones.length} ${c.funciones.length === 1 ? "función" : "funciones"}` : "todas las funciones"}
                {c.zonas.length > 0 && ` · ${c.zonas.length} ${c.zonas.length === 1 ? "zona" : "zonas"}`}
                {vigente ? <span className="ml-2 rounded-full bg-[#14532d] px-2 py-0.5 text-[11px] uppercase text-[#bbf7d0]">vigente</span>
                  : <span className="ml-2 text-xs text-texto-3">{!c.is_active ? "inactiva" : c.valid_from && c.valid_from > ahoraIso ? `empieza ${fechaCorta(c.valid_from)}` : "terminó"}</span>}
              </summary>
              <div className="mt-4 flex flex-col gap-3">
                <ActionForm action={savePromo} hidden={{ pid: id, id: c.id }} submit="Guardar promo">
                  <PromoFields c={c} zonas={zonas} funciones={funciones} />
                </ActionForm>
                <ActionForm inline action={deletePromo} hidden={{ pid: id, id: c.id }} confirm={`¿Borrar la promo ${c.nombre}? Los boletos ya vendidos conservan su precio.`} submit="Borrar promo" submitClass={ghost} />
              </div>
            </details>
          );
        })}
        {/* Fuera de un <details>: al guardar, el aviso "Promo guardada" no se esconde. */}
        <div className="rounded-lg border border-white/15 p-3">
          <h3 className="mb-3 font-bold text-violeta-claro">Nueva promo</h3>
          <ActionForm action={savePromo} hidden={{ pid: id }} submit="Crear promo">
            <PromoFields zonas={zonas} funciones={funciones} />
          </ActionForm>
        </div>
      </Card>

      <h2 className="titular mt-2 text-xl">Códigos de descuento</h2>
      {error && <Card>{error.message}</Card>}
      {codes.map((c) => (
        <Card key={c.id}>
          <details>
            <summary className="cursor-pointer">
              <span className="font-bold">{c.codigo}</span> · {c.percent}% · usado {c.uses}{c.max_uses_total ? ` de ${c.max_uses_total}` : ""} veces
              {!c.is_active && <span className="ml-2 text-xs text-texto-3">inactivo</span>}
            </summary>
            <div className="mt-4 flex flex-col gap-3">
              <ActionForm action={saveDiscount} hidden={{ pid: id, id: c.id }} submit="Guardar código">
                <CodeFields c={c} zonas={zonas} funciones={funciones} />
              </ActionForm>
              <ActionForm inline action={deleteDiscount} hidden={{ pid: id, id: c.id }} confirm={`¿Eliminar ${c.codigo}? Si ya se usó, solo se desactiva.`} submit="Eliminar" submitClass={ghost} />
            </div>
          </details>
        </Card>
      ))}
      <Card>
        <h2 className="titular mb-3 text-xl">Nuevo código</h2>
        <ActionForm action={saveDiscount} hidden={{ pid: id }} submit="Crear código">
          <CodeFields zonas={zonas} funciones={funciones} />
        </ActionForm>
      </Card>
    </>
  );
}
