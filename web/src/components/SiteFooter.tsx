import Link from "next/link";
import { NAV_LINKS } from "@/components/SiteHeader";

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
      <div className="flex gap-5">
        <a href="https://www.instagram.com/darfproductions" className="hover:text-white">Instagram</a>
        <a href="https://www.tiktok.com/@darf.productions" className="hover:text-white">TikTok</a>
      </div>
    </footer>
  );
}
