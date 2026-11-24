import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import { Icono } from "~/componentes/Icono";
import { VideoYoutube } from "~/componentes/VideoYoutube";
import { useApariencia } from "~/lib/apariencia";
import { leerContenido, type Contenido } from "~/lib/contenido";
import { funcionPasada, imagen, leerObra, poster, type Funcion } from "~/lib/datos";
import { env } from "~/lib/env";
import { dinero, fechaLarga, hora } from "~/lib/formato";
import { paletaObra, variables } from "~/lib/tema";
import { abrir, useCarga } from "~/lib/usar";

// Página de una obra con SUS colores (el kit de la obra en su modo y la versión aclarada u oscurecida en el otro) y
// el mismo contenido que la página de la web: funciones y precios, historia, ficha, canciones, elenco, equipos,
// galería, videos y agradecimientos. Cada sección aparece solo si la obra la tiene.

type Seccion = { id: string; titulo: string };

export function Obra() {
  const navegar = useNavigate();
  // Al bajar, una franja con el color de la obra tapa la barra de estado (la navegación de secciones se pega debajo).
  const [bajo, setBajo] = useState(false);
  useEffect(() => {
    const ver = () => setBajo(window.scrollY > 300);
    window.addEventListener("scroll", ver, { passive: true });
    return () => window.removeEventListener("scroll", ver);
  }, []);
  const { id = "" } = useParams();
  const { modo } = useApariencia();
  const { datos, error, cargando } = useCarga(() => Promise.all([leerObra(id), leerContenido(id)]), [id]);
  const detalle = datos?.[0] ?? null;
  const c = datos?.[1] ?? null;
  const paleta = useMemo(() => (detalle ? paletaObra(detalle.obra, modo) : null), [detalle, modo]);
  const vendibles = useMemo(() => (detalle?.funciones ?? []).filter((f) => f.on_sale && f.starts_at && !funcionPasada(f.starts_at)), [detalle]);
  const [elegida, setElegida] = useState<string | null>(null);
  useEffect(() => setElegida(vendibles[0]?.id ?? null), [vendibles]);

  // El fondo de toda la pantalla (también detrás de la barra del sistema) toma el color de la obra.
  useEffect(() => {
    if (!paleta) return;
    const antes = document.body.style.background;
    document.body.style.background = paleta.fondo;
    return () => { document.body.style.background = antes; };
  }, [paleta]);

  if (cargando) return <main className="pantalla"><div className="esqueleto" style={{ height: 420, margin: "0 -20px", borderRadius: 0 }} /></main>;
  if (error || !detalle || !c) {
    return (
      <main className="pantalla">
        <Link to="/obras" className="circulo" aria-label="Volver"><Icono nombre="atras" /></Link>
        <p className="aviso error" style={{ marginTop: 16 }}>{error ? "No pudimos cargar la obra. Revisa tu conexión." : "Esta obra no está disponible."}</p>
      </main>
    );
  }

  const { obra, zonas } = detalle;
  // Como la web en el celular: la versión vertical limpia del póster; si no hay, la destacada o el ambiente.
  const hero = poster(obra, "voy") ?? poster(obra, "destacada-celular");
  const logo = imagen(obra.logo_path);
  const funcion = vendibles.find((f) => f.id === elegida) ?? null;
  const desde = zonas.length ? Math.min(...zonas.map((z) => z.price)) : 0;
  const lugar = funcion?.venue ?? obra.venue;
  const mostrarPrecios = obra.mostrar_precios !== false && zonas.length > 0;
  const hayFunciones = vendibles.length > 0 || mostrarPrecios;

  const secciones: Seccion[] = [
    hayFunciones && { id: "funciones", titulo: "Funciones" },
    c.sinopsis.length > 0 && { id: "historia", titulo: "Historia" },
    c.ficha.length > 0 && { id: "ficha", titulo: "Ficha" },
    c.actos.length > 0 && { id: "canciones", titulo: "Canciones" },
    (c.reparto.length > 0 || c.ensamble.length > 0) && { id: "elenco", titulo: "Elenco" },
    c.equipos.length > 0 && { id: "equipos", titulo: "Equipos" },
    c.galeria.length > 0 && { id: "galeria", titulo: "Galería" },
    c.videos.length > 0 && { id: "videos", titulo: "Videos" },
    c.agradecimientos.length > 0 && { id: "gracias", titulo: "Gracias" },
  ].filter((s): s is Seccion => !!s);

  const compartir = async () => {
    const url = `${env.siteUrl}/producciones/${obra.id}`;
    if (Capacitor.isNativePlatform() || (await Share.canShare()).value) await Share.share({ title: obra.nombre, text: obra.frase ?? obra.nombre, url }).catch(() => {});
    else await navigator.clipboard?.writeText(url);
  };
  const destino = c.logistica?.maps_url ?? (c.logistica?.direccion ?? lugar ? `https://maps.google.com/?q=${encodeURIComponent((c.logistica?.direccion ?? lugar) + ", Querétaro")}` : null);
  const comoLlegar = () => destino && abrir(destino);
  const comprar = () => {
    if (obra.modo_venta === "whatsapp" && env.whatsapp) {
      const texto = `Hola, quiero boletos para ${obra.nombre}${funcion?.starts_at ? ` (${fechaLarga(funcion.starts_at)})` : ""}.`;
      return abrir(`https://wa.me/${env.whatsapp}?text=${encodeURIComponent(texto)}`);
    }
    if (funcion) navegar(`/comprar/${funcion.id}`);
  };
  const ir = (sid: string) => document.getElementById(sid)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="pantalla completa sin-barra" style={paleta ? (variables(paleta) as React.CSSProperties) : undefined}>
      <div aria-hidden="true" style={{ position: "fixed", top: 0, left: 0, right: 0, height: "var(--arriba)", zIndex: 16, pointerEvents: "none", transition: "opacity .2s",
        opacity: bajo ? 1 : 0, background: "color-mix(in srgb, var(--fondo) 90%, transparent)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }} />
      <div style={{ position: "relative", height: "calc(380px + var(--arriba))", overflow: "hidden", background: obra.color_fondo ?? "#0b0b0b" }}>
        {hero && <img src={hero} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, transparent 30%, color-mix(in srgb, var(--fondo) 55%, transparent) 62%, var(--fondo) 100%)" }} />
        {logo && <img src={logo} alt={obra.nombre} style={{ position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", maxWidth: "82%", maxHeight: 160, objectFit: "contain", filter: "drop-shadow(0 6px 18px color-mix(in srgb, var(--texto) 22%, transparent))" }} />}
        <div style={{ position: "absolute", top: "calc(var(--arriba) + 12px)", left: 16, right: 16, display: "flex", justifyContent: "space-between" }}>
          <Link to="/obras" className="circulo vidrio" aria-label="Volver"><Icono nombre="atras" /></Link>
          <button className="circulo vidrio" onClick={compartir} aria-label="Compartir"><Icono nombre="compartir" tamano={20} /></button>
        </div>
      </div>

      <div className="contenido" style={{ padding: "0 20px" }}>
        <h1 className={logo ? "oculto" : "titulo-grande"}>{obra.nombre}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {obra.temporada && <span className="pildora" style={{ background: "var(--boton)", color: "var(--sobre-boton)" }}>Temporada {obra.temporada}</span>}
          {lugar && <span className="suave" style={{ fontSize: 13, fontWeight: 600 }}>{lugar}</span>}
        </div>
        {obra.frase && <p style={{ margin: "14px 0 0", fontSize: 16, lineHeight: 1.6 }}>{obra.frase}</p>}

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <button className="boton tarjeta" onClick={comoLlegar} disabled={!destino} style={{ minHeight: 56, fontSize: 13 }}><Icono nombre="mapa" tamano={20} color="var(--acento)" />Cómo llegar</button>
          <button className="boton tarjeta" onClick={compartir} style={{ minHeight: 56, fontSize: 13 }}><Icono nombre="compartir" tamano={20} color="var(--acento)" />Compartir</button>
        </div>
      </div>

      {secciones.length > 1 && (
        <nav aria-label="Secciones de la obra" style={{ position: "sticky", top: "var(--arriba)", zIndex: 15, marginTop: 18, padding: "8px 0", background: "color-mix(in srgb, var(--fondo) 90%, transparent)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 20px", scrollbarWidth: "none" }}>
            {secciones.map((s) => (
              <button key={s.id} onClick={() => ir(s.id)} style={{ flexShrink: 0, height: 36, padding: "0 14px", borderRadius: 18, border: "1px solid var(--linea)", background: "var(--superficie)", color: "var(--texto)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{s.titulo}</button>
            ))}
          </div>
        </nav>
      )}

      <div className="contenido" style={{ padding: "0 20px", gap: 34, marginTop: 14 }}>
        {hayFunciones && (
          <Bloque id="funciones" etiqueta={obra.concluded ? "Así se presentó" : "Elige tu función"} titulo={mostrarPrecios ? "Funciones y precios" : "Funciones"}>
            {vendibles.length > 0 && (
              <div role="radiogroup" aria-label="Funciones" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                {vendibles.map((f) => <ChipFuncion key={f.id} f={f} elegida={f.id === elegida} elegir={() => setElegida(f.id)} />)}
              </div>
            )}
            {mostrarPrecios && (
              <div>
                {zonas.map((z) => (
                  <div key={z.nombre} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44, borderBottom: "1px solid var(--linea)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: z.color ?? "var(--acento)" }} />{z.nombre}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800 }}>{dinero(z.price)}</span>
                  </div>
                ))}
              </div>
            )}
            {c.logistica?.indicaciones && <p className="suave" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{c.logistica.indicaciones}</p>}
          </Bloque>
        )}

        {c.sinopsis.length > 0 && (
          <Bloque id="historia" etiqueta="Sinopsis" titulo="La historia">
            {c.sinopsis.map((t, i) => <p key={i} style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>{t}</p>)}
          </Bloque>
        )}

        {c.ficha.length > 0 && (
          <Bloque id="ficha" etiqueta="Ficha" titulo="Datos de la obra">
            <dl className="tarjeta" style={{ margin: 0, padding: "4px 16px", background: "var(--superficie)", borderColor: "var(--linea)" }}>
              {c.ficha.map((f, i) => (
                <div key={f.etiqueta + i} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: i < c.ficha.length - 1 ? "1px solid var(--linea)" : "none" }}>
                  <dt className="suave" style={{ fontSize: 13, fontWeight: 600 }}>{f.etiqueta}</dt>
                  <dd style={{ margin: 0, fontSize: 14, fontWeight: 700, textAlign: "right" }}>{f.valor}</dd>
                </div>
              ))}
            </dl>
          </Bloque>
        )}

        {c.actos.length > 0 && (
          <Bloque id="canciones" etiqueta="Repertorio" titulo="Canciones">
            {c.actos.map((a, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {a.nombre && <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--acento)" }}>{a.nombre}</h3>}
                <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 4, fontSize: 14, lineHeight: 1.5 }}>
                  {a.canciones.map((t, j) => <li key={j}>{t}</li>)}
                </ol>
              </div>
            ))}
          </Bloque>
        )}

        {(c.reparto.length > 0 || c.ensamble.length > 0) && (
          <Bloque id="elenco" etiqueta="En escena · Jóvenes para jóvenes" titulo="Elenco">
            {c.reparto.length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                {c.reparto.map((r, i) => (
                  <li key={i}>
                    <ConPerfil slug={r.slug} estilo={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <Retrato foto={r.foto} nombre={r.persona} alto={200} />
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--acento)" }}>{r.personaje}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, marginTop: -4 }}>{r.persona}{r.slug ? " ›" : ""}</span>
                    </ConPerfil>
                  </li>
                ))}
              </ul>
            )}
            {c.ensamble.length > 0 && (
              <>
                <h3 style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 800 }}>Ensamble</h3>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {c.ensamble.map((e, i) => (
                    <li key={i}>
                      <ConPerfil slug={e.slug} estilo={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px 4px 4px", borderRadius: 22, background: "var(--superficie)", border: "1px solid var(--linea)", fontSize: 13, fontWeight: 600 }}>
                        <Retrato foto={e.foto} nombre={e.persona} alto={32} redondo />{e.persona}
                      </ConPerfil>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Bloque>
        )}

        {c.equipos.length > 0 && (
          <Bloque id="equipos" etiqueta="Detrás de la obra" titulo="Equipos">
            {c.equipos.map((g) => (
              <div key={g.titulo} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--acento)" }}>{g.titulo}</h3>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {g.personas.map((p, i) => (
                    <li key={i} style={{ borderBottom: "1px solid var(--linea)" }}>
                      <ConPerfil slug={p.slug} estilo={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
                        <Retrato foto={p.foto} nombre={p.persona} alto={40} redondo />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{p.persona}</span>
                          {p.rol && <span className="suave" style={{ fontSize: 12 }}>{p.rol}</span>}
                        </div>
                        {p.slug && <Icono nombre="derecha" tamano={16} color="var(--suave)" grosor={2} />}
                      </ConPerfil>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Bloque>
        )}

        {c.galeria.length > 0 && (
          <Bloque id="galeria" etiqueta="Así se vivió" titulo="Galería">
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridAutoRows: 150, gap: 8 }}>
              {c.galeria.map((url, i) => (
                <li key={url} style={{ overflow: "hidden", borderRadius: 16, gridColumn: i === 0 ? "span 2" : undefined, gridRow: i === 0 ? "span 2" : undefined }}>
                  <img src={url} alt={`${obra.nombre}: foto ${i + 1} de ${c.galeria.length}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </li>
              ))}
            </ul>
          </Bloque>
        )}

        {c.videos.length > 0 && (
          <Bloque id="videos" etiqueta="Mira" titulo="Videos">
            {c.videos.map((v) => <Video key={v.youtube} v={v} />)}
          </Bloque>
        )}

        {c.agradecimientos.length > 0 && (
          <Bloque id="gracias" etiqueta="Gracias" titulo="Agradecimientos">
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: 14, lineHeight: 1.6 }}>{c.agradecimientos.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </Bloque>
        )}
      </div>

      <div className="pie" style={{ ["--pie-fondo" as string]: "var(--superficie)" }}>
        {obra.concluded ? (
          <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700 }}>Esta obra ya concluyó. Gracias por ser parte de su historia.</p>
        ) : funcion ? (
          <>
            {mostrarPrecios && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span className="suave" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Desde</span>
                <span style={{ fontSize: 22, fontWeight: 900 }}>{dinero(desde)}</span>
              </div>
            )}
            <button className="boton acento" style={{ flex: 1 }} onClick={comprar}>
              {obra.modo_venta === "whatsapp" ? "Pedir por WhatsApp" : "Elegir asientos"}<Icono nombre="flecha" tamano={18} grosor={2.2} />
            </button>
          </>
        ) : (
          <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700 }}>Muy pronto anunciaremos fechas. Activa los avisos en Cuenta para enterarte primero.</p>
        )}
      </div>
    </main>
  );
}

function Bloque({ id, etiqueta, titulo, children }: { id: string; etiqueta: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} style={{ display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: "calc(var(--arriba) + 64px)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--acento)" }}>{etiqueta}</span>
        <h2 id={`${id}-t`} style={{ margin: 0, fontSize: 26, lineHeight: 1.05, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase" }}>{titulo}</h2>
      </div>
      {children}
    </section>
  );
}

function ChipFuncion({ f, elegida, elegir }: { f: Funcion; elegida: boolean; elegir: () => void }) {
  return (
    <button role="radio" aria-checked={elegida} onClick={elegir} style={{
      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "12px 14px", borderRadius: 16, cursor: "pointer", textAlign: "left",
      background: elegida ? "color-mix(in srgb, var(--boton) 22%, var(--superficie))" : "var(--superficie)",
      border: `1.5px solid ${elegida ? "var(--acento)" : "var(--linea)"}`, color: "var(--texto)",
    }}>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{f.starts_at ? fechaLarga(f.starts_at) : "Fecha por anunciar"}</span>
      {f.starts_at && <span className="suave" style={{ fontSize: 12, fontWeight: 600 }}>{hora(f.starts_at)}</span>}
    </button>
  );
}

/** Si la persona hizo público su perfil profesional, su nombre abre su perfil en la app. */
function ConPerfil({ slug, estilo, children }: { slug?: string; estilo: CSSProperties; children: ReactNode }) {
  return slug ? <Link to={`/artista/${slug}`} style={{ ...estilo, color: "inherit" }}>{children}</Link> : <div style={estilo}>{children}</div>;
}

function Retrato({ foto, nombre, alto, redondo }: { foto?: string; nombre: string; alto: number; redondo?: boolean }) {
  const estilo = { width: redondo ? alto : "100%", height: alto, borderRadius: redondo ? alto / 2 : 16, flexShrink: 0, background: "var(--superficie)", border: "1px solid var(--linea)", overflow: "hidden" } as const;
  if (foto) return <img src={foto} alt="" loading="lazy" style={{ ...estilo, objectFit: "cover", objectPosition: "center top" }} />;
  const iniciales = nombre.split(/\s+/).slice(0, 2).map((x) => x.charAt(0)).join("").toUpperCase();
  return <span aria-hidden="true" style={{ ...estilo, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(12, alto / 3.2), fontWeight: 900, color: "var(--suave)" }}>{iniciales}</span>;
}

// Video de YouTube (ver VideoYoutube: en iPhone se abre en YouTube dentro de la app).
function Video({ v }: { v: Contenido["videos"][number] }) {
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ borderRadius: 16, overflow: "hidden" }}><VideoYoutube id={v.youtube} titulo={v.titulo} /></div>
      <figcaption style={{ fontSize: 13, fontWeight: 700 }}>{v.titulo}</figcaption>
    </figure>
  );
}
