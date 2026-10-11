/* eslint-disable @next/next/no-img-element -- fotos privadas con enlace temporal */
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/panel/ui";
import { requireAudition, signPhotos } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { ScoreForm } from "./ScoreForm";

export const metadata: Metadata = { title: "Evaluación" };

type Row = { id: string; numero: number; nombre: string; edad: number; foto_path: string | null; roles: string[] | null; estado: string;
  canto: number | null; baile: number | null; actuacion: number | null; actitud: number | null; notas: string | null };

// Evaluación del juez: solo quienes ya llegaron, en orden de número. Sin datos de contacto.
export default async function Judging({ params, searchParams }: PageProps<"/panel/audiciones/[aid]/evaluacion">) {
  const { aid } = await params;
  const sp = await searchParams;
  await requireAudition(aid, ["audiciones.evaluar"], "/evaluacion");
  const ronda = Math.max(1, Number(sp.ronda ?? 1) || 1);
  const supabase = await createClient();
  const [{ data, error }, vids] = await Promise.all([
    supabase.rpc("audition_judge_list", { aid, p_ronda: ronda }),
    supabase.from("audition_videos").select("id, titulo, url, application_id").eq("audition_id", aid).not("application_id", "is", null),
  ]);
  const rows = (data ?? []) as Row[];
  const videosDe = (app: string) => (vids.data ?? []).filter((v) => v.application_id === app);
  const fotos = await signPhotos(rows.map((r) => r.foto_path));
  const hechas = rows.filter((r) => r.canto || r.baile || r.actuacion || r.actitud).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[1, 2, 3].map((r) => (
          <Link key={r} href={`?ronda=${r}`} className={`rounded-full border px-3 py-1.5 font-semibold ${r === ronda ? "border-texto" : "border-white/20"}`}>{r === 1 ? "Audición" : `Callback ${r - 1}`}</Link>
        ))}
        <span className="text-texto-3">· calificaste {hechas} de {rows.length}</span>
      </div>
      {error && <Card>{error.message}</Card>}
      {rows.length === 0 && <Card>Todavía no hay personas registradas en esta ronda.</Card>}
      <ul className="grid gap-4 xl:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Card className="flex flex-col gap-4 sm:flex-row">
              <div className="flex shrink-0 gap-3 sm:w-32 sm:flex-col">
                <div className="h-32 w-24 overflow-hidden rounded-lg bg-telon-2 sm:w-32">
                  {r.foto_path && fotos.get(r.foto_path) && <img src={fotos.get(r.foto_path)} alt="" className="h-full w-full object-cover" />}
                </div>
                <div>
                  <p className="text-3xl font-black">Nº {r.numero}</p>
                  <p className="font-bold">{r.nombre}</p>
                  <p className="text-sm text-texto-3">{r.edad} años</p>
                  {r.roles && <p className="text-xs text-texto-2">{r.roles.join(", ")}</p>}
                  {videosDe(r.id).map((v) => <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="block text-xs text-violeta-claro underline">{v.titulo} ↗</a>)}
                </div>
              </div>
              <div className="flex-1"><ScoreForm aid={aid} app={r.id} ronda={ronda} initial={{ canto: r.canto, baile: r.baile, actuacion: r.actuacion, actitud: r.actitud, notas: r.notas }} /></div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
