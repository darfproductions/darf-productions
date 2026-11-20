import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Icono } from "@/components/Icono";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { getHonorarios, getReserva, listCierres } from "@/lib/honorarios";
import { requireCabeza } from "@/lib/permissions";
import { crearCierre } from "../actions";

export const metadata: Metadata = { title: "Cierres de temporada" };

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX")}`;

// Honorarios · Cierres de temporada (0152): al terminar la temporada (o una extensión) de una obra, se capturan boletos,
// patrocinios, costos y préstamos; se calcula la ganancia y se reparte. Solo las cabezas.
export default async function Cierres() {
  await requireCabeza("/panel/honorarios/cierres");
  const [h, cierres, reserva] = await Promise.all([getHonorarios(), listCierres(), getReserva()]);
  const nombre = new Map(h.obras.map((o) => [o.production_id, o.nombre]));

  return (
    <div className="flex flex-col gap-6">
      <PanelTitle eyebrow="Honorarios · solo las cabezas de DARF" title="Cierres de temporada">
        Cuando termina una temporada (o una extensión), se calcula su ganancia (boletos y patrocinios, menos costos y préstamos de la reserva) y se reparte con el reparto de cierre de la obra. No depende de las mensualidades.
      </PanelTitle>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Nuevo cierre</h2>
        <ActionForm action={crearCierre} submit="Empezar el cierre">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">Obra
              <select className={input} name="production_id" required defaultValue="">
                <option value="" disabled>Elige…</option>
                {h.obras.map((o) => <option key={o.production_id} value={o.production_id}>{o.nombre}{reserva.pendientes.get(o.production_id) ? ` (debe ${pesos(reserva.pendientes.get(o.production_id)!)} a la reserva)` : ""}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Nombre<input className={input} name="nombre" required placeholder="Temporada 2027" /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Préstamos de la reserva a devolver ($)<input className={input} type="number" min={0} step="0.01" name="prestamos" placeholder="0" /></label>
          </div>
          <p className="text-xs text-texto-3">Los boletos se llenan solos con lo vendido en la página. Después de crearlo, captura patrocinios y costos, revisa el reparto y ciérralo.</p>
        </ActionForm>
      </Card>

      {cierres.length === 0 ? <Card className="text-texto-2">Todavía no hay cierres.</Card> : (
        <ul className="flex flex-col gap-3">
          {cierres.map((c) => (
            <li key={c.id}>
              <Link href={`/panel/honorarios/cierres/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-telon p-5 hover:bg-telon-2">
                <span><b>{nombre.get(c.production_id) ?? c.production_id}</b> · {c.nombre}</span>
                <span className="flex items-center gap-3 text-sm">
                  {c.estado === "cerrado"
                    ? <span className="rounded-full bg-[#14532d] px-3 py-1 text-xs font-bold text-[#bbf7d0]">Cerrado · ganancia {pesos(Number(c.ganancia ?? 0))} · pagos {pesos(Number(c.total_pagado ?? 0))}</span>
                    : <span className="rounded-full bg-aviso/20 px-3 py-1 text-xs font-bold text-aviso">En captura</span>}
                  <Icono nombre="flecha-der" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
