import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/marca/darf-logo-light.webp";
import { getSession } from "@/lib/auth";

export const NAV_LINKS = [
  { href: "/cartelera", label: "Cartelera" },
  { href: "/producciones", label: "Producciones" },
  { href: "/fan-zone", label: "Fan Zone" },
  { href: "/audiciones", label: "Audiciones" },
  { href: "/contacto", label: "Contacto" },
];

export async function SiteHeader() {
  const session = await getSession();
  const isStaff = session?.profile?.rol === "staff" || session?.profile?.rol === "admin";
  const account = session
    ? { href: "/cuenta", label: "Mi cuenta" }
    : { href: "/entrar", label: "Entrar" };

  return (
    <header className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-5 md:px-16 md:py-7">
      <Link href="/" aria-label="DARF Productions, inicio">
        <Image src={logo} alt="DARF Productions" className="h-9 w-auto md:h-11" priority />
      </Link>

      <nav aria-label="Principal" className="hidden gap-7 text-[13px] font-semibold uppercase tracking-[0.14em] lg:flex">
        {NAV_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-texto-2 hover:text-white">
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="hidden items-center gap-5 lg:flex">
        {isStaff && (
          <Link href="/panel" className="text-[13px] font-semibold text-texto-2 hover:text-white">Panel</Link>
        )}
        <Link href={account.href} className="text-[13px] font-semibold text-texto-2 hover:text-white">{account.label}</Link>
        <Link href="/cartelera" className="boton-compra rounded-full px-5 py-3 text-[13px] font-bold uppercase tracking-[0.08em]">
          Boletos
        </Link>
      </div>

      {/* Menú móvil: funciona sin JavaScript (details/summary). */}
      <details className="group lg:hidden">
        <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-white/35" aria-label="Abrir menú">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </summary>
        <nav aria-label="Menú" className="absolute inset-x-4 top-20 flex flex-col gap-1 rounded-2xl bg-telon p-4 shadow-2xl">
          {[...NAV_LINKS, ...(isStaff ? [{ href: "/panel", label: "Panel" }] : []), account].map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-3 font-semibold hover:bg-telon-2">
              {l.label}
            </Link>
          ))}
          <Link href="/cartelera" className="boton-compra mt-2 rounded-full py-3 text-center text-sm font-bold uppercase tracking-[0.08em]">
            Comprar boletos
          </Link>
        </nav>
      </details>
    </header>
  );
}
