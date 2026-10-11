import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ESTADO_CONVOCATORIA } from "@/lib/audition-rules";
import { getPanelAudition } from "@/lib/panel-auditions";
import { can, canAny } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

// Una convocatoria: subsecciones según el rol en ESTA obra.
export default async function AuditionLayout({ children, params }: LayoutProps<"/panel/producciones/[id]/audiciones/[aid]">) {
  const { id, aid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/audiciones/${aid}`);
  if (!canAny(access, id, ["audiciones.gestionar", "audiciones.registro", "audiciones.evaluar"])) redirect(`/panel/producciones/${id}`);
  const a = await getPanelAudition(aid);
  if (!a) notFound();
  const g = can(access, id, "audiciones.gestionar");
  const links = [
    { href: "", label: "Configuración", show: g },
    { href: "/solicitudes", label: "Solicitudes", show: g },
    { href: "/registro", label: "Registro del día", show: g || can(access, id, "audiciones.registro") },
    { href: "/evaluacion", label: "Evaluación", show: can(access, id, "audiciones.evaluar") },
    { href: "/resultados", label: "Resultados", show: g },
  ].filter((l) => l.show);
  const root = `/panel/producciones/${id}/audiciones/${aid}`;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/panel/producciones/${id}/audiciones`} className="text-sm font-bold text-violeta-claro">← Convocatorias</Link>
        <p className="mt-2 text-xl font-bold">{a.titulo} <span className="ml-2 text-sm font-normal text-texto-3">{ESTADO_CONVOCATORIA[a.estado]}</span></p>
      </div>
      <nav aria-label="Audición" className="flex flex-wrap gap-2 text-sm">
        {links.map((l) => <Link key={l.href} href={`${root}${l.href}`} className="rounded-full border border-white/20 px-3 py-1.5 font-semibold hover:border-white/50">{l.label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
