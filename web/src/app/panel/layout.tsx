import type { Metadata } from "next";
import { PanelNavLinks, PanelSubTabs } from "@/components/panel/PanelNav";
import { env } from "@/lib/env";
import { unreadCount } from "@/lib/notifications";
import { panelMenu } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

export const metadata: Metadata = { title: { default: "Panel", template: "%s · Panel DARF" } };

// Estructura del panel: menú lateral en computadora, plegable en celular.
// Cada página vuelve a revisar permisos; la base es la que decide al final.
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  const access = await requirePanel();
  const menu = panelMenu(access);
  const nuevas = await unreadCount();
  const nombre = access.session.profile?.nombre || access.session.email;

  const links = (
    <>
      <PanelNavLinks menu={menu} badges={{ inicio: nuevas }} />
      {env.panel1Url && (
        <a href={env.panel1Url} className="mt-2 rounded-lg px-3 py-2.5 text-sm text-texto-3 hover:bg-telon-2">
          Panel anterior (1.0) ↗
        </a>
      )}
    </>
  );

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 px-5 pb-16 pt-8 md:px-16 md:pt-12 lg:grid-cols-[220px_minmax(0,1fr)] print:block print:pt-0">
      <aside className="lg:sticky lg:top-6 lg:self-start print:hidden">
        <p className="mb-1 hidden px-3 text-xs font-bold uppercase tracking-[0.24em] text-texto-3 lg:block">Panel</p>
        <p className="mb-3 hidden truncate px-3 text-sm text-texto-3 lg:block">{nombre}{access.isDirector ? " · Director" : ""}</p>
        <nav aria-label="Panel" className="hidden flex-col lg:flex">{links}</nav>
        <details className="rounded-2xl bg-telon lg:hidden">
          <summary className="cursor-pointer list-none px-4 py-3 font-bold">Menú del panel ▾</summary>
          <nav aria-label="Panel" className="flex flex-col px-2 pb-3">{links}</nav>
        </details>
      </aside>
      <div className="flex min-w-0 flex-col gap-6">
        <PanelSubTabs menu={menu} />
        {children}
      </div>
    </div>
  );
}
