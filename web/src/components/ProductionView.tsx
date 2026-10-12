/* eslint-disable @next/next/no-img-element -- logos del kit y fotos desde Storage */
import Image from "next/image";
import Link from "next/link";
import { Anuncios } from "@/components/anuncios/Anuncios";
import { Compartir } from "@/components/Compartir";
import { CastGrid, Ensemble, TeamGroups } from "@/components/Credits";
import { CuentaRegresiva } from "@/components/CuentaRegresiva";
import { HeroBackdrop, ProductionLogo } from "@/components/PosterArt";
import { ProductionBanner } from "@/components/ProductionBanner";
import { YouTube } from "@/components/YouTube";
import { listOpenAuditionsFor } from "@/lib/auditions";
import { getPublicBanner } from "@/lib/banner";
import { fechaEstreno } from "@/lib/cuenta-regresiva";
import { enPreventa, ETIQUETA_FUNCION, estadoFuncion, partesFuncion } from "@/lib/disponibilidad";
import { isDev } from "@/lib/env";
import { fanzoneCount, getCredencial } from "@/lib/fanzone";
import { estadoPublico } from "@/lib/home-rules";
import { getProductionContent } from "@/lib/production-content";
import { getProgram } from "@/lib/program";
import { withSeller } from "@/lib/seller-rules";
import {
  formatPrice,
  getGallery,
  getProduction,
  getTheme,
  performanceOccupancy,
  themeStyle,
} from "@/lib/productions";

// Plantilla única de la página de obra (pública y vista previa del panel), con la guía de UI.
// Todo sale de la base: venta (funciones, precios, cupo) y contenido (migración 0029).
// Usa los colores de cada obra (tema claro u oscuro); el botón de compra conserva la luz DARF.

function Titulo({ id, eyebrow, children }: { id: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.32em] text-obra-acento before:h-px before:w-8 before:bg-current">{eyebrow}</p>
      <h2 id={`${id}-t`} className="text-[clamp(2rem,4.4vw,3.25rem)] font-black uppercase leading-[0.95] tracking-[-0.04em]">{children}</h2>
    </div>
  );
}

function Bloque({ id, eyebrow, titulo, children, className = "" }: { id: string; eyebrow: string; titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className={`flex scroll-mt-24 flex-col gap-8 ${className}`}>
      <Titulo id={id} eyebrow={eyebrow}>{titulo}</Titulo>
      {children}
    </section>
  );
}

