import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { CopyLink } from "@/components/panel/CopyLink";
import { Card, input } from "@/components/panel/ui";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { estadoVendedor, sellerPath, TIPO_VENDEDOR, type SellerRow } from "@/lib/seller-rules";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/tickets";
import { addAccountSeller, addExternalSeller, setSellerActive } from "./actions";
import { BuscarCuenta } from "@/components/panel/BuscarCuenta";

export const metadata: Metadata = { title: "Vendedores" };

const small = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

// Vendedores de la obra: el elenco vende solo; aquí se activa a otras cuentas o externos.
export default async function Vendedores({ params }: PageProps<"/panel/producciones/[id]/boletos/vendedores">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/vendedores`);
  const gestiona = can(access, id, "vendedores.gestionar");
  if (!gestiona && !can(access, id, "ventas.ver")) redirect(salidaBoletos(access, id, "boletos/vendedores"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seller_list", { pid: id });
  const rows = (data ?? []) as SellerRow[];
  const h = (sid: string, accion: string) => ({ pid: id, sid, accion });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Vendedores</h2>
        <p className="text-sm text-texto-2">
          Cada cuenta tiene un código fijo. El elenco de esta obra puede vender con el suyo sin hacer nada; aquí puedes
          desactivar a alguien, activar a otra cuenta o crear un vendedor externo. Cada quien ve sus ventas en Mi cuenta.
        </p>
        {error && <p className="text-sm text-[#ff8fa3]">{error.message}</p>}
        <ul className="flex flex-col divide-y divide-white/10 text-sm">
          {rows.map((r) => (
            <li key={r.seller_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <b>{r.nombre}</b> <span className="font-mono text-texto-2">{r.codigo}</span>
                <span className="block text-xs text-texto-3">
                  {TIPO_VENDEDOR[r.tipo]} · <span className={r.activo ? "text-exito" : ""}>{estadoVendedor(r)}</span> ·{" "}
                  {r.boletos} boletos · {formatMoney(Number(r.monto))}{r.pendientes ? ` · ${r.pendientes} por aprobar` : ""}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {r.activo && <CopyLink path={sellerPath(id, r.codigo)} />}
                {gestiona && (r.activo
                  ? <ActionForm inline action={setSellerActive} hidden={h(r.seller_id, "desactivar")} submit="Desactivar" submitClass={small} confirm={`¿Desactivar el código de ${r.nombre} en esta obra?`} />
                  : <ActionForm inline action={setSellerActive} hidden={h(r.seller_id, "activar")} submit="Activar" submitClass={small} />)}
                {gestiona && r.decidido && r.tipo !== "externo" && (
                  <ActionForm inline action={setSellerActive} hidden={h(r.seller_id, "auto")} submit="Regla del elenco" submitClass={small} />
                )}
              </span>
            </li>
          ))}
          {rows.length === 0 && <li className="py-2 text-texto-3">Aún no hay vendedores. El elenco con cuenta aparece aquí solo.</li>}
        </ul>
      </Card>

      {gestiona && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="titular mb-3 text-xl">Activar una cuenta</h2>
            <ActionForm action={addAccountSeller} hidden={{ pid: id }} submit="Activar">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre o correo de su cuenta
                <BuscarCuenta />
              </label>
            </ActionForm>
          </Card>
          <Card>
            <h2 className="titular mb-3 text-xl">Vendedor externo</h2>
            <ActionForm action={addExternalSeller} hidden={{ pid: id }} submit="Crear código">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre (persona o compañía)
                <input className={input} name="nombre" required maxLength={120} />
              </label>
            </ActionForm>
            <p className="mt-2 text-xs text-texto-3">No necesita cuenta. Su código vale solo en esta obra; sus ventas las ves aquí.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
