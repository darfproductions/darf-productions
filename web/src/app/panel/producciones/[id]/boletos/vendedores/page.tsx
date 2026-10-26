import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { CopyLink } from "@/components/panel/CopyLink";
import { Card, input } from "@/components/panel/ui";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { estadoVendedor, sellerPath, TIPO_VENDEDOR, type SellerRow, rankingVendedores } from "@/lib/seller-rules";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/tickets";
import { addAccountSeller, addExternalSeller, setSellerActive } from "./actions";
import { BuscarCuenta } from "@/components/panel/BuscarCuenta";
import { textoAvance, textoTramo, type ComisionRow, type Tramo } from "@/lib/comision-rules";
import { TramosComision } from "./TramosComision";
import { deshacerPago, pagarComision } from "./actions";

export const metadata: Metadata = { title: "Vendedores" };

const small = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

// Vendedores de la obra: el elenco vende solo; aquí se activa a otras cuentas o externos.
export default async function Vendedores({ params }: PageProps<"/panel/producciones/[id]/boletos/vendedores">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/vendedores`);
  const gestiona = can(access, id, "vendedores.gestionar");
  if (!gestiona && !can(access, id, "ventas.ver")) redirect(salidaBoletos(access, id, "boletos/vendedores"));
  const supabase = await createClient();
  const [{ data, error }, com, tramosRes, pagosRes, obraRes, precios] = await Promise.all([
    supabase.rpc("seller_list", { pid: id }),
    // 0129: comisiones (en vivo), sus tablas y los pagos hechos.
    supabase.rpc("comisiones_obra", { pid: id }),
    supabase.from("comision_tramos").select("seller_id, desde, hasta, porcentaje").eq("production_id", id).order("desde"),
    supabase.from("comision_pagos").select("id, seller_id, monto, nota, pagado_at").eq("production_id", id).order("pagado_at", { ascending: false }),
    supabase.from("productions").select("concluded, performances(starts_at)").eq("id", id).maybeSingle(),
    supabase.from("performance_price_categories").select("price, performances!inner(production_id)").eq("performances.production_id", id),
  ]);
  // 0110: ordenados por boletos vendidos.
  const rows = rankingVendedores((data ?? []) as SellerRow[]);
  const comisiones = new Map(((com.data ?? []) as ComisionRow[]).map((c) => [c.seller_id, c]));
  const todos = (tramosRes.data ?? []) as (Tramo & { seller_id: string | null })[];
  const tramosObra = todos.filter((t) => !t.seller_id);
  const propiosDe = (sid: string) => todos.filter((t) => t.seller_id === sid);
  const pagos = (pagosRes.data ?? []) as { id: string; seller_id: string; monto: number; nota: string | null; pagado_at: string }[];
  const hayComision = todos.length > 0;
  const porPagar = [...comisiones.values()].reduce((s, c) => s + Math.max(0, Number(c.por_pagar)), 0);
  const totalComision = [...comisiones.values()].reduce((s, c) => s + Number(c.comision), 0);
  // "Corte final": la obra ya concluyó o ya pasaron todas sus funciones.
  const ahora = new Date();
  const obra = obraRes.data as { concluded: boolean; performances: { starts_at: string | null }[] } | null;
  const corte = !!obra && (obra.concluded || (obra.performances.length > 0 && obra.performances.every((f) => f.starts_at && Date.parse(f.starts_at) < ahora.getTime())));
  // Precio de ejemplo para la vista previa: el más común de la obra.
  const ps = ((precios.data ?? []) as { price: number }[]).map((r) => Number(r.price)).filter((x) => x > 0);
  const veces = new Map<number, number>();
  for (const x of ps) veces.set(x, (veces.get(x) ?? 0) + 1);
  const precioEjemplo = [...veces.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 250;
  const fechaPago = (s: string) => new Date(s).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" });
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
                {hayComision && (() => {
                  const c = comisiones.get(r.seller_id);
                  if (!c) return null;
                  return (
                    <span className="mt-1 block text-xs">
                      <b className="text-oro">Comisión {formatMoney(Number(c.comision))}</b>
                      {Number(c.pagado) > 0 && <> · pagado {formatMoney(Number(c.pagado))}</>}
                      {" · "}<b className={Number(c.por_pagar) > 0 ? "text-texto" : "text-exito"}>por pagar {formatMoney(Math.max(0, Number(c.por_pagar)))}</b>
                      {!corte && <span className="text-texto-3"> · {textoAvance(c)}</span>}
                      {c.propia && <span className="text-texto-3"> · regla propia</span>}
                    </span>
                  );
                })()}
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

      {/* 0129: comisiones. */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="titular text-xl">{corte ? "Comisiones · corte final" : "Comisiones"}</h2>
          {hayComision && (
            <span className="text-sm">
              Total {formatMoney(totalComision)} · <b className="text-oro">por pagar {formatMoney(porPagar)}</b>
            </span>
          )}
        </div>
        <p className="text-sm text-texto-2">
          Se cuentan los boletos pagados de cada vendedor en todas las funciones, en el orden en que se pagaron, sobre lo
          que pagó cada boleto (con descuento). Las cortesías no cuentan. Si se cancela un boleto, se recalcula solo.
          {corte ? " La venta ya cerró: estos son los montos finales." : ""}
        </p>
        {gestiona ? (
          <div className="rounded-xl border border-white/10 p-3">
            <h3 className="mb-3 text-sm font-bold">Tabla de la obra</h3>
            <TramosComision pid={id} tramos={tramosObra} precio={precioEjemplo} submit="Guardar comisiones" />
          </div>
        ) : (
          <p className="text-sm">{tramosObra.length ? tramosObra.map(textoTramo).join(" · ") : "Esta obra no tiene comisiones."}</p>
        )}
        {gestiona && hayComision && rows.length > 0 && (
          <ul className="flex flex-col divide-y divide-white/10 text-sm">
            {rows.map((r) => {
              const c = comisiones.get(r.seller_id);
              const propios = propiosDe(r.seller_id);
              const suyos = pagos.filter((p) => p.seller_id === r.seller_id);
              const falta = Math.max(0, Number(c?.por_pagar ?? 0));
              return (
                <li key={r.seller_id} className="flex flex-col gap-2 py-3">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <b>{r.nombre}</b>
                    <span>{formatMoney(Number(c?.comision ?? 0))} · por pagar <b className={falta > 0 ? "text-oro" : "text-exito"}>{formatMoney(falta)}</b></span>
                  </span>
                  {falta > 0 && (
                    <ActionForm inline action={pagarComision} hidden={{ pid: id, sid: r.seller_id }} submit="Marcar pagado" submitClass={small}
                      confirm={`¿Registrar el pago de comisión a ${r.nombre}?`}>
                      <input className={`${input} w-28`} name="monto" defaultValue={falta.toFixed(2)} inputMode="decimal" aria-label={`Monto pagado a ${r.nombre}`} />
                      <input className={`${input} w-44`} name="nota" maxLength={200} placeholder="Nota (opcional)" aria-label="Nota del pago" />
                    </ActionForm>
                  )}
                  {suyos.length > 0 && (
                    <ul className="flex flex-col gap-1 text-xs text-texto-3">
                      {suyos.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-2">
                          Pagado {formatMoney(Number(p.monto))} el {fechaPago(p.pagado_at)}{p.nota ? ` · ${p.nota}` : ""}
                          <ActionForm inline action={deshacerPago} hidden={{ pid: id, id: p.id }} submit="Quitar" submitClass={small} confirm="¿Quitar este pago?" />
                        </li>
                      ))}
                    </ul>
                  )}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-texto-2">{propios.length ? `Regla propia: ${propios.map(textoTramo).join(" · ")}` : "Darle una regla propia"}</summary>
                    <div className="mt-2"><TramosComision pid={id} sid={r.seller_id} tramos={propios} precio={precioEjemplo} submit="Guardar su regla" /></div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
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
