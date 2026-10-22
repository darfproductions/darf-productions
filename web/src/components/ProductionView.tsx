/* eslint-disable @next/next/no-img-element -- logos del kit y fotos desde Storage */
import { BeneficiosZona } from "@/components/BeneficiosZona";
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
import { enPreventa, enPrivada, ETIQUETA_FUNCION, estadoFuncion, partesFuncion, privadaPorAbrir, ventaPorAbrir } from "@/lib/disponibilidad";
import { miPreventaPrivada } from "@/lib/preventa-privada";
import { CodigoPreventa } from "@/components/CodigoPreventa";
import { getPromos } from "@/lib/promos";
import { mejorPromo } from "@/lib/promo-rules";
import { env, isDev } from "@/lib/env";
import { whatsappPedirUrl } from "@/lib/tickets";
import { EncuentroCard } from "@/components/fanzone/EncuentroCard";
import { EventoBloqueado } from "@/components/eventos/EventoBloqueado";
import { getSession } from "@/lib/auth";
import { esSocio } from "@/lib/credencial";
import { fanzoneCount, getEncuentros, getEventosCartelera } from "@/lib/fanzone";
import { estadoPublico } from "@/lib/home-rules";
import { getProductionContent } from "@/lib/production-content";
import { capaVacia, obraConCapa, type Capa } from "@/lib/obra-capa-rules";
import { getProgram } from "@/lib/program";
import { withSeller } from "@/lib/seller-rules";
import { funcionVendible, textosVenta } from "@/lib/ventas-rules";
import {
  formatPerformanceDate,
  formatPrice,
  getGallery,
  getProduction,
  getTheme,
  posterUrl,
  performanceOccupancy,
  themeStyle,
} from "@/lib/productions";
import { Icono } from "@/components/Icono";

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
  capa = {},
}: {
  data: NonNullable<Awaited<ReturnType<typeof getProduction>>>;
  vendedor?: string | null;
  /** En la vista previa del panel hay una barra amarilla fija arriba. */
  vistaPrevia?: boolean;
  /** 0119: cambios aún no públicos encima (los de fans para socios; el borrador en la vista previa). */
  capa?: Capa;
}) {
  const { performances, prices } = data;
  const p = obraConCapa(data.production, capa);
  const theme = getTheme(p);
  const posterPagina = posterUrl(p, "pagina");
  // 0088: una función que ya empezó deja de venderse aunque siga "en venta".
  const vendibles = performances.filter((fn) => funcionVendible(fn, p.concluded));
  const [c, gallery, ensayos, audiciones, programa, franja, ocupacion, socio, eventos, cartelera, sesion, promos] = await Promise.all([
    getProductionContent(p.id, vistaPrevia, capa),
    getGallery(p.id),
    fanzoneCount(p.id),
    listOpenAuditionsFor(p.id),
    getProgram(p.id),
    getPublicBanner(p.id, capa.franja),
    performanceOccupancy(vendibles.map((fn) => fn.id)),
    esSocio(),
    getEncuentros(p.id),
    getEventosCartelera(30),
    getSession(),
    getPromos(p.id),
  ]);
  // 0123: si canjeó un código, sus fechas de preventa privada (el público no las ve).
  const mia = await miPreventaPrivada(p.id, !!sesion);
  // Eventos de esta obra (0081/0082): los que puede abrir y, con candado, los del club o con cuenta.
  const abiertos = new Set(eventos.map((e) => e.id));
  const bloqueados = cartelera.filter((e) => e.production_id === p.id && !abiertos.has(e.id));
  const estadoDe = (id: string) => {
    const o = ocupacion.get(id);
    return o ? estadoFuncion(o.capacidad, o.ocupados) : null;
  };
  // Próxima función que todavía se puede comprar (las funciones vienen en orden de fecha).
  const comprables = vendibles.filter((fn) => estadoDe(fn.id) !== "agotado");
  const proxima = comprables[0] ?? null;
  // 0120: cada obra decide si muestra precios y si se vende en la página o todo por WhatsApp.
  const conPrecios = p.mostrar_precios !== false;
  // 0122: "Solo el sábado 5 de diciembre" en beneficios de algunas funciones.
  const fechasFn = new Map(performances.map((fn) => [fn.id, formatPerformanceDate(fn.starts_at)]));
  const porWhatsApp = p.modo_venta === "whatsapp";
  const tv = textosVenta(p.modo_venta);
  // Botones de compra: en "todo por WhatsApp" van directo a WhatsApp; si no, a las funciones.
  const ligaCompra = porWhatsApp ? whatsappPedirUrl(env.whatsapp, p.nombre, null) || "/contacto" : "#funciones";
  const externa = porWhatsApp ? { target: "_blank", rel: "noopener" } : {};
  const desde = conPrecios && prices.length ? Math.min(...prices.map((z) => z.price)) : null;
  const enVenta = vendibles.length > 0;
  // Antes del estreno, la tarjeta del hero cuenta los días que faltan.
  const estreno = p.concluded ? null : fechaEstreno(performances);

  const canciones = c.actos.reduce((n, a) => n + a.canciones.length, 0);
  const videos = c.videos;
  const equipos = [
    { titulo: "Equipo creativo", items: c.creativo },
    // 0106: el Staff va dentro del equipo de producción, como lista de nombres (igual que Ensamble).
    { titulo: "Equipo de producción", items: c.produccion, staff: c.staff },
    { titulo: "Crew", items: c.crew },
    { titulo: "Equipo técnico", items: c.tecnico },
  ];
  const hayEquipo = equipos.some((g) => g.items.length > 0 || (g.staff?.length ?? 0) > 0);
  const ficha = c.ficha;
  const dato = (etiqueta: string) => ficha.find((x) => x.etiqueta === etiqueta)?.valor;
  const duracion = dato("Duración");
  const estado = estadoPublico(p, performances.map((f) => ({ ...f, production_id: p.id })));

  // Funciones primero mientras la obra está viva; en el archivo, primero la historia.
  const base = [
    { id: "sinopsis", label: "Sinopsis", show: c.sinopsis.length > 0 },
    { id: "funciones", label: "Funciones", show: !p.concluded || performances.length > 0 },
    { id: "eventos", label: "Eventos", show: eventos.length + bloqueados.length > 0 },
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
    <Bloque id="funciones" eyebrow={p.concluded ? "Así se presentó" : "Elige tu función"} titulo={conPrecios ? "Funciones y precios" : "Funciones"}>
      {performances.length === 0 && <p className="opacity-75">Aún no hay funciones registradas.</p>}
      {/* 0123: con preventa (o venta por abrir) se puede usar un código de preventa privada. */}
      {!mia?.acceso && !porWhatsApp && performances.some((fn) => funcionVendible(fn, p.concluded) && (ventaPorAbrir(fn) || enPreventa(fn))) && (
        <div className="mb-4"><CodigoPreventa conSesion={!!sesion} aqui={`/producciones/${p.id}#funciones`} /></div>
      )}
      {performances.length > 0 && (
        <ul className="flex flex-col gap-3.5">
          {performances.map((fn) => {
            const vendible = funcionVendible(fn, p.concluded);
            const est = vendible ? estadoDe(fn.id) : null;
            // 0123: con código, en su preventa privada ya puede elegir (antes que el Club Fan).
            const privada = vendible && enPrivada(fn, mia);
            const privadaAbre = vendible ? privadaPorAbrir(fn, mia) : null;
            const pre = vendible && enPreventa(fn);
            // 0118: la venta (o la preventa) aún no abre; y la promo automática de la función.
            const porAbrir = vendible && ventaPorAbrir(fn) && !privada;
            const promo = vendible ? mejorPromo(promos.get(fn.id)) : null;
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
                  {privada && fn.preventa_desde && (() => { const d = partesFuncion(fn.preventa_desde); return <span className="text-[12.5px] font-semibold text-obra-acento">Preventa privada · tienes acceso hasta el {d.dia} {d.numero} {d.mes}, {d.hora}</span>; })()}
                  {privadaAbre && (() => { const d = partesFuncion(privadaAbre); return <span className="text-[12.5px] font-semibold text-obra-acento">Tu preventa privada abre el {d.dia} {d.numero} {d.mes}, {d.hora}</span>; })()}
                  {porAbrir && fn.preventa_desde && (() => { const d = partesFuncion(fn.preventa_desde); return <span className="text-[12.5px] font-semibold text-obra-acento">{fn.preventa_hasta ? "Preventa Club Fan" : "Venta"} desde el {d.dia} {d.numero} {d.mes}, {d.hora}</span>; })()}
                  {promo && conPrecios && !agotado && <span className="text-[12.5px] font-semibold text-obra-acento">Promo {promo.nombre}: {promo.percent}% de descuento{promo.hasta ? ` hasta el ${(() => { const h = partesFuncion(promo.hasta); return `${h.dia} ${h.numero} ${h.mes}`; })()}` : ""}</span>}
                </div>
                <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 md:contents">
                  {porAbrir ? (
                    <span className={`chip ${fn.preventa_hasta ? "chip-fz" : "chip-obra"}`}>Muy pronto</span>
                  ) : privada ? (
                    <span className="chip chip-obra">Preventa privada</span>
                  ) : pre ? (
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
                  {vendible && !agotado && !porAbrir && (
                    porWhatsApp ? (
                      <a href={whatsappPedirUrl(env.whatsapp, p.nombre, f ? `${f.dia} ${f.numero} ${f.mes}, ${f.hora}` : null) || "/contacto"} target="_blank" rel="noopener" className="fb fb-luz fb-sm ml-auto md:ml-0">{tv.funcion}</a>
                    ) : pre ? (
                      socio || mia?.acceso ? (
                        <Link href={withSeller(`/comprar/${fn.id}`, vendedor)} className="fb fb-fz fb-sm ml-auto md:ml-0">Entrar a preventa</Link>
                      ) : (
                        <Link href="/fan-zone" className="fb fb-fz fb-sm ml-auto md:ml-0">Únete al Club Fan</Link>
                      )
                    ) : (
                      <Link href={withSeller(`/comprar/${fn.id}`, vendedor)} className="fb fb-luz fb-sm ml-auto md:ml-0">{tv.funcion}</Link>
                    )
                  )}
                  {(!vendible || agotado || porAbrir) && <span aria-hidden="true" className="hidden md:block" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {/* 0120: sin precios, las zonas salen solo con su nombre. */}
      {prices.length > 0 && (
        <div className="rounded-[22px] border border-current/12 bg-obra-superficie px-6 py-6 md:px-9 md:py-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-[22px] font-extrabold tracking-[-0.02em]">Zonas</h3>
            {proxima && (
              <Link href={withSeller(`/comprar/${proxima.id}`, vendedor)} className="text-[13px] font-bold text-obra-acento hover:underline">
                Ver mapa del teatro <Icono nombre="flecha-der" />
              </Link>
            )}
          </div>
          <ul>
            {prices.map((z) => (
              <li key={z.nombre} className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-current/12 px-1 py-4 last:border-0">
                <i aria-hidden="true" className="h-3.5 w-3.5 rounded-[4px] border border-current/20" style={{ background: z.color ?? "currentColor" }} />
                <span className="text-[15px] font-semibold">{z.nombre}</span>
                {conPrecios ? <strong className="num text-[17px]">{formatPrice(z.price)}</strong> : <span />}
                {/* 0122: lo que incluye la zona además del lugar. */}
                {!!z.beneficios?.length && <BeneficiosZona beneficios={z.beneficios} fechas={fechasFn} className="col-start-2 col-end-4" />}
              </li>
            ))}
          </ul>
          {conPrecios && <p className="pt-4 text-[12.5px] opacity-70">Precios en pesos mexicanos.</p>}
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
      {!vistaPrevia && !capaVacia(capa) && (
        <p className="flex items-center justify-center gap-2 bg-[#120f17] px-4 py-2 text-center text-sm font-semibold">
          <img src="/marca/fan-zone-oro.svg" alt="" className="h-4 w-auto" />
          <span>Estás viendo <span className="txt-oro">novedades exclusivas del Club Fan</span> antes que nadie.</span>
        </p>
      )}
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
              {p.temporada && <li className="chip chip-obra"><span className="text-obra-acento"><Icono nombre="destello" /></span>Temporada {p.temporada}</li>}
              {p.venue && <li className="chip chip-obra">{p.venue}</li>}
              {duracion && <li className="chip chip-obra">{duracion}</li>}
            </ul>
            <div className="flex flex-wrap gap-3 pt-1">
              {enVenta && <a href={ligaCompra} {...externa} className="fb fb-luz">{tv.cta}</a>}
              {videos.length > 0 && (
                <a href="#videos" className="fb fb-obra">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
                  {videos.length === 1 ? "Ver video" : "Ver videos"}
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
                    <span className="text-[12.5px] text-texto-3">{p.modo_venta === "web" || !p.modo_venta ? "Boletos desde" : "Desde"}</span>
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
                <a href={ligaCompra} {...externa} className="fb fb-luz fb-sm">{porWhatsApp ? "WhatsApp" : p.modo_venta === "hibrido" ? "Aparta tu lugar" : "Boletos"}</a>
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
          {show("eventos") && (
            <Bloque id="eventos" eyebrow="Vívelo de cerca" titulo="Eventos">
              <ul className="grid gap-4 md:grid-cols-2">
                {eventos.map((e) => <EncuentroCard key={e.id} e={e} sesion={!!sesion} socio={socio} mostrarObra={false} />)}
                {bloqueados.map((e) => <EventoBloqueado key={e.id} e={e} sesion={!!sesion} mostrarObra={false} />)}
              </ul>
              <Link href="/eventos" className="self-start text-sm font-bold underline-offset-4 opacity-80 hover:underline hover:opacity-100">Ver todos los eventos de DARF <Icono nombre="flecha-der" /></Link>
            </Bloque>
          )}
          {repertorio}
          {!c.sinopsis.length && !canciones && (
            <p className="rounded-[22px] border border-current/12 bg-obra-superficie p-6 opacity-85">
              Pronto publicaremos más de esta producción: sinopsis, canciones y más.
            </p>
          )}
        </div>

        {/* Con póster oficial (0093) la columna ya es alta: deja de ir fija para que no se corte. */}
        <aside className={`flex flex-col gap-4 ${posterPagina ? "" : `lg:sticky ${vistaPrevia ? "lg:top-[120px]" : "lg:top-24"}`}`}>
          {posterPagina && (
            <a href={posterPagina.url} target="_blank" rel="noopener" className="group block overflow-hidden rounded-[22px] border border-current/12 bg-obra-superficie">
              <span className="relative block aspect-[3/4]">
                <Image src={posterPagina.url} alt={`Póster oficial de ${p.nombre}`} fill sizes="(min-width: 1024px) 360px, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none" />
              </span>
              <span className="block px-5 py-3 text-[13px] font-bold text-obra-acento">Póster oficial · ver en grande <Icono nombre="externo" /></span>
            </a>
          )}
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
              <Link href="/producciones" className="mt-4 block text-[13px] font-bold text-obra-acento hover:underline"><Icono nombre="flecha-izq" /> Todas las producciones</Link>
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
            <Link href="/producciones" className="px-1 text-[13px] font-bold text-obra-acento hover:underline"><Icono nombre="flecha-izq" /> Todas las producciones</Link>
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
                  <img src={ph.url} alt={`${p.nombre}: foto ${i + 1} de ${gallery.length}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.04]" />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              {gallery.some((g) => g.funcion) && <Link href={`/producciones/${p.id}/fotos`} className="fb fb-o fb-sm self-start"><Icono nombre="camara" /> Fotos de cada función</Link>}
              {ensayos > 0 && <Link href={`/fan-zone/${p.id}`} className="fb fb-fz fb-sm self-start">Más en la Fan Zone</Link>}
            </div>
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

        {!vistaPrevia && (
          <p className="text-sm text-texto-3">
            ¿Eres de un medio? <Link href={`/producciones/${p.id}/prensa`} className="font-bold text-lila underline-offset-4 hover:underline">Kit de prensa <Icono nombre="flecha-der" /></Link>
          </p>
        )}
      </div>

      {/* Celular: barra fija abajo con el precio y la compra (arriba de la franja DEV). */}
      {enVenta && (
        <div className={`glass fixed inset-x-2 z-30 flex items-center justify-between gap-3 rounded-[20px] py-2.5 pl-5 pr-2.5 text-texto md:hidden ${isDev ? "bottom-9" : "bottom-2"}`}>
          <span className="text-[12.5px] text-texto-3">
            {desde !== null ? <>Desde <strong className="num block text-lg font-black text-texto">{formatPrice(desde)}</strong></> : porWhatsApp ? "Escríbenos" : p.modo_venta === "hibrido" ? "Lugares disponibles" : "Boletos a la venta"}
          </span>
          <a href={ligaCompra} {...externa} className="fb fb-luz fb-sm">{tv.cta}</a>
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
