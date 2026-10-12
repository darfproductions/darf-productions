/* eslint-disable @next/next/no-img-element -- logos SVG del kit (línea Oro) */
import Link from "next/link";
import { Anuncios } from "@/components/anuncios/Anuncios";
import { Credencial } from "@/components/fanzone/Credencial";
import { EncuentroCard } from "@/components/fanzone/EncuentroCard";
import { FanItemCard, FanProximoCard } from "@/components/fanzone/FanItemCard";
import { PreventaFanZone } from "@/components/fanzone/PreventaFanZone";
import { UnirseClub } from "@/components/fanzone/UnirseClub";
import { FAN_CATEGORIAS, type FanCategoria } from "@/lib/fanzone-rules";
import { MiCredencialFan } from "@/components/fanzone/MiCredencialFan";
import { fanzoneCounts, getCredencial, getEncuentros, getMiCredencialFan, getProximos, listFanzone } from "@/lib/fanzone";
import { getHomeData } from "@/lib/productions";

const PESTANAS: (FanCategoria | "todo")[] = ["todo", "ensayo", "making", "fotos", "otro"];
const BENEFICIOS = [
  ["Detrás del telón", "Ensayos, making of y fotos de cada producción."],
  ["Antes que nadie", "Preventas para el club y avisos de lo que viene."],
  ["Eventos exclusivos", "Foto con el elenco y eventos del club: entras con tu credencial."],
];

