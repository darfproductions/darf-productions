import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, PanelTitle, buttonGhost, input } from "@/components/panel/ui";
import { casa } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { deleteFaq, deleteUnanswered, saveFaq } from "./actions";

export const metadata: Metadata = { title: "DARFY" };

type Faq = { id: string; pregunta: string; respuesta: string; palabras: string[]; categoria: string; liga: string | null; orden: number; activa: boolean };
type Pendiente = { id: number; pregunta: string; created_at: string };

const CATEGORIAS = [
  ["boletos", "Boletos"], ["funciones", "Funciones"], ["audiciones", "Audiciones"],
  ["pagos", "Pagos"], ["lugar", "Lugar"], ["general", "General"],
] as const;
const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));
const chip = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

function FaqFields({ f, pregunta }: { f?: Faq; pregunta?: string }) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-semibold">Pregunta
        <input name="pregunta" required maxLength={200} defaultValue={f?.pregunta ?? pregunta ?? ""} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">Respuesta de DARFY
        <textarea name="respuesta" required maxLength={1500} rows={3} defaultValue={f?.respuesta ?? ""} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">Palabras clave <span className="font-normal text-texto-3">(separadas por comas; sin acentos está bien)</span>
        <input name="palabras" defaultValue={f?.palabras.join(", ") ?? ""} className={input} />
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_90px]">
        <label className="flex flex-col gap-1 text-sm font-semibold">Tema
          <select name="categoria" defaultValue={f?.categoria ?? "general"} className={input}>
            {CATEGORIAS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Liga <span className="font-normal text-texto-3">(opcional, ej. /cartelera)</span>
          <input name="liga" defaultValue={f?.liga ?? ""} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Orden
          <input name="orden" type="number" defaultValue={f?.orden ?? 100} className={input} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activa" defaultChecked={f?.activa ?? true} /> Activa (DARFY la usa)</label>
    </>
  );
}

// Lo que sabe DARFY: preguntas frecuentes y lo que la gente preguntó y DARFY no supo contestar.
// Las obras, funciones, precios y audiciones las toma solo de la página (no hay que escribirlas).
export default async function DarfyAjustes({ searchParams }: PageProps<"/panel/ajustes/darfy">) {
  const access = await requirePanel("/panel/ajustes/darfy");
  if (!["staff", "admin"].includes(access.session.profile?.rol ?? "") && !casa(access, "casa.contacto")) redirect("/panel");
  const sp = await searchParams;
  const supabase = await createClient();
  const [faqRes, pendRes] = await Promise.all([
    supabase.from("darfy_faq").select("id, pregunta, respuesta, palabras, categoria, liga, orden, activa").order("orden"),
    supabase.from("darfy_unanswered").select("id, pregunta, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const faq = (faqRes.data ?? []) as Faq[];
  const pendientes = (pendRes.data ?? []) as Pendiente[];
  const convertir = pendientes.find((p) => String(p.id) === sp.convertir);

  return (
    <>
      <PanelTitle eyebrow="Sitio y público" title="DARFY">
        Las preguntas frecuentes que contesta el asistente de la página. Las obras, funciones, precios y audiciones las toma solo de lo publicado.
        Si DARFY no sabe algo, ofrece WhatsApp o dejar datos (llegan a Contacto).
      </PanelTitle>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Preguntas sin respuesta {pendientes.length > 0 && <span className="text-texto-3">({pendientes.length})</span>}</h2>
        {pendientes.length === 0 && <p className="text-sm text-texto-3">Por ahora DARFY ha sabido contestar todo.</p>}
        <ul className="flex flex-col divide-y divide-white/10">
          {pendientes.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="flex-1">{p.pregunta} <span className="text-texto-3">· {fecha(p.created_at)}</span></span>
              <Link href={`/panel/ajustes/darfy?convertir=${p.id}#nueva`} className={chip}>Convertir en pregunta frecuente</Link>
              <ActionForm inline action={deleteUnanswered} hidden={{ id: String(p.id) }} submit="Descartar" submitClass={chip} />
            </li>
          ))}
        </ul>
        {pendientes.length > 1 && <ActionForm inline action={deleteUnanswered} hidden={{ id: "todas" }} confirm="¿Descartar todas las preguntas sin respuesta?" submit="Descartar todas" submitClass={chip} />}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 id="nueva" className="text-lg font-bold">{convertir ? "Nueva pregunta frecuente (desde una pregunta sin respuesta)" : "Nueva pregunta frecuente"}</h2>
        <ActionForm key={convertir?.id ?? "nueva"} action={saveFaq} hidden={convertir ? { de_pendiente: String(convertir.id) } : undefined} submit="Agregar">
          <FaqFields pregunta={convertir?.pregunta} />
        </ActionForm>
      </Card>

      <h2 className="mt-2 text-lg font-bold">Preguntas frecuentes ({faq.length})</h2>
      {faq.map((f) => (
        <Card key={f.id} className={`flex flex-col gap-3 ${f.activa ? "" : "opacity-70"}`}>
          <details>
            <summary className="cursor-pointer font-bold">{f.pregunta} {!f.activa && <span className="font-normal text-texto-3">· inactiva</span>}</summary>
            <div className="mt-3 flex flex-col gap-3">
              <ActionForm action={saveFaq} hidden={{ id: f.id }} submit="Guardar">
                <FaqFields f={f} />
              </ActionForm>
              <ActionForm inline action={deleteFaq} hidden={{ id: f.id }} confirm="¿Borrar esta pregunta frecuente?" submit="Borrar" submitClass={buttonGhost} />
            </div>
          </details>
          {!f.activa ? null : <p className="line-clamp-2 text-sm text-texto-2">{f.respuesta}</p>}
        </Card>
      ))}
    </>
  );
}
