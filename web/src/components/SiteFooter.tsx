import Image from "next/image";
import Link from "next/link";
import { AbrirDarfy } from "@/components/darfy/AbrirDarfy";
import { SocialIcon } from "@/components/SocialIcon";
import { CONTACT_CHANNELS, whatsappDisplay } from "@/content/contacto";
import { env } from "@/lib/env";
import { partesMx } from "@/lib/dates";

const COLUMNAS: { titulo: string; ligas: { href: string; label: string; fz?: boolean }[] }[] = [
  { titulo: "Explora", ligas: [{ href: "/producciones", label: "Producciones" }, { href: "/eventos", label: "Eventos" }, { href: "/audiciones", label: "Audiciones" }, { href: "/nosotros", label: "Nosotros" }] },
  { titulo: "Comunidad", ligas: [{ href: "/fan-zone", label: "Fan Zone", fz: true }, { href: "/club-fan", label: "Club Fan" }, { href: "/cuenta", label: "Mi cuenta" }, { href: "/cuenta#boletos", label: "Mis boletos" }, { href: "/contacto", label: "Contacto" }] },
  { titulo: "Ayuda", ligas: [{ href: "/privacidad", label: "Aviso de privacidad" }, { href: "/terminos", label: "Términos" }, { href: "/reembolsos", label: "Cambios y reembolsos" }] },
];

const liga = "text-[13.5px] text-texto-3 transition-colors hover:text-white";

// Pie (guía de UI): cierre "Jóvenes para jóvenes", logo y redes, tres columnas y línea legal.
export function SiteFooter() {
  const correo = CONTACT_CHANNELS.find((c) => c.channel === "email");
  return (
    <footer className="mt-24 border-t border-linea bg-[#08070c] print:hidden">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-5 pb-24 pt-14 md:px-16 md:pt-[72px]">
        <div className="flex flex-col gap-6 border-b border-linea pb-12 md:flex-row md:items-end md:justify-between">
          <p className="text-[clamp(2.75rem,7vw,4.5rem)] font-black uppercase leading-[0.9] tracking-[-0.05em]">
            Jóvenes<br />para <span className="txt-luz">jóvenes</span>
          </p>
          <Link href="/audiciones" className="fb fb-luz self-start md:self-auto">Súbete al escenario</Link>
        </div>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-12">
          <div className="flex flex-col gap-5">
            <Image src="/marca/darf-horizontal.svg" alt="DARF Productions" width={600} height={84} unoptimized className="h-9 w-auto self-start md:h-10" />
            <p className="max-w-xs text-[15px] leading-relaxed text-texto-2">Teatro musical hecho por jóvenes, para toda la familia. Querétaro, México.</p>
            <ul className="flex gap-2.5">
              {CONTACT_CHANNELS.map((c) => (
                <li key={c.channel}>
                  <a
                    href={c.href}
                    aria-label={`${c.nombre} ${c.handle}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-linea bg-telon text-texto-2 transition-colors hover:text-white"
                    {...(c.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    <SocialIcon channel={c.channel} size={20} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          {COLUMNAS.map((col) => (
            <nav key={col.titulo} aria-label={col.titulo} className="flex flex-col items-start gap-3.5">
              <p className="eyebrow eyebrow-gris tracking-[0.24em]">{col.titulo}</p>
              {col.ligas.map((l) => (
                <Link key={l.href} href={l.href} className={l.fz ? "txt-oro text-[13.5px] font-bold hover:brightness-125" : liga}>{l.label}</Link>
              ))}
              {col.titulo === "Ayuda" && <AbrirDarfy className={liga} />}
            </nav>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t border-linea pt-6 text-[12.5px] text-texto-3 md:flex-row md:justify-between">
          <span>© {partesMx().y} DARF Productions · Jóvenes para jóvenes</span>
          <span>{correo?.handle}{env.whatsapp ? ` · ${whatsappDisplay(env.whatsapp)}` : ""}</span>
        </div>
      </div>
    </footer>
  );
}
