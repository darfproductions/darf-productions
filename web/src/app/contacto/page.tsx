import type { Metadata } from "next";
import { PageHeading } from "@/components/PageHeading";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Contacto" };

export default function ContactoPage() {
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Contacto" title="Hablemos">
        Dudas sobre boletos, producciones, patrocinios o colaboraciones.
      </PageHeading>
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:px-16 lg:grid-cols-12">
        <div className="lg:col-span-7"><ContactForm /></div>
        <aside className="flex flex-col gap-3 text-texto-2 lg:col-span-4 lg:col-start-9">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Redes</p>
          <a href="https://www.instagram.com/darfproductions" className="font-semibold text-texto hover:text-violeta-claro">Instagram · @darfproductions</a>
          <a href="https://www.tiktok.com/@darf.productions" className="font-semibold text-texto hover:text-violeta-claro">TikTok · @darf.productions</a>
        </aside>
      </div>
    </main>
  );
}
