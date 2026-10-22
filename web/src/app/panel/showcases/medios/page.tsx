/* eslint-disable @next/next/no-img-element -- fotos desde Storage */
import type { Metadata } from "next";
import { ActionForm } from "@/components/panel/ActionForm";
import { Icono } from "@/components/Icono";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { Card, input } from "@/components/panel/ui";
import { CATEGORIAS, tipoVideo, type ShowcaseMedia } from "@/lib/showcase-rules";
import { getShowcases, showcaseFotoUrl } from "@/lib/showcases";
import { agregarFoto, agregarVideo, borrarMedia } from "../actions";

export const metadata: Metadata = { title: "Showcases · Fotos y videos" };

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

function Lista({ items }: { items: ShowcaseMedia[] }) {
  if (!items.length) return <p className="text-sm text-texto-3">Todavía no hay fotos ni videos aquí.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((m) => (
        <li key={m.id} className="flex flex-col gap-2 rounded-xl bg-telon-2 p-2">
          {m.tipo === "foto" && m.path
            ? <img src={showcaseFotoUrl(m.path)} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
            : <a href={m.url ?? "#"} target="_blank" rel="noopener" className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg bg-sala p-2 text-center text-xs font-semibold break-all">
                <span className="text-sm font-black"><Icono nombre="play" /> {tipoVideo(m.url ?? "") === "youtube" ? "YouTube" : "Video"}</span>{m.titulo ?? m.url}
              </a>}
          <ActionForm inline action={borrarMedia} hidden={{ id: m.id }} confirm="¿Quitar de la página?" submit="Quitar" submitClass={ghost} />
        </li>
      ))}
    </ul>
  );
}

function FormVideo({ plan, categoria }: { plan?: string; categoria?: string }) {
  return (
    <ActionForm action={agregarVideo} hidden={{ plan: plan ?? "", categoria: categoria ?? "show" }} submit="Agregar video" submitClass={ghost}>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <input className={input} name="url" type="url" required placeholder="Liga de YouTube, Instagram o TikTok (https://…)" aria-label="Liga del video" />
        <input className={input} name="titulo" placeholder="Título (opcional)" aria-label="Título del video" />
      </div>
    </ActionForm>
  );
}

// Fotos (se suben aquí) y videos (ligas de YouTube o Instagram): generales por categoría y de cada plan.
export default async function MediosShowcase() {
  const { planes, media } = await getShowcases();
  return (
    <>
      <p className="text-sm text-texto-2">Las fotos generales salen en &quot;Así se vive&quot;; las de cada plan, dentro de su tarjeta. Los videos de YouTube se ven en la página; los de Instagram o TikTok se abren aparte.</p>
      {(["show", "equipo", "ensayos"] as const).map((c) => (
        <Card key={c} className="flex flex-col gap-3">
          <h2 className="titular text-xl">General · {CATEGORIAS[c]}</h2>
          <Lista items={media.filter((m) => !m.plan_id && m.categoria === c)} />
          <ImageUpload multiple productionId="showcase" kind="galeria" carpeta="galeria" bucket="showcases" base={c} save={agregarFoto.bind(null, null, c)} label="Subir fotos" />
          <FormVideo categoria={c} />
        </Card>
      ))}
      {planes.map((p) => (
        <Card key={p.id} className="flex flex-col gap-3">
          <h2 className="titular text-xl">Plan · {p.nombre}{!p.activo && <span className="ml-2 text-xs text-texto-3">oculto</span>}</h2>
          <Lista items={media.filter((m) => m.plan_id === p.id)} />
          <ImageUpload multiple productionId="showcase" kind="galeria" carpeta="galeria" bucket="showcases" base={p.nombre} save={agregarFoto.bind(null, p.id, "show")} label="Subir fotos" />
          <FormVideo plan={p.id} />
        </Card>
      ))}
    </>
  );
}
