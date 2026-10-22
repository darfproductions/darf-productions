import type { Metadata } from "next";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { precioTexto, type ShowcasePlan } from "@/lib/showcase-rules";
import { getShowcases } from "@/lib/showcases";
import { borrarPlan, guardarPlan, moverPlan } from "./actions";

export const metadata: Metadata = { title: "Showcases · Planes" };

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

function CamposPlan({ p }: { p?: ShowcasePlan }) {
  const campo = (label: string, name: keyof ShowcasePlan, extra?: { placeholder?: string; wide?: boolean; type?: string }) => (
    <label className={`flex flex-col gap-1.5 text-sm font-semibold ${extra?.wide ? "sm:col-span-2" : ""}`}>{label}
      <input className={input} name={name} type={extra?.type} step={extra?.type === "number" ? "1" : undefined} min={extra?.type === "number" ? 0 : undefined}
        defaultValue={p?.[name] == null ? "" : String(p[name])} placeholder={extra?.placeholder} />
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {campo("Nombre del plan *", "nombre", { placeholder: "Probadita" })}
      {campo("Precio (MXN; vacío = a cotizar)", "precio", { type: "number", placeholder: "3500" })}
      <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Descripción corta
        <textarea className={`${input} min-h-20`} name="descripcion" defaultValue={p?.descripcion ?? ""} />
      </label>
      {campo("Duración y elenco", "resumen", { placeholder: "35 minutos · 5–6 artistas" })}
      {campo("Línea bajo el precio", "detalle", { placeholder: "2-4 voces + 1-2 bailarines…" })}
      <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Incluye (uno por renglón)
        <textarea className={`${input} min-h-36 leading-7`} name="incluye" defaultValue={(p?.incluye ?? []).join("\n")} />
      </label>
      {campo("Ideal para", "ideal_para", { wide: true, placeholder: "Actos escolares, celebraciones pequeñas…" })}
      {campo("Nota técnica (letra chica)", "nota", { wide: true, placeholder: "Audio e iluminación del recinto…" })}
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="activo" defaultChecked={p?.activo ?? true} /> Visible en la página</label>
    </div>
  );
}

// Planes de showcase: nombre, qué incluye, precio, orden y si se ven. Las fotos y videos de cada plan van en Fotos y videos.
export default async function PlanesShowcase() {
  const { planes } = await getShowcases();
  return (
    <>
      {planes.map((p, i) => (
        <Card key={p.id}>
          <details>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span><b>{p.nombre}</b> · {precioTexto(p.precio)}{p.resumen ? ` · ${p.resumen}` : ""}{!p.activo && <span className="ml-2 text-xs text-texto-3">oculto</span>}</span>
              <span className="flex gap-1">
                <ActionForm inline action={moverPlan} hidden={{ id: p.id, dir: "arriba" }} submit="Subir" submitClass={ghost} />
                <ActionForm inline action={moverPlan} hidden={{ id: p.id, dir: "abajo" }} submit="Bajar" submitClass={ghost} />
              </span>
            </summary>
            <div className="mt-4 flex flex-col gap-3">
              <ActionForm action={guardarPlan} hidden={{ id: p.id }} submit="Guardar plan"><CamposPlan p={p} /></ActionForm>
              <ActionForm inline action={borrarPlan} hidden={{ id: p.id }} confirm={`¿Borrar el plan ${p.nombre}? Si solo quieres esconderlo, quita "Visible en la página".`} submit="Borrar plan" submitClass={ghost} />
            </div>
          </details>
          {i === 0 && planes.length > 1 && <p className="mt-2 text-xs text-texto-3">Usa Subir y Bajar para el orden en la página (Paquete 01, 02…).</p>}
        </Card>
      ))}
      <Card>
        <h2 className="titular mb-3 text-xl">Nuevo plan</h2>
        <ActionForm action={guardarPlan} submit="Crear plan"><CamposPlan /></ActionForm>
      </Card>
    </>
  );
}