// Fan Zone (imagen de referencia de Diego): logo y credencial arriba, obras en píldoras,
// anuncios, "Lo nuevo para ti" por categoría, lo que se desbloquea después y la foto con el elenco.
// pid = una obra (o todas); cat = pestaña.
export async function FanZoneView({ pid, cat, nombre }: { pid: string | null; cat?: string; nombre: string }) {
  const [credencial, { productions }] = await Promise.all([getCredencial(), getHomeData()]);
  const obraDe = new Map(productions.map((p) => [p.id, p.nombre]));
  const obraActual = pid ? productions.find((p) => p.id === pid) : null;

  if (!credencial) {
    return (
      <main className="pb-24">
        <section className="relative overflow-hidden border-b border-oro/25 bg-[#08070c]">
          <div aria-hidden="true" className="cono-oro absolute -top-64 left-[30%] h-[900px] w-[700px]" />
          <div className="relative mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-14 md:px-16 md:py-20 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex flex-col items-start gap-6">
              <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" className="h-9 w-auto md:h-11" />
              <h1 className="display text-[clamp(2.4rem,6vw,5rem)]">Únete al <span className="txt-oro">Club Fan</span></h1>
              <p className="lead max-w-xl">Hola, {nombre}. Aquí vive todo lo que no se ve desde la butaca. Es gratis: te damos tu número de socio y tu credencial.</p>
              <ul className="grid w-full max-w-xl gap-3 sm:grid-cols-3">
                {BENEFICIOS.map(([t, d]) => (
                  <li key={t} className="flex flex-col gap-1 rounded-[18px] border border-oro/25 p-4">
                    <strong className="text-sm text-oro-claro">{t}</strong>
                    <span className="text-[12.5px] text-texto-3">{d}</span>
                  </li>
                ))}
              </ul>
              <UnirseClub />
            </div>
            <div aria-hidden="true" className="opacity-60 blur-[1px]">
              <Credencial nombre="Tu nombre" c={{ numero: 0, desde: new Date(0).toISOString(), fundador: false }} />
            </div>
          </div>
        </section>
        <Anuncios lugar="fanzone" pid={pid} tono="fanzone" eyebrow="Solo para la comunidad" titulo="Lo que viene" className="mx-auto max-w-[1440px] px-5 pt-14 md:px-16" />
      </main>
    );
  }

  const [items, proximos, encuentros, conteo, proximosTodos, miCredencial] = await Promise.all([listFanzone(pid), getProximos(pid), getEncuentros(pid), fanzoneCounts(), pid ? getProximos(null) : Promise.resolve(null), getMiCredencialFan()]);
  const visibles = items.filter((i) => i.visible);
  const pestana = (PESTANAS.find((p) => p === cat) ?? "todo") as FanCategoria | "todo";
  const lista = pestana === "todo" ? visibles : visibles.filter((i) => i.categoria === pestana);
  const vienen = pestana === "todo" ? proximos : proximos.filter((p) => p.categoria === pestana);
  // Las píldoras salen de todas las obras con contenido (no solo de la elegida).
  const conContenido = new Set([...conteo.keys(), ...(proximosTodos ?? proximos).map((p) => p.production_id)]);
  const pildoras = productions.filter((p) => conContenido.has(p.id) || p.id === pid);
  // Doble filtro: obra (ruta) + tipo (?cat=). Cada liga conserva el otro filtro.
  const liga = (obra: string | null, c: FanCategoria | "todo") => `${obra ? `/fan-zone/${obra}` : "/fan-zone"}${c === "todo" ? "" : `?cat=${c}`}`;

  return (
    <main className="pb-24">
      {/* Logo Fan Zone y saludo a la izquierda; la credencial a la derecha. */}
      <section className="relative overflow-hidden border-b border-oro/25 bg-[#08070c]">
        <div aria-hidden="true" className="cono-oro absolute -top-64 left-[55%] h-[900px] w-[700px]" />
        <div aria-hidden="true" className="absolute -left-40 bottom-0 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgb(131_8_134/0.35),transparent_65%)]" />
        <div className="relative mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-12 md:px-16 md:py-16 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex flex-col items-start gap-5">
            <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" className="h-9 w-auto md:h-11" />
            <h1 className="display text-[clamp(2.2rem,5.5vw,4.25rem)]">Hola, {nombre.split(" ")[0]}</h1>
            <p className="lead max-w-xl">Aquí vive todo lo que no se ve desde la butaca: ensayos, making of, fotos con el elenco y tu acceso anticipado.</p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <Credencial nombre={nombre} c={credencial} />
            {miCredencial && <MiCredencialFan c={miCredencial} compacto />}
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1440px] flex-col gap-14 px-5 pt-10 md:gap-16 md:px-16">
        {/* Producciones */}
        {pildoras.length > 0 && (
          <nav aria-label="Producción" className="flex flex-wrap items-center gap-3">
            <span className="mr-2 text-[11px] font-bold uppercase tracking-[0.28em] text-texto-3">Producción</span>
            <Link href={liga(null, pestana)} scroll={false} aria-current={!pid ? "page" : undefined} className={`chip ${!pid ? "chip-fz" : "hover:border-oro/60"}`}>Todas</Link>
            {pildoras.map((p) => (
              <Link key={p.id} href={liga(p.id, pestana)} scroll={false} aria-current={p.id === pid ? "page" : undefined} className={`chip uppercase tracking-[0.08em] ${p.id === pid ? "chip-fz" : "hover:border-oro/60"}`}>
                {p.nombre}{p.temporada ? ` ${p.temporada}` : ""}
              </Link>
            ))}
          </nav>
        )}

        <PreventaFanZone pid={pid} />

        <Anuncios lugar="fanzone" pid={pid} tono="fanzone" eyebrow="Solo para la comunidad" titulo="Anuncios" />

        {/* Lo nuevo para ti */}
        <section aria-labelledby="nuevo-t" className="flex flex-col gap-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-3">
              <p className="eyebrow">Detrás del telón{obraActual ? ` · ${obraActual.nombre}` : ""}</p>
              <h2 id="nuevo-t" className="h2-seccion">Lo nuevo para ti</h2>
            </div>
            <nav aria-label="Categorías" className="-mx-1 flex gap-1 overflow-x-auto px-1">
              {PESTANAS.map((p) => (
                <Link
                  key={p}
                  href={liga(pid, p)}
                  scroll={false}
                  aria-current={pestana === p ? "page" : undefined}
                  className={`shrink-0 border-b-2 px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.16em] ${pestana === p ? "border-oro text-texto" : "border-transparent text-texto-3 hover:text-texto"}`}
                >
                  {p === "todo" ? "Todo" : FAN_CATEGORIAS[p]}
                </Link>
              ))}
            </nav>
          </div>
          {(pid || pestana !== "todo") && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-texto-3">
              Mostrando:
              {pestana !== "todo" && (
                <Link href={liga(pid, "todo")} scroll={false} className="chip chip-oro min-h-[28px]" aria-label={`Quitar filtro ${FAN_CATEGORIAS[pestana]}`}>{FAN_CATEGORIAS[pestana]} <span aria-hidden="true">×</span></Link>
              )}
              {obraActual && (
                <Link href={liga(null, pestana)} scroll={false} className="chip chip-oro min-h-[28px]" aria-label={`Quitar filtro ${obraActual.nombre}`}>{obraActual.nombre} <span aria-hidden="true">×</span></Link>
              )}
            </p>
          )}
          {lista.length + vienen.length === 0 ? (
            <div className="tarjeta flex flex-col items-start gap-3 border-oro/20 p-8 text-texto-2">
              <p>
                {pestana !== "todo" && obraActual
                  ? `No hay ${FAN_CATEGORIAS[pestana].toLowerCase()} de ${obraActual.nombre} todavía.`
                  : "Muy pronto habrá contenido aquí. Te avisamos en tu cuenta cuando se publique algo nuevo."}
              </p>
              {pestana !== "todo" && obraActual && <Link href={liga(pid, "todo")} scroll={false} className="font-bold text-oro-claro underline">Ver todo lo de {obraActual.nombre}</Link>}
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((it) => <li key={it.id}><FanItemCard it={it} obra={pid ? undefined : obraDe.get(it.production_id)} /></li>)}
              {vienen.map((p) => <li key={p.id}><FanProximoCard p={p} obra={pid ? undefined : obraDe.get(p.production_id)} /></li>)}
            </ul>
          )}
        </section>

        {/* Eventos del Club Fan: foto con el elenco y eventos exclusivos (0080) */}
        <section aria-labelledby="foto-t" className="grid gap-8 rounded-[22px] border border-oro/25 bg-[#120f17] p-6 md:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col items-start gap-4">
            <span className="chip chip-fz min-h-[26px] px-3 text-[10px] uppercase tracking-[0.14em]">Experiencia fan</span>
            <h2 id="foto-t" className="text-[clamp(1.8rem,3.4vw,2.5rem)] font-black uppercase leading-[0.95] tracking-[-0.03em]">Eventos del Club Fan</h2>
            <p className="max-w-md text-[15px] leading-relaxed text-texto-2">Foto con el elenco, tours, meet & greets y transmisiones exclusivas. Aparta tu lugar cuando lo pida y en la entrada muestra tu credencial con QR.</p>
            {miCredencial && <MiCredencialFan c={miCredencial} compacto />}
            <Link href="/eventos" className="text-sm font-bold text-oro-claro underline">Ver todos los eventos →</Link>
          </div>
          {encuentros.length ? (
            <ul className="flex flex-col gap-3">
              {encuentros.map((e) => <EncuentroCard key={e.id} e={e} sesion socio mostrarObra={!pid} />)}
            </ul>
          ) : (
            <p className="self-center text-sm text-texto-3">Todavía no hay eventos abiertos. Te avisaremos en los anuncios de la Fan Zone.</p>
          )}
        </section>
      </div>
    </main>
  );
}
