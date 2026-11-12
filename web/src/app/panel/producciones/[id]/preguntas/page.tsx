import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { PREGUNTAS_SUGERIDAS, avanceSugeridas, filasEditor, type FaqObra } from "@/lib/faq-rules";
import { canAny } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { guardarPropia, guardarSugeridas, quitarPregunta } from "./actions";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Preguntas frecuentes" };

const etiqueta = "flex flex-col gap-1 text-sm font-semibold";

// Preguntas frecuentes de la obra (0141): 8 sugeridas donde solo se llena la respuesta, y las propias.
// Las ve el elenco en su portal (Mi obra) y DARFY se las contesta a quien ya entró.
export default async function Preguntas({ params }: PageProps<"/panel/producciones/[id]/preguntas">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/preguntas`);
  if (!canAny(access, id, ["obra.editar", "comunicados.enviar"])) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const { data } = await supabase.from("production_faq").select("id, clave, pregunta, respuesta, orden, activa").eq("production_id", id).order("orden");
  const guardadas = (data ?? []) as FaqObra[];
  const filas = filasEditor(guardadas);
  const sugeridas = filas.filter((f) => f.clave && PREGUNTAS_SUGERIDAS.some((s) => s.clave === f.clave));
  const propias = filas.filter((f) => !sugeridas.includes(f));
  const avance = avanceSugeridas(guardadas);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titular text-xl">Preguntas que casi siempre hace el elenco</h2>
          <span className="text-sm text-texto-2">{avance.listas} de {avance.total} respondidas</span>
        </div>
        <p className="text-sm text-texto-2">Solo llena las respuestas. Las que dejes vacías no se muestran. El elenco las ve en su portal, en «Mi obra»; DARFY se las contesta cuando ya entraron a su cuenta. <Link href={`/cuenta/produccion/${id}#obra`} className="font-bold text-violeta-claro">Ver cómo lo ve el elenco <Icono nombre="flecha-der" /></Link></p>
        <ActionForm action={guardarSugeridas} hidden={{ pid: id }} submit="Guardar respuestas">
          <ol className="flex flex-col gap-4">
            {sugeridas.map((f) => {
              const s = PREGUNTAS_SUGERIDAS.find((x) => x.clave === f.clave)!;
              return (
                <li key={f.clave} className="flex flex-col gap-1.5 rounded-xl bg-sala p-4">
                  <label className={etiqueta}>
                    <span className="text-base">{f.pregunta}{f.respuesta ? <span className="ml-2 text-xs font-bold text-exito"><Icono nombre="check" /> Lista</span> : null}</span>
                    <textarea name={`r_${f.clave}`} rows={2} maxLength={1500} defaultValue={f.respuesta} placeholder={s.pista} className={`${input} w-full`} />
                  </label>
                </li>
              );
            })}
          </ol>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Preguntas propias de esta obra</h2>
        {propias.length === 0 && <p className="text-sm text-texto-2">Ninguna todavía. Agrega las que sean especiales de esta obra (estacionamiento, vestuario, viajes…).</p>}
        <ul className="flex flex-col gap-2">
          {propias.map((f) => (
            <li key={f.id} className="rounded-xl bg-sala p-4">
              <details>
                <summary className="cursor-pointer text-sm"><b>{f.pregunta}</b>{!f.activa && <span className="ml-2 text-xs text-texto-3">(oculta)</span>}<span className="block text-texto-2">{f.respuesta}</span></summary>
                <div className="mt-3 flex flex-col gap-3">
                  <ActionForm action={guardarPropia} hidden={{ pid: id, id: f.id ?? "" }} submit="Guardar">
                    <div className="flex flex-col gap-2">
                      <label className={etiqueta}>Pregunta<input name="pregunta" required maxLength={200} defaultValue={f.pregunta} className={input} /></label>
                      <label className={etiqueta}>Respuesta<textarea name="respuesta" required rows={2} maxLength={1500} defaultValue={f.respuesta} className={input} /></label>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex items-center gap-2"><input type="hidden" name="activa" value="off" /><input type="checkbox" name="activa" value="on" defaultChecked={f.activa} /> Se muestra</label>
                        <label className="flex items-center gap-2">Orden <input name="orden" type="number" defaultValue={f.orden} className={`${input} w-20 py-1`} /></label>
                      </div>
                    </div>
                  </ActionForm>
                  <ActionForm inline action={quitarPregunta} hidden={{ pid: id, id: f.id ?? "" }} confirm="¿Quitar esta pregunta?" submit="Quitar" submitClass="rounded-full border border-[#ff8fa3]/50 px-3 py-1.5 text-xs font-bold text-[#ff8fa3]" />
                </div>
              </details>
            </li>
          ))}
        </ul>
        <details className="rounded-xl border border-dashed border-white/20 p-4">
          <summary className="cursor-pointer text-sm font-bold">Agregar una pregunta</summary>
          <div className="mt-3">
            <ActionForm action={guardarPropia} hidden={{ pid: id }} submit="Agregar">
              <div className="flex flex-col gap-2">
                <label className={etiqueta}>Pregunta<input name="pregunta" required maxLength={200} className={input} placeholder="Ej. ¿Hay estacionamiento en el foro?" /></label>
                <label className={etiqueta}>Respuesta<textarea name="respuesta" required rows={2} maxLength={1500} className={input} /></label>
              </div>
            </ActionForm>
          </div>
        </details>
      </Card>
    </div>
  );
}
