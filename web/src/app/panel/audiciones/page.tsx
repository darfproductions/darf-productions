import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, PanelTitle } from "@/components/panel/ui";
import { ESTADO_CONVOCATORIA } from "@/lib/audition-rules";
import { listPanelAuditions, type PanelAudition } from "@/lib/panel-auditions";
import { hasAuditionAccess } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { deleteTemplate } from "./actions";
import { NewAuditionForm } from "./NewAuditionForm";

export const metadata: Metadata = { title: "Audiciones" };

function Item({ a }: { a: PanelAudition }) {
  return (
    <Link href={`/panel/audiciones/${a.id}`} className="block rounded-2xl bg-telon p-5 hover:bg-telon-2">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">
        {a.productions?.nombre ?? "Convocatoria general"} · {ESTADO_CONVOCATORIA[a.estado] ?? a.estado}
        {a.visibilidad === "enlace" ? " · solo con enlace" : ""}
      </p>
      <p className="mt-1 text-lg font-bold">{a.titulo}</p>
    </Link>
  );
}

// Todas las convocatorias que puedo trabajar: generales y de cada obra.
export default async function AuditionsHome() {
  const access = await requirePanel("/panel/audiciones");
  if (!hasAuditionAccess(access)) redirect("/panel");
  const supabase = await createClient();
  const [all, { data: plantillas }] = await Promise.all([
    listPanelAuditions(access),
    supabase.from("audition_templates").select("id, nombre, descripcion, created_by").order("nombre"),
  ]);
  const generales = all.filter((a) => !a.production_id);
  const deObra = all.filter((a) => a.production_id);
  return (
    <>
      <PanelTitle eyebrow="Panel" title="Audiciones">
        Convocatorias generales (sin obra, como un llamado de bailarines) y las de cada producción.
      </PanelTitle>
      <section className="flex flex-col gap-3">
        <h2 className="titular text-xl">Generales</h2>
        {generales.map((a) => <Item key={a.id} a={a} />)}
        {generales.length === 0 && <Card>No hay convocatorias generales.</Card>}
        {access.isDirector && (
          <Card>
            <h3 className="titular mb-3 text-lg">Nueva convocatoria general</h3>
            <NewAuditionForm pid={null} />
          </Card>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="titular text-xl">De una producción</h2>
        {deObra.map((a) => <Item key={a.id} a={a} />)}
        {deObra.length === 0 && <Card>Ninguna todavía. Se crean desde la pestaña Audiciones de cada producción.</Card>}
      </section>
      {(plantillas ?? []).length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="titular text-xl">Mis plantillas</h2>
          <Card className="flex flex-col gap-2">
            <p className="text-sm text-texto-2">Se crean con “Guardar como plantilla” en la configuración de cualquier convocatoria y aparecen al crear una nueva.</p>
            <ul className="flex flex-col gap-2">
              {(plantillas ?? []).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
                  <span><b>{t.nombre}</b>{t.descripcion && <span className="text-texto-3"> · {t.descripcion}</span>}</span>
                  {(access.isDirector || t.created_by === access.session.userId) && (
                    <ActionForm inline action={deleteTemplate} hidden={{ id: t.id as string }} confirm={`¿Borrar la plantilla “${t.nombre}”? Las convocatorias creadas con ella no cambian.`} submit="Borrar" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold" />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </>
  );
}
