import type { Metadata } from "next";
import { Card, PanelTitle } from "@/components/panel/ui";
import { isoMx } from "@/lib/dates";
import { bolsasDe, configEn, getHonorarios, reglasEn, vigentesEn } from "@/lib/honorarios";
import { bolsaCompartida, bolsaCreativa } from "@/lib/honorarios-rules";
import { requireCabeza } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { BolsaCard, ListaPersonas } from "../BolsaCard";

export const metadata: Metadata = { title: "Bolsas y porcentajes" };

// Honorarios · Bolsas (0149, por obra desde 0151): todas las bolsas juntas, Casa DARF y la tabla para validar contra el
// documento (% del neto de cada obra que le toca a cada quien).
export default async function Bolsas() {
  await requireCabeza("/panel/honorarios/bolsas");
  const h = await getHonorarios();
  const hoy = isoMx();
  const vig = vigentesEn(h.asignaciones, hoy);
  const bolsas = bolsasDe(h, hoy);
  const cfg = configEn(h.versiones, hoy);
  const supabase = await createClient();
  const { data: gente } = await supabase.from("people").select("nombre").order("nombre").limit(3000);
  const cabezas = h.casa.filter((c) => c.cabeza), otros = h.casa.filter((c) => !c.cabeza);
  const mensuales = h.obras.filter((o) => o.mensual && o.activa).map((o) => ({ o, r: reglasEn(h.reglas, h.compartidas, o.production_id, hoy) })).filter((x) => x.r);
  const enBolsa = (pid: string, bolsa: string) => vig.find((a) => a.person_id === pid && a.bolsa === bolsa)?.pct ?? 0;
  const personasNeto = [...new Set(vig.filter((a) => mensuales.some(({ o, r }) => a.bolsa === bolsaCreativa(o.production_id) || (r!.compartida && a.bolsa === bolsaCompartida(r!.compartida)))).map((a) => a.person_id))];
  const nombreDe = (pid: string) => vig.find((a) => a.person_id === pid)?.nombre ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <PanelTitle eyebrow="Honorarios · solo las cabezas de DARF" title="Bolsas y porcentajes">
        Todas las bolsas juntas. Cada una debe sumar exactamente 100 %; si no, el mes no se puede calcular. Una persona puede estar en varias bolsas y cobra de cada una.
      </PanelTitle>
      <ListaPersonas nombres={((gente ?? []) as { nombre: string }[]).map((g) => g.nombre)} />

      {mensuales.length > 0 && personasNeto.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Para validar: % del neto de cada obra</h2>
          <p className="text-sm text-texto-2">Lo que le toca a cada quien del neto mensual de cada obra cuando no se aplica el fondo común (con el % creativo y compartido de cada obra). Debe coincidir con la tabla del documento.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-[0.1em] text-texto-3"><th className="py-2">Persona</th>{mensuales.map(({ o }) => <th key={o.production_id} className="text-right">{o.nombre}</th>)}</tr></thead>
              <tbody>
                {personasNeto.map((p) => (
                  <tr key={p} className="border-t border-white/10">
                    <td className="py-1.5">{nombreDe(p)}</td>
                    {mensuales.map(({ o, r }) => {
                      const v = (r!.creativoPct * enBolsa(p, bolsaCreativa(o.production_id)) + (r!.compartida ? r!.compartidaPct * enBolsa(p, bolsaCompartida(r!.compartida)) : 0)) / 100;
                      return <td key={o.production_id} className="py-1.5 text-right">{v ? `${v.toFixed(2)} %` : "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {bolsas.map((b) => <BolsaCard key={b.clave} clave={b.clave} nombre={b.nombre} ayuda={b.ayuda} asignaciones={h.asignaciones} hoy={hoy} />)}

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Casa DARF (al cierre de temporada)</h2>
        <p className="text-sm text-texto-2">
          Sale de quién está en Casa DARF ese día: {cfg ? `${cfg.casa_cabezas_pct} %` : "la parte de las cabezas"} en partes iguales entre las cabezas y el resto en partes iguales entre los demás integrantes. Quién es cabeza se marca en Ajustes, Casa DARF.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-sm font-bold">Cabezas ({cabezas.length})</p><ul className="text-sm text-texto-2">{cabezas.map((c) => <li key={c.user_id}>{c.nombre}{!c.person_id && <span className="text-aviso"> · sin ficha de persona</span>}</li>)}</ul></div>
          <div><p className="text-sm font-bold">Demás integrantes ({otros.length})</p><ul className="text-sm text-texto-2">{otros.map((c) => <li key={c.user_id}>{c.nombre}{!c.person_id && <span className="text-aviso"> · sin ficha de persona</span>}</li>)}</ul></div>
        </div>
      </Card>
    </div>
  );
}
