import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/panel/ui";
import { guiaDe } from "@/lib/guia-roles";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Guía de tu rol" };

// Guía de tu rol (Bloque 4C, 0094): qué puedes hacer en esta obra y dónde, según tus permisos.
// Llega aquí el aviso de bienvenida al equipo y la liga de la invitación.
export default async function GuiaRol({ params }: PageProps<"/panel/producciones/[id]/guia">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/guia`);
  const supabase = await createClient();
  const [{ data: misRoles }, { data: todos }] = await Promise.all([
    supabase.from("production_members").select("panel_roles(nombre, orden)").eq("production_id", id).eq("user_id", access.session.userId),
    access.isDirector ? supabase.from("permissions").select("id") : Promise.resolve({ data: null }),
  ]);
  const roles = ((misRoles ?? []) as unknown as { panel_roles: { nombre: string; orden: number } | null }[])
    .map((r) => r.panel_roles).filter((r): r is { nombre: string; orden: number } => !!r)
    .sort((a, b) => a.orden - b.orden).map((r) => r.nombre);
  const permisos = access.isDirector ? ((todos ?? []) as { id: string }[]).map((p) => p.id) : (access.byProduction[id] ?? []);
  const pasos = guiaDe(permisos, id);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="titular text-2xl">Guía de tu rol</h2>
        <p className="mt-1 text-texto-2">
          {access.isDirector ? "Como Director tienes acceso a todo. Esto es lo que se hace en cada sección." : roles.length ? <>Tu rol en esta obra: <b className="text-texto">{roles.join(", ")}</b>. Esto es lo que puedes hacer y dónde.</> : "Esto es lo que puedes hacer en esta obra y dónde."}
        </p>
      </Card>
      <ul className="grid gap-3 md:grid-cols-2">
        {pasos.map((p) => (
          <li key={p.titulo}>
            <Link href={p.href} className="flex h-full flex-col gap-1 rounded-2xl bg-telon p-5 hover:bg-telon-2">
              <span className="flex items-center justify-between gap-2 font-bold">{p.titulo}<span className="text-violeta-claro"><Icono nombre="flecha-der" /></span></span>
              <span className="text-sm text-texto-2">{p.que}</span>
              {p.consejo && <span className="text-sm text-texto-3"><Icono nombre="foco" /> {p.consejo}</span>}
            </Link>
          </li>
        ))}
        {pasos.length === 0 && <li className="rounded-2xl bg-telon p-5 text-texto-2">Por ahora solo puedes ver el Resumen de la obra. Si necesitas más, pídeselo a quien te invitó.</li>}
      </ul>
      <Card className="text-sm text-texto-2">
        ¿Dudas? Pregúntale a <b className="text-texto">DARFY</b> (el botón de ayuda) o a quien te invitó al equipo. Tus avisos llegan a <Link href="/panel/notificaciones" className="font-bold text-violeta-claro">Notificaciones</Link>; puedes activarlos en tu teléfono desde <Link href="/cuenta" className="font-bold text-violeta-claro">Mi cuenta</Link>.
      </Card>
    </div>
  );
}
