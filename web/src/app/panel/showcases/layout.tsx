import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelTitle } from "@/components/panel/ui";
import { casa } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { Icono } from "@/components/Icono";
import { TabsBar } from "@/components/panel/PanelNav";

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
      <TabsBar label="Showcases" links={TABS.map(([p, l]) => ({ href: `/panel/showcases${p ? `/${p}` : ""}`, label: l }))} />
      {children}
    </div>
  );
}
