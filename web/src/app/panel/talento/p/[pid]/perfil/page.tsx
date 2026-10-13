import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PanelTitle } from "@/components/panel/ui";
import { ProProfileEditor } from "@/components/pro/ProProfileEditor";
import { requirePanel } from "@/lib/permissions";
import { getPro } from "@/lib/pro-profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Perfil profesional" };

// El equipo corrige el perfil profesional de una persona (Director o elenco.gestionar en una obra suya).
export default async function PerfilEquipo({ params }: PageProps<"/panel/talento/p/[pid]/perfil">) {
  const { pid } = await params;
  await requirePanel(`/panel/talento/p/${pid}/perfil`);
  if (!/^[0-9a-f-]{36}$/.test(pid)) notFound();
  const supabase = await createClient();
  const [{ data: puede }, { data: menor }, { data: persona }] = await Promise.all([
    supabase.rpc("can_edit_pro_profile", { pid }),
    supabase.rpc("person_is_minor", { pid }),
    supabase.from("people").select("nombre, profile_id").eq("id", pid).maybeSingle(),
  ]);
  if (!puede || !persona) notFound();
  const { pro, fotos } = await getPro(pid);
  return (
    <>
      <Link href={persona.profile_id ? `/panel/talento/${persona.profile_id}` : `/panel/talento/p/${pid}`} className="text-sm font-bold text-violeta-claro">← Ficha</Link>
      <PanelTitle eyebrow="Perfil profesional" title={persona.nombre as string}>
        Lo llena la persona desde Mi cuenta; aquí el equipo puede corregirlo y registrar el permiso del tutor si es menor.
      </PanelTitle>
      <ProProfileEditor pid={pid} nombre={persona.nombre as string} pro={pro} fotos={fotos} team esMenor={!!menor} />
    </>
  );
}
