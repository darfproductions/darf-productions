import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card } from "@/components/panel/ui";
import { ESTADO_SOLICITUD, score } from "@/lib/audition-rules";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { setApplicationEstado } from "../../actions";

export const metadata: Metadata = { title: "Resultados" };

type Row = { id: string; numero: number; nombre: string; edad: number; estado: string; ronda: number; roles: string[] | null;
  canto: string | null; baile: string | null; actuacion: string | null; actitud: string | null; promedio: string | null; jueces: number; notas: { juez: string; notas: string }[] };
const btn = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

// Tablero consolidado (solo dirección): promedios por criterio, notas y decisión.
export default async function Results({ params, searchParams }: PageProps<"/panel/audiciones/[aid]/resultados">) {
  const { aid } = await params;
  const sp = await searchParams;
  await requireAudition(aid, ["audiciones.gestionar"], "/resultados");
  const ronda = Math.max(1, Number(sp.ronda ?? 1) || 1);
  const rol = typeof sp.rol === "string" ? sp.rol : "";
  const supabase = await createClient();
  const [{ data, error }, roles] = await Promise.all([
    supabase.rpc("audition_board", { aid, p_ronda: ronda }),
    supabase.from("audition_roles").select("nombre").eq("audition_id", aid).order("orden"),
  ]);
  const rows = ((data ?? []) as Row[]).filter((r) => !rol || r.roles?.includes(rol));
  const h = (app: string, r: number) => ({ aid, app, ronda: String(r) });

  return (
    <>
      <div className="flex flex-wrap gap-2 text-xs">
        {[1, 2, 3].map((r) => (
          <Link key={r} href={`?ronda=${r}${rol ? `&rol=${encodeURIComponent(rol)}` : ""}`} className={`rounded-full border px-3 py-1.5 font-semibold ${r === ronda ? "border-texto" : "border-white/20"}`}>{r === 1 ? "Audición" : `Callback ${r - 1}`}</Link>
        ))}
        <span className="mx-1 text-texto-3">·</span>
        <Link href={`?ronda=${ronda}`} className={`rounded-full border px-3 py-1.5 font-semibold ${!rol ? "border-texto" : "border-white/20"}`}>Todos los personajes</Link>
        {(roles.data ?? []).map((r) => (
          <Link key={r.nombre} href={`?ronda=${ronda}&rol=${encodeURIComponent(r.nombre as string)}`} className={`rounded-full border px-3 py-1.5 font-semibold ${rol === r.nombre ? "border-texto" : "border-white/20"}`}>{r.nombre}</Link>
        ))}
      </div>
      {error && <Card>{error.message}</Card>}
      <Card className="overflow-x-auto p-0 md:p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.12em] text-texto-3">
            <tr>{["Nº", "Nombre", "Canto", "Baile", "Actuación", "Actitud", "Promedio", "Jueces", "Decisión"].map((t) => <th key={t} className="px-3 py-3 font-bold">{t}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-3 font-black">{r.numero}</td>
                <td className="px-3 py-3">
                  <p className="font-bold"><Link href={`/panel/audiciones/${aid}/aspirante/${r.id}`} className="hover:underline">{r.nombre}</Link> <span className="font-normal text-texto-3">· {r.edad}</span></p>
                  {r.roles && <p className="text-xs text-texto-3">{r.roles.join(", ")}</p>}
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${ESTADO_SOLICITUD[r.estado]?.cls}`}>{ESTADO_SOLICITUD[r.estado]?.label}</span>
                  {r.notas.length > 0 && (
                    <details className="mt-1 text-xs"><summary className="cursor-pointer text-violeta-claro">Notas ({r.notas.length})</summary>
                      <ul className="mt-1 flex flex-col gap-1">{r.notas.map((n, i) => <li key={i}><b>{n.juez}:</b> {n.notas}</li>)}</ul>
                    </details>
                  )}
                </td>
                {[r.canto, r.baile, r.actuacion, r.actitud].map((v, i) => <td key={i} className="px-3 py-3">{score(v)}</td>)}
                <td className="px-3 py-3 text-lg font-black">{score(r.promedio)}</td>
                <td className="px-3 py-3">{r.jueces}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-col gap-1.5">
                    <ActionForm inline action={setApplicationEstado} hidden={{ ...h(r.id, r.ronda), estado: "callback" }} confirm={`¿Llamar a ${r.nombre} a callback?`} submit="Callback" submitClass={btn} />
                    <ActionForm inline action={setApplicationEstado} hidden={{ ...h(r.id, r.ronda), estado: "seleccionado" }} confirm={`¿Seleccionar a ${r.nombre}?`} submit="Seleccionar" submitClass="rounded-full bg-[#22c55e] px-3 py-1.5 text-xs font-bold text-[#052e16]" />
                    <ActionForm inline action={setApplicationEstado} hidden={{ ...h(r.id, r.ronda), estado: "no_seleccionado" }} confirm={`¿Marcar a ${r.nombre} como no seleccionado?`} submit="No seleccionado" submitClass={btn} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-5 py-4 text-texto-2">Sin personas en esta ronda.</p>}
      </Card>
      <p className="text-xs text-texto-3">Ordenado por promedio. Las notas de cada juez solo las ve la dirección. La integración con el elenco (ofertas de papel) llega en la etapa 3E.</p>
    </>
  );
}
