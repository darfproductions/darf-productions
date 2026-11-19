import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Icono } from "@/components/Icono";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { isoMx } from "@/lib/dates";
import { getHonorarios, reglasEn, vigente } from "@/lib/honorarios";
import { bolsaCreativa } from "@/lib/honorarios-rules";
import { requireCabeza } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { BolsaCard, ListaPersonas } from "../../BolsaCard";
import { guardarObra, guardarReglas, usarSabados } from "../../actions";

export const metadata: Metadata = { title: "Honorarios de la obra" };

const pesos = (n: number | null) => (n == null ? "—" : `$${Number(n).toLocaleString("es-MX")}`);
const fecha = (d: string) => d.split("-").reverse().join("/");
const chico = "rounded-full border border-white/30 px-3 py-1 text-xs font-bold";

// Honorarios de una obra (0151): tipo, reglas con vigencia (qué se hace con su dinero), su bolsa creativa y con qué
// obras comparte bolsa y gastos. Solo las cabezas.
export default async function HonorariosObra({ params }: PageProps<"/panel/honorarios/obras/[id]">) {
  const { id } = await params;
  await requireCabeza(`/panel/honorarios/obras/${id}`);
  const h = await getHonorarios();
  const o = h.obras.find((x) => x.production_id === id);
  if (!o) notFound();
  const hoy = isoMx();
  const r = reglasEn(h.reglas, h.compartidas, id, hoy);
  const f = r?.fila ?? null;
  const historial = h.reglas.filter((x) => x.production_id === id).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde));
  const comps = h.compartidas.filter((c) => vigente(c.versiones, hoy)?.obras.includes(id));
  const gastos = h.gastos.map((g) => ({ g, v: vigente(g.versiones, hoy) })).filter(({ v }) => v?.obras.includes(id));
  const nombre = new Map(h.obras.map((x) => [x.production_id, x.nombre]));
  const supabase = await createClient();
  const { data: gente } = await supabase.from("people").select("nombre").order("nombre").limit(3000);
  const val = (k: keyof NonNullable<typeof f>, def: number) => String(f ? f[k] : def);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/honorarios" className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Obras y reglas</Link>
      <PanelTitle eyebrow="Honorarios" title={o.nombre}>
        {o.mensual ? `Con mensualidad (${pesos(o.mensualidad)}; la inscripción no entra al reparto): reparte cada mes y al cierre de temporada.` : "Solo reparte al cierre de temporada."}
      </PanelTitle>
      <ListaPersonas nombres={((gente ?? []) as { nombre: string }[]).map((g) => g.nombre)} />

      {o.mensual && !o.venceSabado && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
          <span>Esta obra cobra con día fijo, no el 1.er sábado con corte el 2.º.</span>
          <ActionForm inline action={usarSabados} hidden={{ production_id: id }} submit="Usar sábados" submitClass={chico} />
        </div>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Tipo</h2>
        <ActionForm action={guardarObra} hidden={{ production_id: id }} submit="Guardar">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">Tipo
              <select className={input} name="mensual" defaultValue={o.mensual ? "1" : "0"}>
                <option value="1">Con mensualidad (cada mes y al cierre)</option>
                <option value="0">Solo al cierre de temporada</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Estado
              <select className={input} name="activa" defaultValue={o.activa ? "1" : "0"}>
                <option value="1">Activa</option>
                <option value="0">Cerrada (ya no reparte cada mes)</option>
              </select>
            </label>
          </div>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titular text-xl">Qué se hace con su dinero</h2>
          <p className="text-sm text-texto-3">{f ? `Vigente desde el ${fecha(f.vigente_desde)}` : "Sin reglas todavía"}</p>
        </div>
        <ActionForm action={guardarReglas} hidden={{ production_id: id }} submit="Guardar como nueva versión">
          {o.mensual && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Cada mes (de lo cobrado en mensualidades)</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">Fondo de reserva (%)<input className={input} type="number" min={0} max={100} step="0.01" name="reserva_pct" required defaultValue={val("reserva_pct", 10)} /></label>
                <label className="flex flex-col gap-1 text-sm">Personal de emergencia, tope (%)<input className={input} type="number" min={0} max={100} step="0.01" name="emergencia_pct" required defaultValue={val("emergencia_pct", 5)} /></label>
                <label className="flex flex-col gap-1 text-sm">Gastos propios al mes ($)<input className={input} type="number" min={0} step="0.01" name="gastos_propios" required defaultValue={val("gastos_propios", 0)} /></label>
                <label className="flex flex-col gap-1 text-sm">Del neto, a su bolsa creativa (%)<input className={input} type="number" min={0} max={100} step="0.01" name="creativo_pct" required defaultValue={val("creativo_pct", 60)} /></label>
                <label className="flex flex-col gap-1 text-sm">Del neto, a su bolsa compartida (%)<input className={input} type="number" min={0} max={100} step="0.01" name="compartida_pct" required defaultValue={val("compartida_pct", 40)} /></label>
                <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="en_fondo" defaultChecked={f ? f.en_fondo : true} /> Entra al fondo creativo común</label>
              </div>
              <p className="text-xs text-texto-3">Neto = cobrado − reserva − emergencia usada − su parte de los gastos compartidos − sus gastos propios. Lo que no vaya a creativa ni a compartida se queda en la empresa.</p>
            </fieldset>
          )}
          {!o.mensual && (
            <>
              {(["reserva_pct", "emergencia_pct", "gastos_propios", "creativo_pct", "compartida_pct"] as const).map((k) => <input key={k} type="hidden" name={k} value={val(k, k === "gastos_propios" || k === "compartida_pct" ? 0 : k === "creativo_pct" ? 100 : 0)} />)}
            </>
          )}
          <fieldset className="mt-2 flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Al cierre de temporada (de la ganancia; debe sumar 100 %)</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-sm">Empresa (%)<input className={input} type="number" min={0} max={100} step="0.01" name="cierre_empresa_pct" required defaultValue={val("cierre_empresa_pct", 40)} /></label>
              <label className="flex flex-col gap-1 text-sm">{o.mensual ? "Creativos" : "Equipo de la obra"} (%)<input className={input} type="number" min={0} max={100} step="0.01" name="cierre_creativos_pct" required defaultValue={val("cierre_creativos_pct", 25)} /></label>
              <label className="flex flex-col gap-1 text-sm">Compartida (%)<input className={input} type="number" min={0} max={100} step="0.01" name="cierre_compartida_pct" required defaultValue={val("cierre_compartida_pct", 20)} /></label>
              <label className="flex flex-col gap-1 text-sm">Casa DARF (%)<input className={input} type="number" min={0} max={100} step="0.01" name="cierre_casa_pct" required defaultValue={val("cierre_casa_pct", 15)} /></label>
            </div>
          </fieldset>
          <label className="mt-2 flex max-w-xs flex-col gap-1 text-sm font-semibold">Aplica desde
            <input className={input} type="date" name="vigente_desde" required defaultValue={hoy} />
          </label>
        </ActionForm>
        {historial.length > 1 && (
          <details>
            <summary className="cursor-pointer text-sm font-bold">Historial ({historial.length})</summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-texto-2">
              {historial.map((x) => <li key={x.vigente_desde}>Desde el <b>{fecha(x.vigente_desde)}</b>: reserva {x.reserva_pct} %, emergencia {x.emergencia_pct} %, creativo {x.creativo_pct} %, compartido {x.compartida_pct} %, gastos propios {pesos(x.gastos_propios)}{x.en_fondo ? ", fondo común" : ""}; cierre {x.cierre_empresa_pct}/{x.cierre_creativos_pct}/{x.cierre_compartida_pct}/{x.cierre_casa_pct}</li>)}
            </ul>
          </details>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titular text-xl">Con quién comparte</h2>
          <Link href="/panel/honorarios/compartidos" className="text-sm font-bold text-violeta-claro">Cambiar en Compartidos <Icono nombre="flecha-der" /></Link>
        </div>
        <p className="text-sm">Bolsa compartida: {comps.length ? comps.map((c) => <b key={c.id}>{c.nombre} </b>) : <span className="text-texto-3">ninguna</span>}
          {comps.length > 1 && <span className="text-[#ff8fa3]"> (está en más de una: el mes usa la primera; deja solo una)</span>}</p>
        <p className="text-sm">Gastos compartidos: {gastos.length ? gastos.map(({ g, v }) => `${g.nombre} (${pesos(v!.monto)} entre ${v!.obras.map((x) => nombre.get(x) ?? x).join(", ")})`).join(" · ") : <span className="text-texto-3">ninguno</span>}</p>
      </Card>

      <BolsaCard clave={bolsaCreativa(id)} nombre={o.mensual ? "Su bolsa creativa" : "Su equipo"} ayuda={o.mensual ? "Cobra el % creativo del neto de cada mes y la parte de creativos del cierre." : "Cobra su parte al cierre de temporada."} asignaciones={h.asignaciones} hoy={hoy} />
    </div>
  );
}
