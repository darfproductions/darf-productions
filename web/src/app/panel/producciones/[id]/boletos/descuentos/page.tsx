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
import { deleteDiscount, saveDiscount } from "../actions";

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

// Códigos de descuento de la obra (mismas reglas que la 1.0: la base calcula el descuento).
export default async function DiscountsPage({ params }: PageProps<"/panel/producciones/[id]/boletos/descuentos">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/descuentos`);
  if (!can(access, id, "descuentos.gestionar")) redirect(salidaBoletos(access, id, "boletos/descuentos"));
  const supabase = await createClient();
  const [{ data, error }, zonas, funciones] = await Promise.all([
    supabase.rpc("admin_list_discount_codes", { target_production_id: id }),
    listZones(id),
    listPerformances(id),
  ]);
  const codes = (data ?? []) as Code[];

  return (
    <>
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
