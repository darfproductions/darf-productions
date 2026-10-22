import type { Metadata } from "next";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { getShowcases } from "@/lib/showcases";
import { RowsEditor } from "../../producciones/[id]/pagina/RowsEditor";
import { guardarBloques, guardarPagina } from "../actions";

export const metadata: Metadata = { title: "Showcases · Página" };

// Textos de /showcases, el WhatsApp que recibe las solicitudes y si la página está publicada.
export default async function PaginaShowcase() {
  const { ajustes: a } = await getShowcases();
  if (!a) return <Card>Falta correr el script de Showcases en Supabase.</Card>;
  const bloques = (campo: "publicos" | "especial" | "condiciones", titulo: string, nota: string) => (
    <Card>
      <h2 className="titular text-xl">{titulo}</h2>
      <p className="mb-3 text-sm text-texto-2">{nota}</p>
      <RowsEditor pid="showcases" action={guardarBloques} hidden={{ campo }} initial={a[campo].map((b) => [b.titulo, b.texto])}
        fields={[{ name: "titulo", placeholder: "Título" }, { name: "texto", placeholder: "Texto" }]} submit="Guardar" addLabel="+ Agregar" />
    </Card>
  );
  return (
    <>
      <Card>
        <ActionForm action={guardarPagina} submit="Guardar página">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="publicado" defaultChecked={a.publicado} /> Página publicada (sin la palomita solo la ve el equipo y no sale el botón en Eventos)</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Título<input className={input} name="titulo" defaultValue={a.titulo} required /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Lema<input className={input} name="lema" defaultValue={a.lema ?? ""} placeholder="Música · Danza · Acrobacia · Espectáculo" /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Introducción<textarea className={`${input} min-h-32 leading-7`} name="intro" defaultValue={a.intro ?? ""} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Importante<textarea className={`${input} min-h-20`} name="importante" defaultValue={a.importante ?? ""} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Antes de reservar (uno por renglón)<textarea className={`${input} min-h-40 leading-7`} name="antes_reservar" defaultValue={a.antes_reservar.join("\n")} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Anticipación y montaje (uno por renglón)<textarea className={`${input} min-h-40 leading-7`} name="anticipacion" defaultValue={a.anticipacion.join("\n")} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">WhatsApp que recibe las solicitudes
              <input className={input} name="whatsapp" defaultValue={a.whatsapp ?? ""} placeholder="52 446 522 0560" />
              <span className="text-xs font-normal text-texto-3">52 + 10 dígitos. Puede ser distinto al de pagos de boletos.</span>
            </label>
          </div>
        </ActionForm>
      </Card>
      {bloques("publicos", "Para quién", "Las tarjetas de arriba (Escuelas, Empresas, Celebraciones).")}
      {bloques("especial", "¿Qué hace especial a DARF?", "Elenco en vivo, identidad visual…")}
      {bloques("condiciones", "Condiciones clave", "Producción actual, cambios y extras, participación infantil, confirmación…")}
    </>
  );
}
