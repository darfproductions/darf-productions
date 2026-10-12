import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, PanelTitle, button, input } from "@/components/panel/ui";
import { requireDirector } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addTeamMember, removeTeamMember, saveTeamMember } from "./actions";

export const metadata: Metadata = { title: "Equipo DARF" };

type Miembro = {
  id: string; cargo: string; orden: number; visible: boolean; person_id: string;
  people: { nombre: string; profile_id: string | null; pro_profiles: { slug: string; publico: boolean } | null } | null;
};
const ghost = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60";

// Equipo DARF (solo el Director): quién sale en "Conoce al equipo" (/nosotros), con su cargo y orden.
export default async function EquipoDarf({ searchParams }: PageProps<"/panel/personas/equipo">) {
  await requireDirector("/panel/personas/equipo");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const supabase = await createClient();
  const [{ data }, { data: encontrados }] = await Promise.all([
    supabase.from("team_members").select("id, cargo, orden, visible, person_id, people(nombre, profile_id, pro_profiles(slug, publico))").order("orden"),
    q ? supabase.rpc("people_directory", { q }) : Promise.resolve({ data: [] }),
  ]);
  const equipo = (data ?? []) as unknown as Miembro[];
  const ya = new Set(equipo.map((m) => m.person_id));
  const opciones = ((encontrados ?? []) as { id: string; nombre: string; email: string | null }[]).filter((p) => !ya.has(p.id)).slice(0, 20);

  return (
    <>
      <PanelTitle eyebrow="Personas" title="Equipo DARF">
        Los directivos que salen en la página pública <Link href="/nosotros" className="font-bold text-violeta-claro">Conoce al equipo</Link>. La foto, la semblanza y el enlace salen de su perfil profesional, solo si la persona lo hizo público.
      </PanelTitle>

      <Card className="flex flex-col gap-4">
        <h2 className="titular text-xl">En el equipo ({equipo.length})</h2>
        {equipo.length === 0 && <p className="text-texto-2">Aún no hay nadie. Búscalos abajo.</p>}
        {equipo.map((m) => {
          const pro = m.people?.pro_profiles;
          return (
            <div key={m.id} className="flex flex-col gap-2 rounded-xl bg-sala p-4">
              <p className="font-bold">
                {m.people?.nombre ?? "Persona"}{" "}
                <span className="text-xs font-semibold text-texto-3">
                  · {pro?.publico ? <Link href={`/artistas/${pro.slug}`} className="text-violeta-claro">perfil público ↗</Link> : "perfil profesional no público (sale solo nombre y cargo)"}
                </span>
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <ActionForm inline action={saveTeamMember} hidden={{ id: m.id }} submit="Guardar" submitClass={ghost}>
                  <label className="flex flex-col gap-1 text-xs font-semibold">Cargo<input className={`${input} w-64`} name="cargo" defaultValue={m.cargo} required /></label>
                  <label className="flex flex-col gap-1 text-xs font-semibold">Orden<input className={`${input} w-20`} name="orden" type="number" defaultValue={m.orden} required /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" defaultChecked={m.visible} /> Visible</label>
                </ActionForm>
                <ActionForm inline action={removeTeamMember} hidden={{ id: m.id }} confirm={`¿Quitar a ${m.people?.nombre ?? "esta persona"} del equipo?`} submit="Quitar" submitClass="text-sm font-bold text-[#ff8fa3]" />
              </div>
            </div>
          );
        })}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Agregar al equipo</h2>
        <form className="flex flex-wrap gap-2">
          <input className={`${input} max-w-md flex-1`} name="q" defaultValue={q} placeholder="Buscar en el directorio por nombre" />
          <button className={button}>Buscar</button>
        </form>
        {q && opciones.length === 0 && <p className="text-sm text-texto-2">Sin resultados (o ya están en el equipo). La persona debe existir en el Directorio.</p>}
        {opciones.length > 0 && (
          <ActionForm action={addTeamMember} submit="Agregar">
            <div className="flex flex-wrap gap-2">
              <select className={input} name="person" required defaultValue="" aria-label="Persona">
                <option value="" disabled>Elige a la persona…</option>
                {opciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.email ? ` (${p.email})` : ""}</option>)}
              </select>
              <input className={`${input} w-64`} name="cargo" required placeholder="Cargo (ej. Director general)" aria-label="Cargo" />
            </div>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
