import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelTitle } from "@/components/panel/ui";
import { casa } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { Icono } from "@/components/Icono";

const TABS = [["", "Planes"], ["pagina", "Página"], ["medios", "Fotos y videos"], ["solicitudes", "Solicitudes"]] as const;

// Panel → Proyectos → Showcases (0121): Casa DARF con el permiso Showcases (y el Director).
export default async function ShowcasesLayout({ children }: { children: React.ReactNode }) {
  const access = await requirePanel("/panel/showcases");
  if (!casa(access, "casa.showcases")) redirect("/panel");
  return (
    <div className="flex flex-col gap-4">
      <PanelTitle eyebrow="Proyectos" title="Showcases">
        <Link href="/showcases" target="_blank" className="text-sm font-bold text-violeta-claro">Ver la página <Icono nombre="externo" /></Link>
      </PanelTitle>
      <nav aria-label="Showcases" className="flex flex-wrap gap-2 text-sm">
        {TABS.map(([p, l]) => <Link key={p} href={`/panel/showcases${p ? `/${p}` : ""}`} className="rounded-full border border-white/20 px-3 py-1.5 font-semibold hover:border-white/50">{l}</Link>)}
      </nav>
      {children}
    </div>
  );
}
