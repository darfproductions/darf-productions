import type { Metadata } from "next";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { isoMx } from "@/lib/dates";
import { getHonorarios, vigente, type HonObra } from "@/lib/honorarios";
import { bolsaCompartida } from "@/lib/honorarios-rules";
import { requireCabeza } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { BolsaCard, ListaPersonas } from "../BolsaCard";
import { guardarCompartida, guardarGasto } from "../actions";

export const metadata: Metadata = { title: "Compartidos" };

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX")}`;
const fecha = (d: string) => d.split("-").reverse().join("/");

/** Casillas para marcar entre qué obras (con mensualidad) se comparte algo. */
function ObrasCheck({ obras, marcadas }: { obras: HonObra[]; marcadas: string[] }) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="mb-1 text-sm font-semibold">Entre qué obras</legend>
      {obras.map((o) => (
        <label key={o.production_id} className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm">
          <input type="checkbox" name="obras" value={o.production_id} defaultChecked={marcadas.includes(o.production_id)} /> {o.nombre}{o.activa ? "" : " (cerrada)"}
        </label>
      ))}
    </fieldset>
  );
}

// Honorarios · Compartidos (0151): bolsas compartidas (quién cobra de ellas y qué obras aportan) y gastos compartidos
// (renta del salón, gastos varios…) con el monto al mes y entre qué obras se divide en partes iguales.
export default async function Compartidos() {
  await requireCabeza("/panel/honorarios/compartidos");
  const h = await getHonorarios();
  const hoy = isoMx();
  const mensuales = h.obras.filter((o) => o.mensual);
  const nombre = new Map(h.obras.map((o) => [o.production_id, o.nombre]));
  const supabase = await createClient();
  const { data: gente } = await supabase.from("people").select("nombre").order("nombre").limit(3000);

  return (
    <div className="flex flex-col gap-6">
      <PanelTitle eyebrow="Honorarios · solo las cabezas de DARF" title="Compartidos">
        Lo que varias obras comparten: bolsas compartidas (cada obra aporta su % compartido a la suya) y gastos (se dividen en partes iguales entre las obras que los comparten). Cada cambio aplica desde la fecha que elijas.
      </PanelTitle>
      <ListaPersonas nombres={((gente ?? []) as { nombre: string }[]).map((g) => g.nombre)} />

      <h2 className="titular text-2xl">Gastos compartidos</h2>
      {h.gastos.map((g) => {
        const v = vigente(g.versiones, hoy);
        return (
          <Card key={g.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="titular text-xl">{g.nombre}</h3>
              <p className="text-sm text-texto-2">{v ? `${pesos(v.monto)} al mes entre ${v.obras.map((x) => nombre.get(x) ?? x).join(", ") || "ninguna obra"}${v.obras.length > 1 ? ` (${pesos(Math.round(v.monto / v.obras.length * 100) / 100)} c/u)` : ""}` : "Sin monto"}</p>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-bold text-violeta-claro">Cambiar</summary>
              <ActionForm action={guardarGasto} hidden={{ id: g.id }} submit="Guardar">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-sm font-semibold">Nombre<input className={input} name="nombre" defaultValue={g.nombre} /></label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">Monto al mes ($)<input className={input} type="number" min={0} step="0.01" name="monto" required defaultValue={v?.monto ?? 0} /></label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">Desde<input className={input} type="date" name="vigente_desde" required defaultValue={hoy} /></label>
                </div>
                <ObrasCheck obras={mensuales} marcadas={v?.obras ?? []} />
                <p className="text-xs text-texto-3">Pon el monto en 0 para dejar de cobrarlo desde esa fecha.</p>
              </ActionForm>
            </details>
            {g.versiones.length > 1 && (
              <details>
                <summary className="cursor-pointer text-sm text-texto-3">Historial ({g.versiones.length})</summary>
                <ul className="mt-1 text-sm text-texto-3">{[...g.versiones].sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde)).map((x) => <li key={x.vigente_desde}>Desde el {fecha(x.vigente_desde)}: {pesos(x.monto)} entre {x.obras.map((y) => nombre.get(y) ?? y).join(", ") || "ninguna"}</li>)}</ul>
              </details>
            )}
          </Card>
        );
      })}
      <Card>
        <details>
          <summary className="cursor-pointer font-bold">+ Nuevo gasto compartido</summary>
          <ActionForm action={guardarGasto} submit="Crear">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-semibold">Nombre<input className={input} name="nombre" required placeholder="Renta del estudio" /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Monto al mes ($)<input className={input} type="number" min={0} step="0.01" name="monto" required /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Desde<input className={input} type="date" name="vigente_desde" required defaultValue={hoy} /></label>
            </div>
            <ObrasCheck obras={mensuales} marcadas={[]} />
            <p className="text-xs text-texto-3">Si una obra tiene una renta que no comparte, también puedes ponerla aquí marcando solo esa obra (o como «gastos propios» en su página).</p>
          </ActionForm>
        </details>
      </Card>

      <h2 className="titular text-2xl">Bolsas compartidas</h2>
      {h.compartidas.map((c) => {
        const v = vigente(c.versiones, hoy);
        return (
          <div key={c.id} className="flex flex-col gap-3">
            <Card className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="titular text-xl">{c.nombre}</h3>
                <p className="text-sm text-texto-2">Aportan: {v?.obras.map((x) => nombre.get(x) ?? x).join(", ") || "ninguna obra"}</p>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-bold text-violeta-claro">Cambiar nombre u obras</summary>
                <ActionForm action={guardarCompartida} hidden={{ id: c.id }} submit="Guardar">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm font-semibold">Nombre<input className={input} name="nombre" defaultValue={c.nombre} /></label>
                    <label className="flex flex-col gap-1 text-sm font-semibold">Desde<input className={input} type="date" name="vigente_desde" required defaultValue={hoy} /></label>
                  </div>
                  <ObrasCheck obras={mensuales} marcadas={v?.obras ?? []} />
                  <p className="text-xs text-texto-3">Cada obra aporta el % compartido de su neto (en su página). Una obra debe estar en una sola bolsa compartida.</p>
                </ActionForm>
              </details>
              {c.versiones.length > 1 && (
                <details>
                  <summary className="cursor-pointer text-sm text-texto-3">Historial ({c.versiones.length})</summary>
                  <ul className="mt-1 text-sm text-texto-3">{[...c.versiones].sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde)).map((x) => <li key={x.vigente_desde}>Desde el {fecha(x.vigente_desde)}: {x.obras.map((y) => nombre.get(y) ?? y).join(", ") || "ninguna"}</li>)}</ul>
                </details>
              )}
            </Card>
            <BolsaCard clave={bolsaCompartida(c.id)} nombre={`Quién cobra de ${c.nombre}`} asignaciones={h.asignaciones} hoy={hoy} />
          </div>
        );
      })}
      <Card>
        <details>
          <summary className="cursor-pointer font-bold">+ Nueva bolsa compartida</summary>
          <ActionForm action={guardarCompartida} submit="Crear">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">Nombre<input className={input} name="nombre" required placeholder="Compartida talleres" /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Desde<input className={input} type="date" name="vigente_desde" required defaultValue={hoy} /></label>
            </div>
            <ObrasCheck obras={mensuales} marcadas={[]} />
          </ActionForm>
        </details>
      </Card>
    </div>
  );
}