export async function ProductionView({
  data,
  vendedor = null,
  vistaPrevia = false,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getProduction>>>;
  vendedor?: string | null;
  /** En la vista previa del panel hay una barra amarilla fija arriba. */
  vistaPrevia?: boolean;
}) {
  const { production: p, performances, prices } = data;
  const theme = getTheme(p);
  const vendibles = performances.filter((fn) => fn.on_sale && !!fn.starts_at && !p.concluded);
  const [c, gallery, ensayos, audiciones, programa, franja, ocupacion, credencial] = await Promise.all([
    getProductionContent(p.id),
    getGallery(p.id),
    fanzoneCount(p.id),
    listOpenAuditionsFor(p.id),
    getProgram(p.id),
    getPublicBanner(p.id),
    performanceOccupancy(vendibles.map((fn) => fn.id)),
    vendibles.some((fn) => enPreventa(fn)) ? getCredencial() : Promise.resolve(null),
  ]);
  const socio = !!credencial;
  const estadoDe = (id: string) => {
    const o = ocupacion.get(id);
    return o ? estadoFuncion(o.capacidad, o.ocupados) : null;
  };
  // Próxima función que todavía se puede comprar (las funciones vienen en orden de fecha).
  const comprables = vendibles.filter((fn) => estadoDe(fn.id) !== "agotado");
  const proxima = comprables[0] ?? null;
  const desde = prices.length ? Math.min(...prices.map((z) => z.price)) : p.price > 0 ? p.price : null;
  const enVenta = vendibles.length > 0;
  // Antes del estreno, la tarjeta del hero cuenta los días que faltan.
  const estreno = p.concluded ? null : fechaEstreno(performances);

  const canciones = c.actos.reduce((n, a) => n + a.canciones.length, 0);
  const videos = c.videos;
  const equipos = [
    { titulo: "Equipo creativo", items: c.creativo },
    { titulo: "Equipo de producción", items: c.produccion },
    { titulo: "Crew", items: c.crew },
    { titulo: "Equipo técnico", items: c.tecnico },
  ];
  const hayEquipo = equipos.some((g) => g.items.length > 0);
  const ficha = c.ficha;
  const dato = (etiqueta: string) => ficha.find((x) => x.etiqueta === etiqueta)?.valor;
  const duracion = dato("Duración");
  const estado = estadoPublico(p, performances.map((f) => ({ ...f, production_id: p.id })));

  // Funciones primero mientras la obra está viva; en el archivo, primero la historia.
  const base = [
    { id: "sinopsis", label: "Sinopsis", show: c.sinopsis.length > 0 },
    { id: "funciones", label: "Funciones", show: !p.concluded || performances.length > 0 },
    { id: "canciones", label: "Canciones", show: canciones > 0 },
    { id: "elenco", label: "Elenco", show: c.reparto.length + c.ensamble.length > 0 },
    { id: "equipos", label: "Equipos", show: hayEquipo },
    { id: "galeria", label: "Galería", show: gallery.length > 0 },
    { id: "videos", label: "Videos", show: videos.length > 0 },
    { id: "agradecimientos", label: "Agradecimientos", show: c.agradecimientos.length > 0 },
  ];
  if (!p.concluded) base.unshift(...base.splice(1, 1));
  const sections = base.filter((s) => s.show);
  const show = (id: string) => sections.some((s) => s.id === id);

  const funciones = show("funciones") && (
    <Bloque id="funciones" eyebrow={p.concluded ? "Así se presentó" : "Elige tu función"} titulo="Funciones y precios">
      {performances.length === 0 && <p className="opacity-75">Aún no hay funciones registradas.</p>}
      {performances.length > 0 && (
        <ul className="flex flex-col gap-3.5">
          {performances.map((fn) => {
            const vendible = fn.on_sale && !!fn.starts_at && !p.concluded;
            const est = vendible ? estadoDe(fn.id) : null;
            const pre = vendible && enPreventa(fn);
            const agotado = est === "agotado";
            const f = fn.starts_at ? partesFuncion(fn.starts_at) : null;
            return (
              <li
                key={fn.id}
                className={`grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-[18px] border border-current/12 bg-obra-superficie p-4 md:grid-cols-[92px_minmax(0,1fr)_auto_auto] md:gap-x-7 md:px-6 md:py-5 ${agotado ? "opacity-60" : ""}`}
              >
                <div className="grid justify-items-center gap-0.5 border-r border-current/12 py-1.5 md:py-2.5">
                  {f ? (
                    <>
                      <small className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-obra-acento">{f.dia}</small>
                      <b className="num text-[32px] font-black leading-none tracking-[-0.04em] md:text-[40px]">{f.numero}</b>
                      <small className="text-[10.5px] font-bold uppercase tracking-[0.2em] opacity-70">{f.mes}</small>
                    </>
                  ) : (
                    <b className="text-2xl font-black">—</b>
                  )}
                </div>
                <div className="grid min-w-0 gap-1">
                  <strong className="text-lg font-extrabold md:text-xl">{f ? f.hora : "Fecha por anunciar"}</strong>
                  <span className="text-[12.5px] leading-snug opacity-75">
                    {fn.venue ?? p.venue}
                    {duracion && <> · Duración aprox. {duracion}</>}
                  </span>
                  {pre && fn.preventa_hasta && (() => { const h = partesFuncion(fn.preventa_hasta); return <span className="text-[12.5px] font-semibold text-obra-acento">Preventa Club Fan hasta el {h.dia} {h.numero} {h.mes}, {h.hora}</span>; })()}
                </div>
                <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 md:contents">
                  {pre ? (
                    <span className="chip chip-fz">Preventa Fan Zone</span>
                  ) : vendible ? (
                    est ? (
                      <span className="chip chip-obra">
                        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ETIQUETA_FUNCION[est].punto}`} />
                        {ETIQUETA_FUNCION[est].texto}
                      </span>
                    ) : (
                      <span aria-hidden="true" />
                    )
                  ) : (
                    <span className="chip chip-obra">{p.concluded ? "Concluida" : "Próximamente"}</span>
                  )}
                  {vendible && !agotado && (
                    pre ? (
                      socio ? (
                        <Link href={withSeller(`/comprar/${fn.id}`, vendedor)} className="fb fb-fz fb-sm ml-auto md:ml-0">Entrar a preventa</Link>
                      ) : (
                        <Link href="/fan-zone" className="fb fb-fz fb-sm ml-auto md:ml-0">Únete al Club Fan</Link>
                      )
                    ) : (
                      <Link href={withSeller(`/comprar/${fn.id}`, vendedor)} className="fb fb-luz fb-sm ml-auto md:ml-0">Elegir asientos</Link>
                    )
                  )}
                  {(!vendible || agotado) && <span aria-hidden="true" className="hidden md:block" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {prices.length > 0 && (
        <div className="rounded-[22px] border border-current/12 bg-obra-superficie px-6 py-6 md:px-9 md:py-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-[22px] font-extrabold tracking-[-0.02em]">Zonas</h3>
            {proxima && (
              <Link href={withSeller(`/comprar/${proxima.id}`, vendedor)} className="text-[13px] font-bold text-obra-acento hover:underline">
                Ver mapa del teatro →
              </Link>
            )}
          </div>
          <ul>
            {prices.map((z) => (
              <li key={z.nombre} className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-4 border-b border-current/12 px-1 py-4 last:border-0">
                <i aria-hidden="true" className="h-3.5 w-3.5 rounded-[4px] border border-current/20" style={{ background: z.color ?? "currentColor" }} />
                <span className="text-[15px] font-semibold">{z.nombre}</span>
                <strong className="num text-[17px]">{formatPrice(z.price)}</strong>
              </li>
            ))}
          </ul>
          <p className="pt-4 text-[12.5px] opacity-70">Precios en pesos mexicanos.</p>
        </div>
      )}
    </Bloque>
  );

  const sinopsis = show("sinopsis") && (
    <Bloque id="sinopsis" eyebrow="Sinopsis" titulo="La historia">
      {/* El primer párrafo va grande, como la frase gancho de la guía. */}
      {c.sinopsis.map((t, i) =>
        i === 0 ? (
          <p key={i} className="max-w-4xl text-[clamp(1.3rem,2.4vw,1.75rem)] font-bold leading-[1.35] tracking-[-0.02em]">{t}</p>
        ) : (
          <p key={i} className="max-w-3xl text-[17px] leading-relaxed opacity-90">{t}</p>
        ),
      )}
    </Bloque>
  );

  const repertorio = show("canciones") && (
    <Bloque id="canciones" eyebrow="Repertorio" titulo="Canciones">
      <div className="grid gap-8 sm:grid-cols-2">
        {c.actos.map((a, i) => {
          // Numeración continua entre actos (Acto II sigue donde terminó el Acto I).
          const inicio = c.actos.slice(0, i).reduce((n, x) => n + x.canciones.length, 0);
          return (
            <div key={i}>
              {a.nombre && <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-obra-acento">{a.nombre}</p>}
              <ol className="flex flex-col">
                {a.canciones.map((song, j) => (
                  <li key={j} className="flex gap-4 border-b border-current/12 py-3">
                    <span className="num w-6 text-sm font-bold text-obra-acento">{String(inicio + j + 1).padStart(2, "0")}</span>
                    <span>{song}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </Bloque>
  );

  return (
    <main style={themeStyle(theme)} className={`min-h-dvh bg-obra-fondo text-obra-texto ${enVenta ? "pb-32 md:pb-16" : "pb-16"}`}>
      {/* Hero: ambiente a sangre, degradado desde la izquierda, cono de luz y grano. */}
      <section className="relative flex min-h-[560px] overflow-hidden md:min-h-[780px]">
        {theme && <HeroBackdrop theme={theme} />}
        <div aria-hidden="true" className="cono absolute -top-40 left-[52%] hidden h-[1000px] w-[760px] opacity-90 lg:block" />
        <div aria-hidden="true" className="grano absolute inset-0" />
        <div className="relative mx-auto grid w-full max-w-[1440px] items-end gap-10 px-5 pb-14 pt-16 md:px-16 md:pb-[88px] lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16">
          <div className="flex max-w-[640px] flex-col items-start gap-6 md:gap-7">
            <p className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.32em] text-obra-acento before:h-px before:w-8 before:bg-current">
              {p.concluded ? "Archivo · DARF Productions" : "DARF Productions presenta"}
            </p>
            {theme ? <ProductionLogo theme={theme} nombre={p.nombre} priority /> : <h1 className="titular text-5xl md:text-7xl">{p.nombre}</h1>}
            {theme?.tagline && <p className="text-lg font-medium leading-snug md:text-2xl">{theme.tagline}</p>}
            <ul className="flex flex-wrap gap-2">
              <li className="chip chip-obra">{{ archivo: "Producción concluida", cartelera: "En cartelera", proximamente: "Próximamente" }[estado]}</li>
              {p.temporada && <li className="chip chip-obra"><span className="text-obra-acento">✦</span>Temporada {p.temporada}</li>}
              {p.venue && <li className="chip chip-obra">{p.venue}</li>}
              {duracion && <li className="chip chip-obra">{duracion}</li>}
            </ul>
            <div className="flex flex-wrap gap-3 pt-1">
              {enVenta && <a href="#funciones" className="fb fb-luz">Comprar boletos</a>}
              {videos.length > 0 && (
                <a href="#videos" className="fb fb-obra">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
                  Ver tráiler
                </a>
              )}
              {audiciones.length > 0 && (
                <Link href={audiciones.length === 1 ? `/audiciones/${audiciones[0].id}` : "/audiciones"} className="fb fb-obra">Audiciones abiertas</Link>
              )}
              {programa.page?.publicado && <a href={`/programa/${p.id}`} className="fb fb-obra">Programa de mano</a>}
              {ensayos > 0 && <Link href={`/fan-zone/${p.id}`} className="fb fb-fz">Fan Zone</Link>}
              {!vistaPrevia && <Compartir titulo={p.nombre} texto={`${p.nombre} · DARF Productions`} ruta={`/producciones/${p.id}`} />}
            </div>
          </div>

          {/* Próxima función y precio, en vidrio (solo computadora; en celular está la barra de abajo). */}
          {(estreno || proxima?.starts_at) && (
            <a href="#funciones" className={`glass gap-4 p-6 text-texto transition-colors hover:border-white/30 lg:grid ${estreno ? "grid" : "hidden"}`}>
              <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-oro">{estreno ? "Estreno en" : "Próxima función"}</span>
              {estreno ? <CuentaRegresiva hasta={estreno} /> : proxima?.starts_at && <ProximaFecha iso={proxima.starts_at} sede={proxima.venue ?? p.venue} />}
              {desde !== null && (
                <>
                  <hr className="border-linea-2" />
                  <span className="flex items-center justify-between">
                    <span className="text-[12.5px] text-texto-3">Boletos desde</span>
                    <strong className="num txt-oro text-[26px] font-black">{formatPrice(desde)}</strong>
                  </span>
                </>
              )}
            </a>
          )}
        </div>
      </section>

      {franja && <ProductionBanner banner={franja} acento={theme?.acento ?? "#a48bff"} />}

      {/* Subnavegación fija: secciones y, en computadora, logo, precio y compra. */}
      {sections.length > 1 && (
        <nav aria-label="Secciones de la obra" className={`sticky z-20 border-b border-current/12 bg-obra-fondo/85 backdrop-blur-[16px] ${vistaPrevia ? "top-9" : "top-0"}`}>
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-6 px-5 md:h-[72px] md:px-16">
            <ul className="-mx-2 flex min-w-0 gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
              {sections.map((s) => (
                <li key={s.id} className="shrink-0">
                  <a href={`#${s.id}`} className="inline-flex h-10 items-center rounded-full px-4 text-[12.5px] font-semibold opacity-85 transition hover:bg-current/8 hover:opacity-100">{s.label}</a>
                </li>
              ))}
            </ul>
            {enVenta && (
              <div className="hidden shrink-0 items-center gap-4 md:flex">
                {theme && <Image src={theme.logo} alt="" width={120} height={30} style={{ height: 30, width: "auto" }} className="max-w-[140px] object-contain" />}
                {desde !== null && <span className="text-[12.5px] opacity-75">Desde <strong className="num opacity-100">{formatPrice(desde)}</strong></span>}
                <a href="#funciones" className="fb fb-luz fb-sm">Boletos</a>
              </div>
            )}
          </div>
        </nav>
      )}

      {/* Anuncios de la obra (revelación del elenco, fechas…), si hay. */}
      <Anuncios lugar="obra" pid={p.id} tono="obra" eyebrow="Novedades de la obra" className="mx-auto max-w-[1440px] px-5 pt-14 md:px-16 md:pt-20" />

      {/* Funciones, historia y canciones con la ficha fija a la derecha. */}
      <div className="mx-auto grid max-w-[1440px] items-start gap-12 px-5 pt-14 md:px-16 md:pt-24 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-16 md:gap-24">
          {p.concluded ? <>{sinopsis}{funciones}</> : <>{funciones}{sinopsis}</>}
          {repertorio}
          {!c.sinopsis.length && !canciones && (
            <p className="rounded-[22px] border border-current/12 bg-obra-superficie p-6 opacity-85">
              La sinopsis, las canciones y el elenco de esta producción se publicarán pronto.
            </p>
          )}
        </div>

        <aside className={`flex flex-col gap-4 lg:sticky ${vistaPrevia ? "lg:top-[120px]" : "lg:top-24"}`}>
          {ficha.length > 0 && (
            <div className="rounded-[22px] border border-current/12 bg-obra-superficie p-7">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.32em] text-obra-acento">Ficha</p>
              <dl>
                {ficha.map((x) => (
                  <div key={x.etiqueta} className="flex justify-between gap-4 border-b border-current/12 py-3 text-sm last:border-0">
                    <dt className="opacity-70">{x.etiqueta}</dt>
                    <dd className="text-right font-bold">{x.valor}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/producciones" className="mt-4 block text-[13px] font-bold text-obra-acento hover:underline">← Todas las producciones</Link>
            </div>
          )}
          <Link
            href={ensayos > 0 ? `/fan-zone/${p.id}` : "/fan-zone"}
            className="tarjeta-hover grid gap-3 rounded-[22px] border border-oro/35 p-6 text-texto"
            style={{ background: "radial-gradient(80% 100% at 100% 0%, rgb(215 187 95 / 0.25), transparent 60%), #120f17" }}
          >
            <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" className="h-[30px] w-auto justify-self-start" />
            <strong className="text-[17px]">{ensayos > 0 ? "Detrás del telón" : "Siempre en primera fila"}</strong>
            <span className="text-[12.5px] leading-relaxed text-texto-3">
              {ensayos > 0 ? <>Ensayos y videos de esta obra en la <b className="txt-oro">Fan Zone</b>.</> : <>Ensayos, videos y galerías de cada producción en la <b className="txt-oro">Fan Zone</b>.</>}
            </span>
            <span className="fb fb-fz fb-sm mt-1 justify-self-start">{ensayos > 0 ? "Entrar a la Fan Zone" : "Únete a la Fan Zone"}</span>
          </Link>
          {!ficha.length && (
            <Link href="/producciones" className="px-1 text-[13px] font-bold text-obra-acento hover:underline">← Todas las producciones</Link>
          )}
        </aside>
      </div>

      {/* Elenco, equipos, galería, videos y agradecimientos a todo lo ancho. */}
      <div className="mx-auto flex max-w-[1440px] flex-col gap-16 px-5 pt-16 md:gap-24 md:px-16 md:pt-24">
        {show("elenco") && (
          <Bloque id="elenco" eyebrow="En escena · Jóvenes para jóvenes" titulo="Elenco">
            {c.reparto.length > 0 && <CastGrid reparto={c.reparto} />}
            {c.ensamble.length > 0 && <Ensemble items={c.ensamble} />}
          </Bloque>
        )}

        {show("equipos") && (
          <section id="equipos" aria-labelledby="equipos-t" className="grid scroll-mt-24 gap-8 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-16">
            <Titulo id="equipos" eyebrow="Detrás de la obra">Equipos</Titulo>
            <TeamGroups groups={equipos} />
          </section>
        )}

        {show("galeria") && (
          <Bloque id="galeria" eyebrow="Así se vivió" titulo="Galería">
            <ul className="grid auto-rows-[150px] grid-cols-2 gap-3 md:auto-rows-[210px] md:grid-cols-4">
              {gallery.map((ph, i) => (
                <li key={ph.id} className={`overflow-hidden rounded-[18px] ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
                  <img src={ph.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.04]" />
                </li>
              ))}
            </ul>
            {ensayos > 0 && <Link href={`/fan-zone/${p.id}`} className="fb fb-fz fb-sm self-start">Más en la Fan Zone</Link>}
          </Bloque>
        )}

        {show("videos") && (
          <Bloque id="videos" eyebrow="Mira" titulo="Videos">
            <div className="grid gap-6 sm:grid-cols-2">
              {videos.map((v) => <YouTube key={v.youtube} id={v.youtube} title={v.titulo} />)}
            </div>
          </Bloque>
        )}

        {show("agradecimientos") && (
          <Bloque id="agradecimientos" eyebrow="Gracias" titulo="Agradecimientos">
            <ul className="grid gap-x-10 gap-y-2 opacity-90 sm:grid-cols-2">{c.agradecimientos.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </Bloque>
        )}
      </div>

      {/* Celular: barra fija abajo con el precio y la compra (arriba de la franja DEV). */}
      {enVenta && (
        <div className={`glass fixed inset-x-2 z-30 flex items-center justify-between gap-3 rounded-[20px] py-2.5 pl-5 pr-2.5 text-texto md:hidden ${isDev ? "bottom-9" : "bottom-2"}`}>
          <span className="text-[12.5px] text-texto-3">
            {desde !== null ? <>Desde <strong className="num block text-lg font-black text-texto">{formatPrice(desde)}</strong></> : "Boletos a la venta"}
          </span>
          <a href="#funciones" className="fb fb-luz fb-sm">Comprar boletos</a>
        </div>
      )}
    </main>
  );
}

function ProximaFecha({ iso, sede }: { iso: string; sede: string | null }) {
  const f = partesFuncion(iso);
  return (
    <span className="flex items-center gap-4">
      <span className="grid justify-items-center border-r border-linea-2 pr-4">
        <small className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-oro">{f.dia}</small>
        <b className="num text-[44px] font-black leading-none tracking-[-0.04em]">{f.numero}</b>
        <small className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-texto-3">{f.mes}</small>
      </span>
      <span className="grid gap-1">
        <strong className="text-xl font-extrabold">{f.hora}</strong>
        {sede && <span className="text-[12.5px] text-texto-3">{sede}</span>}
      </span>
    </span>
  );
}
