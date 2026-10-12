/* eslint-disable @next/next/no-img-element -- logos SVG del kit de marca y retratos desde Storage */
import Link from "next/link";
import { Anuncios } from "@/components/anuncios/Anuncios";
import { CuentaRegresiva } from "@/components/CuentaRegresiva";
import { ProductionBanner } from "@/components/ProductionBanner";
import { getPublicSiteBanner } from "@/lib/banner";
import { EstadoObra } from "@/components/EstadoObra";
import { ArtFill } from "@/components/PosterArt";
import { ProductionCard } from "@/components/ProductionCard";
import { ETIQUETA_ESTADO, type EstadoPublico } from "@/lib/home-rules";
import { formatPrice, getHomeData, getTheme, perfilUrl } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

type Miembro = { id: string; nombre: string; retrato_path: string | null };

const FILTROS: (EstadoPublico | "todas")[] = ["todas", "cartelera", "proximamente", "archivo"];
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

// Portada (guía de UI · Fusión): habla con la voz de DARF; la obra destacada es invitada.
// Destacada = la elegida en el panel o la de cartelera con la función más cercana;
// si no hay cartelera, la próxima; si no, la más reciente del archivo (home-rules.ts).
export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ productions, featured }, equipoRes, franja] = await Promise.all([getHomeData(), supabase.rpc("team_public"), getPublicSiteBanner()]);
  const equipo = ((equipoRes.data ?? []) as Miembro[]).slice(0, 5);
  const current = featured?.production ?? null;
  const enCartelera = featured?.mode === "cartelera";
  const proxima = featured?.mode === "proximamente";
  const currentTheme = current ? getTheme(current) : null;

  const filtro = (FILTROS.find((f) => f === sp.estado) ?? "todas") as EstadoPublico | "todas";
  const hay = new Set(productions.map((p) => p.estadoPublico));
  const lista = filtro === "todas" ? productions : productions.filter((p) => p.estadoPublico === filtro);

  return (
    <main className="relative overflow-hidden">
      {/* ── HERO: texto + tarjeta destacada, sobre los haces de luz ── */}
      <section id="cartelera" className="relative">
        <div aria-hidden="true" className="haz absolute inset-0" />
        <div aria-hidden="true" className="cono absolute -top-52 left-[18%] hidden h-[1100px] w-[900px] lg:block" />
        <div aria-hidden="true" className="grano absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1440px] gap-12 px-5 pb-16 pt-12 md:px-16 md:pb-24 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="flex flex-col items-start gap-7">
            <span className="sello-jpj"><b aria-hidden="true">✦</b>Jóvenes para jóvenes</span>
            <h1 className="display">Teatro con <span className="txt-luz">luz propia</span></h1>
            <p className="lead max-w-xl">
              Producciones, funciones y comunidad en un solo lugar. Descubre lo que está en cartelera, revive el archivo y sé parte del elenco.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/producciones" className="fb fb-claro">Ver producciones</Link>
              <Link href="/fan-zone" className="fb fb-fz">Únete a la Fan Zone</Link>
            </div>
            {equipo.length > 0 && (
              <Link href="/nosotros" className="flex items-center gap-4 pt-2">
                <span className="flex -space-x-3">
                  {equipo.map((m) =>
                    m.retrato_path ? (
                      <img key={m.id} src={perfilUrl(m.retrato_path)} alt="" title={m.nombre} className="h-11 w-11 rounded-full object-cover ring-2 ring-sala" />
                    ) : (
                      <span key={m.id} title={m.nombre} className="ava h-11 w-11 text-[13px] ring-2 ring-sala">{iniciales(m.nombre)}</span>
                    ),
                  )}
                </span>
                <span className="text-[12.5px] leading-snug text-texto-3"><b className="text-texto">Hecho por jóvenes.</b> Un equipo que sube el estándar en cada temporada.</span>
              </Link>
            )}
          </div>

          {current && (
            <article className="rounded-[30px] bg-[linear-gradient(140deg,rgb(215_187_95/0.7),rgb(131_8_134/0.6)_55%,rgb(255_255_255/0.08))] p-px shadow-[0_40px_100px_-30px_rgb(131_8_134/0.6)]">
              <div className="overflow-hidden rounded-[29px] bg-telon" style={{ background: currentTheme?.superficie }}>
                <div className="relative aspect-[16/10] overflow-hidden">
                  {currentTheme ? (
                    <ArtFill theme={currentTheme} alt={current.nombre} sizes="(min-width: 1024px) 45vw, 100vw" />
                  ) : (
                    <h2 className="titular absolute inset-x-6 bottom-6 text-4xl">{current.nombre}</h2>
                  )}
                  <EstadoObra
                    estado={current.estadoPublico}
                    texto={enCartelera ? "Ahora en cartelera" : proxima ? "Próximamente" : "Lo último que presentamos"}
                    className="absolute left-4 top-4"
                  />
                  {current.temporada && <span className="chip chip-oro absolute right-4 top-4 bg-sala/60 backdrop-blur">Temporada {current.temporada}</span>}
                </div>
                <div className="flex flex-col gap-5 p-6 md:p-7">
                  <ul className="flex flex-wrap gap-2">
                    {current.venue && <li className="chip">{current.venue}</li>}
                    {enCartelera && current.price > 0 && <li className="chip num">Desde {formatPrice(current.price)}</li>}
                    {!enCartelera && <li className="chip">{proxima ? "Boletos muy pronto" : "Archivo"}</li>}
                  </ul>
                  {current.estreno && (
                    <div className="flex flex-col gap-3 rounded-[18px] border border-linea-2 bg-sala/40 p-4">
                      <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-oro">Estreno en</span>
                      <CuentaRegresiva hasta={current.estreno} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {enCartelera && <Link href={`/producciones/${current.id}#funciones`} className="fb fb-luz flex-1">Comprar boletos</Link>}
                    <Link href={`/producciones/${current.id}`} className={`fb fb-oro ${enCartelera ? "" : "flex-1"}`}>
                      {enCartelera || proxima ? "Conocer la obra" : "Revivir la obra"}
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          )}
        </div>
      </section>

      {/* Franja del sitio (se edita en Panel → Ajustes → Sitio) y anuncios del inicio. */}
      {franja && <ProductionBanner banner={franja} acento="#830886" />}
      <Anuncios lugar="inicio" tono="sitio" className="mx-auto max-w-[1440px] px-5 py-16 md:px-16 md:py-20" />

      {/* ── MANIFIESTO: Jóvenes para jóvenes ── */}
      <section aria-labelledby="jpj" className="relative border-y border-linea py-20 md:py-28">
        <div aria-hidden="true" className="haz absolute inset-0 opacity-50" />
        <h2 id="jpj" className="relative mx-auto max-w-[1440px] px-5 text-[clamp(3.6rem,13vw,11.5rem)] font-black uppercase leading-[0.82] tracking-[-0.06em] md:px-16">
          <span className="block">Jóvenes <span className="hueca">para</span></span>
          <span className="block txt-luz">jóvenes</span>
        </h2>
        <ol className="relative mx-auto mt-14 grid max-w-[1440px] gap-10 px-5 md:grid-cols-3 md:px-16">
          {[
            ["Hecho por jóvenes", "En escena, en la dirección y detrás del telón. Aquí el talento joven lleva la obra completa."],
            ["Pensado para jóvenes", "Historias, música y energía que conectan con su generación, y que también disfruta toda la familia."],
            ["Con estándar profesional", "Formación, ensayos y producción al nivel de un gran musical. Jóvenes que se toman el teatro en serio."],
          ].map(([t, d], i) => (
            <li key={t} className="flex flex-col gap-3 border-t border-linea pt-6">
              <span className="eyebrow">0{i + 1}</span>
              <p className="text-xl font-extrabold">{t}</p>
              <p className="text-[15px] leading-relaxed text-texto-2">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── PRODUCCIONES: rejilla 2 x 2 con filtros ── */}
      <section id="producciones" aria-labelledby="producciones-t" className="relative mx-auto flex max-w-[1440px] scroll-mt-6 flex-col gap-8 px-5 py-20 md:px-16 md:py-28">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3">
            <p className="eyebrow">Nuestro repertorio</p>
            <h2 id="producciones-t" className="h2-seccion">Producciones</h2>
          </div>
          <nav aria-label="Filtrar producciones" className="flex flex-wrap gap-2">
            {FILTROS.filter((f) => f === "todas" || hay.has(f)).map((f) => (
              <Link
                key={f}
                href={f === "todas" ? "/#producciones" : `/?estado=${f}#producciones`}
                scroll={false}
                aria-current={filtro === f ? "page" : undefined}
                className={`chip ${filtro === f ? "chip-on" : "hover:border-white/40"}`}
              >
                {f === "todas" ? "Todas" : ETIQUETA_ESTADO[f]}
              </Link>
            ))}
          </nav>
        </div>
        {lista.length === 0 ? (
          <p className="tarjeta p-6 text-texto-2">No hay producciones en esta sección por ahora.</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2">
            {lista.map((p) => <li key={p.id}><ProductionCard p={p} /></li>)}
          </ul>
        )}
      </section>

      {/* ── FAN ZONE (oro) + AUDICIONES (luz) ── */}
      <section className="relative mx-auto grid max-w-[1440px] gap-6 px-5 md:px-16 lg:grid-cols-[1.25fr_0.75fr]">
        <Link href="/fan-zone" id="fan-zone" className="tarjeta-hover group relative flex min-h-[420px] overflow-hidden rounded-[28px] border border-oro/40 bg-[#08070c] shadow-[0_0_80px_-30px_rgb(215_187_95/0.45)]">
          <div aria-hidden="true" className="cono-oro absolute -top-40 left-1/3 h-[900px] w-[700px]" />
          <div className="relative flex flex-1 flex-col items-start justify-end gap-5 p-8 md:p-11">
            <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" className="h-9 w-auto md:h-11" />
            <h2 className="h2-seccion">Detrás<br />del <span className="txt-oro">telón</span></h2>
            <p className="max-w-md text-[15px] leading-relaxed text-texto-2">Ensayos, videos y galerías de cada producción, solo para quienes siempre están en primera fila.</p>
            <span className="fb fb-fz">Entrar a la Fan Zone</span>
          </div>
          <img src="/marca/sello-club.svg" alt="" aria-hidden="true" className="relative hidden w-[38%] max-w-[260px] self-center p-6 opacity-90 md:block" />
        </Link>
        <Link href="/audiciones" id="audiciones" className="tarjeta-hover luz-darf relative flex min-h-[420px] flex-col items-start justify-end gap-5 overflow-hidden rounded-[28px] p-8 md:p-11">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-white/85">Audiciones</p>
          <h2 className="h2-seccion">Únete<br />al elenco</h2>
          <p className="max-w-sm text-[15px] leading-relaxed text-white/90">Convocatorias abiertas y registro permanente de talento.</p>
          <span className="fb fb-claro">Ver audiciones</span>
        </Link>
      </section>

      {/* ── NOSOTROS ── */}
      <section aria-labelledby="nosotros-t" className="relative mx-auto max-w-[1440px] px-5 py-20 md:px-16 md:py-28">
        <div className="flex max-w-4xl flex-col items-start gap-7">
          <p id="nosotros-t" className="eyebrow">Nosotros</p>
          <p className="text-[clamp(1.6rem,3.6vw,2.75rem)] font-extrabold leading-[1.15] tracking-[-0.02em]">
            “Somos <span className="txt-luz">jóvenes haciendo teatro para jóvenes</span>, con estándar profesional y para disfrutarse en familia.”
          </p>
          <div aria-hidden="true" className="linea-oro w-full max-w-md" />
          <Link href="/nosotros" className="fb fb-o">Conoce al equipo</Link>
        </div>
      </section>
    </main>
  );
}
