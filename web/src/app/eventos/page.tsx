import type { Metadata } from "next";
import Link from "next/link";
import { EncuentroCard } from "@/components/fanzone/EncuentroCard";
import { PageHeading } from "@/components/PageHeading";
import { getSession } from "@/lib/auth";
import { esSocio } from "@/lib/credencial";
import { getEncuentros, getEventosCartelera } from "@/lib/fanzone";
import { EventoBloqueado } from "@/components/eventos/EventoBloqueado";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Eventos" };

// Eventos de DARF (0081): cada quien ve los que le tocan (públicos, con cuenta y, si es socio,
// los del Club Fan). Los en línea muestran la liga 15 minutos antes.
export default async function EventosPage() {
  const [session, eventos, cartelera] = await Promise.all([getSession(), getEncuentros(null), getEventosCartelera(30)]);
  const socio = session ? await esSocio() : false;
  // 0121: botón a Showcases (si la página está publicada).
  const { data: sc } = await (await createClient()).from("showcase_ajustes").select("publicado, titulo").eq("id", 1).maybeSingle();
  // Los que aún no puede abrir (del club o con cuenta): se muestran con candado para invitar.
  const visibles = new Set(eventos.map((e) => e.id));
  const bloqueados = cartelera.filter((e) => !visibles.has(e.id));
  const enVivo = eventos.filter((e) => e.en_vivo);
  const proximos = eventos.filter((e) => !e.en_vivo);
  return (
    <main className="pb-24">
      <PageHeading eyebrow="DARF Productions" title="Eventos">
        Fotos con el elenco, tours por backstage, ensayos abiertos, meet &amp; greets y transmisiones exclusivas.
        {!socio && <> Muchos son del <Link href="/fan-zone" className="font-bold text-oro-claro underline">Club Fan</Link> (es gratis).</>}
      </PageHeading>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-10 px-5 md:px-16">
        {sc?.publicado && (
          <Link href="/showcases" className="flex flex-col gap-3 rounded-[22px] bg-[linear-gradient(120deg,#3b1ce8,#ff2f8c)] p-6 transition hover:brightness-110 md:flex-row md:items-center md:justify-between md:p-8">
            <span className="flex flex-col gap-1">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] opacity-85">Lleva el espectáculo a tu evento</span>
              <span className="display text-[clamp(1.6rem,3.5vw,2.4rem)]">{sc.titulo}</span>
              <span className="text-sm opacity-90">Música, danza y teatro musical en vivo para escuelas, empresas y celebraciones.</span>
            </span>
            <span className="fb self-start bg-white text-[#0b0910] md:self-auto">Ver showcases</span>
          </Link>
        )}
        {enVivo.length > 0 && (
          <section aria-labelledby="vivo-t" className="flex flex-col gap-4">
            <h2 id="vivo-t" className="h2-seccion">Ahora</h2>
            <ul className="grid gap-4 md:grid-cols-2">{enVivo.map((e) => <EncuentroCard key={e.id} e={e} sesion={!!session} socio={socio} />)}</ul>
          </section>
        )}
        <section aria-labelledby="prox-t" className="flex flex-col gap-4">
          <h2 id="prox-t" className="h2-seccion">Próximos</h2>
          {proximos.length ? (
            <ul className="grid gap-4 md:grid-cols-2">{proximos.map((e) => <EncuentroCard key={e.id} e={e} sesion={!!session} socio={socio} />)}</ul>
          ) : (
            <p className="text-texto-2">Por ahora no hay eventos{session ? "" : " públicos"}. {session ? "Te avisamos en tu cuenta cuando haya." : <><Link href="/entrar?next=/eventos" className="font-bold underline">Entra</Link> para ver los de tu cuenta y del Club Fan.</>}</p>
          )}
        </section>
        {bloqueados.length > 0 && (
          <section aria-labelledby="mas-t" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 id="mas-t" className="h2-seccion">{session ? "Del Club Fan" : "Más eventos"}</h2>
              <p className="text-texto-2">{session ? "Únete gratis al Club Fan para apartar tu lugar y entrar." : "Entra con tu cuenta para verlos; algunos son exclusivos del Club Fan (es gratis)."}</p>
            </div>
            <ul className="grid gap-4 md:grid-cols-2">
              {bloqueados.map((e) => <EventoBloqueado key={e.id} e={e} sesion={!!session} />)}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
