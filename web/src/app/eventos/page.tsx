import type { Metadata } from "next";
import Link from "next/link";
import { EncuentroCard } from "@/components/fanzone/EncuentroCard";
import { PageHeading } from "@/components/PageHeading";
import { getSession } from "@/lib/auth";
import { getCredencial, getEncuentros, getEventosCartelera } from "@/lib/fanzone";
import { partesFuncion } from "@/lib/disponibilidad";
import { ACCESO_EVENTO, TIPOS_EVENTO } from "@/lib/eventos-rules";

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
              {bloqueados.map((e) => {
                const f = partesFuncion(e.starts_at);
                const cta = !session ? { href: "/entrar?next=/eventos", label: "Entra para ver más" } : { href: "/fan-zone", label: "Únete al Club Fan" };
                return (
                  <li key={e.id} id={`e-${e.id}`} className="flex flex-col gap-3 rounded-[18px] border border-oro/25 bg-sala/40 p-4">
                    <div className="flex items-center gap-4">
                      <div className="grid justify-items-center border-r border-white/10 pr-4">
                        <small className="text-[10px] font-bold uppercase tracking-[0.2em] text-oro">{f.dia}</small>
                        <b className="num text-3xl font-black leading-none">{f.numero}</b>
                        <small className="text-[10px] font-bold uppercase tracking-[0.2em] text-texto-3">{f.mes}</small>
                      </div>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-oro">
                          {e.categoria || TIPOS_EVENTO[e.tipo].label}
                          <span className="rounded-full border border-oro/40 px-2 py-0.5 text-[9px] tracking-[0.12em] text-oro-claro">🔒 {ACCESO_EVENTO[e.acceso].corto}</span>
                        </span>
                        <strong className="truncate">{e.titulo}</strong>
                        <span className="text-[12.5px] text-texto-3">{f.hora}{e.tipo === "en_linea" ? " · En línea" : e.lugar ? ` · ${e.lugar}` : ""}{e.obra ? ` · ${e.obra}` : ""}</span>
                      </div>
                    </div>
                    <Link href={cta.href} className="fb fb-fz fb-sm self-start">{cta.label}</Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
