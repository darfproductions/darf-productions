import type { Metadata } from "next";
import Link from "next/link";
import { globalSections } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

export const metadata: Metadata = { title: { default: "Panel", template: "%s · Panel DARF" } };

// Estructura del panel: menú lateral en computadora, plegable en celular.
// Cada página vuelve a revisar permisos; la base es la que decide al final.
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  const access = await requirePanel();
  const sections = globalSections(access);
  const nombre = access.session.profile?.nombre || access.session.email;

  const links = (
    <>
      {sections.map((s) => (
        <Link key={s.href} href={s.href} className="rounded-lg px-3 py-2.5 font-semibold text-texto-2 hover:bg-telon-2 hover:text-texto">
          {s.label}
        </Link>
      ))}
      <a href="https://darf-2-dev-darf-productions.vercel.app/?v=staff" className="mt-2 rounded-lg px-3 py-2.5 text-sm text-texto-3 hover:bg-telon-2">
        Boletería en panel 1.0 ↗
      </a>
    </>
  );

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 px-5 pb-16 md:px-16 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-1 hidden px-3 text-xs font-bold uppercase tracking-[0.24em] text-texto-3 lg:block">Panel</p>
        <p className="mb-3 hidden truncate px-3 text-sm text-texto-3 lg:block">{nombre}{access.isDirector ? " · Director" : ""}</p>
        <nav aria-label="Panel" className="hidden flex-col lg:flex">{links}</nav>
        <details className="rounded-2xl bg-telon lg:hidden">
          <summary className="cursor-pointer list-none px-4 py-3 font-bold">Menú del panel ▾</summary>
          <nav aria-label="Panel" className="flex flex-col px-2 pb-3">{links}</nav>
        </details>
      </aside>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </div>
  );
}
