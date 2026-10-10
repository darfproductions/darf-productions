import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/marca/darf-logo-light.webp";

const LINKS = [
  { href: "/", label: "Cartelera" },
  { href: "/#producciones", label: "Producciones" },
  { href: "/#fan-zone", label: "Fan Zone" },
  { href: "/#audiciones", label: "Audiciones" },
];

export function SiteHeader() {
  return (
    <header className="relative z-10 mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-16 md:py-7">
      <Link href="/" aria-label="DARF Productions, inicio">
        <Image src={logo} alt="DARF Productions" className="h-9 w-auto md:h-11" priority />
      </Link>
      <nav aria-label="Principal" className="hidden gap-8 text-[13px] font-semibold uppercase tracking-[0.14em] md:flex">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-texto-2 hover:text-white">
            {l.label}
          </Link>
        ))}
      </nav>
      <Link
        href="/#cartelera"
        className="boton-compra rounded-full px-5 py-3 text-[13px] font-bold uppercase tracking-[0.08em]"
      >
        Boletos
      </Link>
    </header>
  );
}
