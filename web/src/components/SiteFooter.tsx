import Link from "next/link";
import { NAV_LINKS } from "@/components/SiteHeader";
import { SocialIcon } from "@/components/SocialIcon";
import { CONTACT_CHANNELS } from "@/content/contacto";

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 flex max-w-[1440px] flex-col gap-6 border-t border-white/10 px-5 pb-16 pt-10 text-sm text-texto-3 md:flex-row md:items-start md:justify-between md:px-16">
      <div className="flex flex-col gap-2">
        <p className="font-bold uppercase tracking-[0.2em] text-texto">DARF Productions</p>
        <p>Teatro musical.</p>
      </div>
      <nav aria-label="Pie de página" className="flex flex-wrap gap-x-6 gap-y-2">
        {NAV_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-white">{l.label}</Link>
        ))}
        <Link href="/cuenta" className="hover:text-white">Mi cuenta</Link>
      </nav>
      <ul className="flex gap-3">
        {CONTACT_CHANNELS.map((c) => (
          <li key={c.channel}>
            <a
              href={c.href}
              aria-label={`${c.nombre} ${c.handle}`}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-telon text-texto-2 transition-colors hover:text-white"
              {...(c.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <SocialIcon channel={c.channel} size={20} />
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}
