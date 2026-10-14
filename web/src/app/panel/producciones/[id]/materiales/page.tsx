import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { AudienceFields } from "@/components/panel/AudienceFields";
import { Card } from "@/components/panel/ui";
import { audienceLabel } from "@/lib/audience";
import { TIPO_MATERIAL, listMaterials, porCarpeta, signMaterials } from "@/lib/materials";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { removeMaterial } from "./actions";
import { MaterialForm } from "./MaterialForm";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Materiales" };

// Materiales privados de la obra: archivos o enlaces, por carpeta y por a quién van.
export default async function Materiales({ params }: PageProps<"/panel/producciones/[id]/materiales">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/materiales`);
  const gestiona = can(access, id, "materiales.gestionar");
  if (!gestiona && !can(access, id, "materiales.ver")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [mats, roster] = await Promise.all([
    listMaterials(id),
    gestiona ? supabase.rpc("cast_roster", { pid: id }) : Promise.resolve({ data: [] }),
  ]);
  const gente = ((roster.data ?? []) as { user_id: string; nombre: string }[]);
  const nombres = new Map(gente.map((g) => [g.user_id, g.nombre]));
  const urls = await signMaterials(mats.map((m) => m.archivo_path));
  const carpetas = [...new Set(mats.map((m) => m.carpeta).filter((c): c is string => !!c))];

  return (
    <div className="flex flex-col gap-4">
      {porCarpeta(mats).map(([carpeta, items]) => (
        <Card key={carpeta} className="flex flex-col gap-2">
          <h2 className="titular text-xl">{carpeta || "General"}</h2>
          <ul className="flex flex-col gap-2">
            {items.map((m) => {
              const href = m.archivo_path ? urls.get(m.archivo_path) : m.url ?? undefined;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2.5 text-sm">
                  <span>
                    {href ? <a href={href} target="_blank" rel="noreferrer" className="font-bold text-violeta-claro underline">{m.titulo} <Icono nombre="externo" /></a> : <b>{m.titulo}</b>}
                    <span className="text-texto-3"> · {TIPO_MATERIAL[m.tipo]} · {m.archivo_path ? "archivo" : "enlace"}</span>
                    {m.descripcion && <span className="block text-xs text-texto-2">{m.descripcion}</span>}
                    <span className="block text-xs text-texto-3">Para: {audienceLabel(m, nombres)}</span>
                  </span>
                  {gestiona && <ActionForm inline action={removeMaterial} hidden={{ pid: id, id: m.id }} confirm={`¿Quitar “${m.titulo}”?${m.archivo_path ? " Se borra el archivo." : ""}`} submit="Quitar" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold" />}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      {mats.length === 0 && <Card>Aún no hay materiales.</Card>}
      {gestiona && (
        <Card>
          <h2 className="titular mb-3 text-xl">Agregar material</h2>
          <MaterialForm pid={id} tipos={TIPO_MATERIAL} carpetas={carpetas}><AudienceFields gente={gente} /></MaterialForm>
          <p className="mt-2 text-xs text-texto-3">Archivos hasta 50 MB (PDF, audio, imagen o video corto). Para videos largos usa un enlace. Solo lo ven el equipo y los integrantes activos a quienes va dirigido.</p>
        </Card>
      )}
    </div>
  );
}
