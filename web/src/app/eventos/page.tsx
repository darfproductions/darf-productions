import type { Metadata } from "next";
import Link from "next/link";
import { EncuentroCard } from "@/components/fanzone/EncuentroCard";
import { PageHeading } from "@/components/PageHeading";
import { getSession } from "@/lib/auth";
import { getCredencial, getEncuentros, getEventosCartelera } from "@/lib/fanzone";
import { EventoBloqueado } from "@/components/eventos/EventoBloqueado";

export const metadata: Metadata = { title: "Eventos" };

// Eventos de DARF (0081): cada quien ve los que le tocan (públicos, con cuenta y, si es socio,
// los del Club Fan). Los en línea muestran la liga 15 minutos antes.
export default async function EventosPage() {
  const [session, eventos, cartelera] = await Promise.all([getSession(), getEncuentros(null), getEventosCartelera(30)]);
  const socio = session ? !!(await getCredencial()) : false;
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
