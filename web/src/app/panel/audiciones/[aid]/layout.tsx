import Link from "next/link";
import { ESTADO_CONVOCATORIA, MODALIDAD } from "@/lib/audition-rules";
import { requireAudition } from "@/lib/panel-auditions";

// Una convocatoria (de obra o general): subsecciones según mis permisos en ELLA.
export default async function AuditionLayout({ children, params }: LayoutProps<"/panel/audiciones/[aid]">) {
  const { aid } = await params;
  const { a, may } = await requireAudition(aid, []);
  const g = may("audiciones.gestionar");
  const links = [
    { href: "", label: "Configuración", show: g },
    { href: "/solicitudes", label: "Solicitudes", show: g },
    { href: "/registro", label: "Día de la audición", show: a.modalidad !== "en_linea" && (g || may("audiciones.registro")) },
    { href: "/evaluacion", label: "Evaluación", show: may("audiciones.evaluar") },
    { href: "/resultados", label: "Resultados", show: g },
  ].filter((l) => l.show);
  const root = `/panel/audiciones/${aid}`;
  const back = a.production_id ? `/panel/producciones/${a.production_id}/audiciones` : "/panel/audiciones";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={back} className="text-sm font-bold text-violeta-claro">← {a.productions?.nombre ? `Audiciones de ${a.productions.nombre}` : "Audiciones"}</Link>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{a.productions?.nombre ?? "Convocatoria general"}{a.plantilla ? ` · ${a.plantilla}` : ""}{a.modalidad !== "presencial" ? ` · ${MODALIDAD[a.modalidad]}` : ""}{a.solo_invitados ? " · por invitación" : ""}</p>
        <p className="text-xl font-bold">{a.titulo} <span className="ml-2 text-sm font-normal text-texto-3">{ESTADO_CONVOCATORIA[a.estado]}</span></p>
      </div>
      <nav aria-label="Audición" className="flex flex-wrap gap-2 text-sm">
        {links.map((l) => <Link key={l.href} href={`${root}${l.href}`} className="rounded-full border border-white/20 px-3 py-1.5 font-semibold hover:border-white/50">{l.label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
