import type { Metadata } from "next";
import { PanelNavLinks, PanelSubTabs } from "@/components/panel/PanelNav";
import { env } from "@/lib/env";
import { unreadCount } from "@/lib/notifications";
import { totalPendientes } from "@/lib/panel-home-rules";
import { BuscadorPanel } from "@/components/panel/BuscadorPanel";
import { listPanelProductions } from "@/lib/panel-data";
import type { Atajo } from "@/lib/panel-buscar-rules";
import { esCasa, myProductionIds, panelMenu, productionGroups } from "@/lib/panel-nav";
import { getPendientes } from "@/lib/panel-pendientes";
import { requirePanel } from "@/lib/permissions";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: { default: "Panel", template: "%s · Panel DARF" } };

// Estructura del panel: menú lateral en computadora, plegable en celular.
// Cada página vuelve a revisar permisos; la base es la que decide al final.
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  const access = await requirePanel();
  const menu = panelMenu(access);
  const [nuevas, pendientes, obras] = await Promise.all([unreadCount(), getPendientes(), listPanelProductions(access.isDirector ? undefined : myProductionIds(access))]);
  // Atajos del buscador (0085): secciones del menú y cada obra con sus pestañas permitidas.
  const atajos: Atajo[] = [
    ...menu.flatMap((s) => (s.subs.length ? s.subs : [{ href: s.href, label: s.label }]).map((x) => ({
      tipo: "seccion", titulo: x.label, detalle: s.label === x.label ? "Panel" : s.label, href: x.href, claves: `${s.label} ${x.label}`,
    }))),
    ...obras.flatMap((p) => [
      { tipo: "obra", titulo: p.nombre, detalle: "Resumen de la obra", href: `/panel/producciones/${p.id}`, claves: `${p.nombre} obra resumen` },
      ...productionGroups(access, p.id, p.estado === "archivada").flatMap((g) => g.tabs.filter((t) => t.path).map((t) => ({
        tipo: "seccion", titulo: `${p.nombre} · ${t.label}`, detalle: g.label, href: `/panel/producciones/${p.id}/${t.path}`, claves: `${p.nombre} ${g.label} ${t.label}`,
      }))),
    ]),
  ];
  const nombre = access.session.profile?.nombre || access.session.email;

  const links = (
    <>
      <PanelNavLinks menu={menu} badges={{ inicio: totalPendientes(pendientes), notificaciones: nuevas }} />
      {env.panel1Url && (
        <a href={env.panel1Url} className="mt-2 rounded-lg px-3 py-2.5 text-sm text-texto-3 hover:bg-telon-2">
          Panel anterior (1.0) <Icono nombre="externo" />
        </a>
      )}
    </>
  );

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 px-5 pb-16 pt-8 md:px-16 md:pt-12 lg:grid-cols-[220px_minmax(0,1fr)] print:block print:pt-0">
      <aside className="lg:sticky lg:top-6 lg:self-start print:hidden">
        <p className="mb-1 hidden px-3 text-xs font-bold uppercase tracking-[0.24em] text-texto-3 lg:block">Panel</p>
        <p className="mb-3 hidden truncate px-3 text-sm text-texto-3 lg:block">{nombre}{access.isDirector ? " · Director" : esCasa(access) ? " · Casa DARF" : ""}</p>
        <nav aria-label="Panel" className="hidden flex-col lg:flex">{links}</nav>
        <details className="rounded-2xl bg-telon lg:hidden">
          <summary className="cursor-pointer list-none px-4 py-3 font-bold">Menú del panel <Icono nombre="chevron-abajo" /></summary>
          <nav aria-label="Panel" className="flex flex-col px-2 pb-3">{links}</nav>
        </details>
      </aside>
      <div className="flex min-w-0 flex-col gap-6">
        <BuscadorPanel atajos={atajos} />
        <PanelSubTabs menu={menu} />
        {children}
      </div>
    </div>
  );
}
