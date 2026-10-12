/* eslint-disable @next/next/no-img-element -- logo SVG del kit */
import type { Metadata } from "next";
import { numeroSocio } from "@/lib/fanzone-rules";
import { anioMx } from "@/lib/gafete-rules";
import { getCredencialPublica } from "@/lib/fanzone";

export const metadata: Metadata = { title: "Credencial Club Fan", robots: { index: false, follow: false } };

// Credencial del Club Fan escaneada con un celular (0080): confirma que es socio. Sin contacto.
export default async function CredencialPublicaPage({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const c = await getCredencialPublica(token);
  return (
    <main className="flex flex-col items-center gap-6 px-5 pb-24 pt-12 text-center">
      <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" className="h-10 w-auto" />
      {c ? (
        <section aria-label="Credencial verificada" className="flex w-[min(360px,90vw)] flex-col items-center gap-3 rounded-[26px] border border-oro/50 bg-[radial-gradient(120%_70%_at_50%_0%,rgb(215_187_95/0.25),transparent_60%),linear-gradient(170deg,#1a1622,#0b0910)] px-6 py-8">
          <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-[#14532d] text-3xl text-[#bbf7d0]">✓</span>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#bbf7d0]">Socio del Club Fan verificado</p>
          <p className="text-3xl font-black uppercase">{c.nombre || "Socio"}</p>
          <p className="text-lg font-bold text-oro">{numeroSocio(c.numero)}{c.fundador ? " · Fan fundador" : ""}</p>
          <p className="text-xs uppercase tracking-[0.2em] text-texto-3">Socio desde {anioMx(new Date(c.desde))}</p>
        </section>
      ) : (
        <section aria-label="Credencial no válida" className="flex w-[min(360px,90vw)] flex-col items-center gap-3 rounded-[26px] border border-[#ff8fa3]/50 px-6 py-8">
          <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-[#5a1a22] text-3xl text-[#fecdd3]">✕</span>
          <p className="text-lg font-bold">Credencial no válida</p>
          <p className="text-sm text-texto-3">Puede que se haya regenerado. Pide a la persona que abra su credencial en la Fan Zone.</p>
        </section>
      )}
    </main>
  );
}
