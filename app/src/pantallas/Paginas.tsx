import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { SocialIcon } from "@/components/SocialIcon";
import { CONTACT_CHANNELS, whatsappDisplay, type ContactChannel } from "@/content/contacto";
import { TIPO_CREDITO } from "@/lib/casting-rules";
import { LISTAS, ordenarTrayectoria, reelYoutube, type ProProfile } from "@/lib/pro-rules";
import { Icono } from "~/componentes/Icono";
import { env } from "~/lib/env";
import { nombreDe, useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { abrir, useCarga } from "~/lib/usar";

// Páginas públicas de la web, nativas: Contacto (/contacto), Conoce al equipo (/nosotros) y el perfil público de un
// artista (/artistas/[slug]). Mismas tablas y RPC que la web, con la sesión (o sin ella) de quien usa la app.

const perfilUrl = (path: string) => `${env.supabaseUrl}/storage/v1/object/public/perfiles/${path.split("/").map(encodeURIComponent).join("/")}`;

function Pagina({ titulo, etiqueta, intro, children }: { titulo: string; etiqueta?: string; intro?: string; children: ReactNode }) {
  const navegar = useNavigate();
  return (
    <main className="pantalla sin-barra">
      <div className="contenido" style={{ gap: 14 }}>
        <button className="circulo" aria-label="Volver" onClick={() => (window.history.length > 1 ? navegar(-1) : navegar("/"))}><Icono nombre="atras" /></button>
        {etiqueta && <span className="etiqueta">{etiqueta}</span>}
        <h1 className="titulo-grande" style={{ marginTop: etiqueta ? -8 : 0 }}>{titulo}</h1>
        {intro && <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{intro}</p>}
        {children}
      </div>
    </main>
  );
}

// ── Contacto ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function Contacto() {
  const { sesion } = useSesion();
  const whatsapp: ContactChannel = {
    channel: "whatsapp", nombre: "WhatsApp", handle: whatsappDisplay(env.whatsapp) || "Pronto",
    descripcion: "Atención directa y pagos de boletos", href: env.whatsapp ? `https://wa.me/${env.whatsapp}` : "", color: "#25d366",
  };
  const [f, setF] = useState({ nombre: nombreDe(sesion) ?? "", correo: sesion?.user.email ?? "", telefono: "", asunto: "", mensaje: "", sitio: "" });
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const enviar = async () => {
    const gracias = "¡Gracias! Recibimos tu mensaje y te responderemos pronto.";
    if (f.sitio) return setMsg({ ok: true, t: gracias }); // campo trampa para robots, igual que la web
    const nombre = f.nombre.trim(), correo = f.correo.trim(), mensaje = f.mensaje.trim();
    if (!nombre || !correo || !mensaje) return setMsg({ ok: false, t: "Escribe tu nombre, correo y mensaje." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return setMsg({ ok: false, t: "Revisa tu correo." });
    if (mensaje.length > 4000) return setMsg({ ok: false, t: "El mensaje es demasiado largo." });
    setEnviando(true);
    const { error } = await supabase.from("contact_messages").insert({ nombre, correo, telefono: f.telefono.trim() || null, asunto: f.asunto.trim() || null, mensaje });
    setEnviando(false);
    setMsg(error ? { ok: false, t: /Intenta de nuevo/.test(error.message) ? error.message : "No se pudo enviar. Intenta de nuevo en un momento." } : { ok: true, t: gracias });
  };

  return (
    <Pagina etiqueta="Contacto" titulo="Hablemos" intro="Escríbenos por el canal que prefieras: dudas de boletos, prensa, patrocinios o colaboraciones.">
      <div className="tarjeta lista">
        {[whatsapp, ...CONTACT_CHANNELS].map((c) => (
          <button key={c.channel} className="fila" disabled={!c.href} onClick={() => c.href && abrir(c.href)} style={{ minHeight: 68, opacity: c.href ? 1 : 0.6 }}>
            <span style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${c.color} 18%, transparent)`, color: c.color }}>
              <SocialIcon channel={c.channel} size={22} />
            </span>
            <span className="crece" style={{ display: "flex", flexDirection: "column", minWidth: 0, textAlign: "left" }}>
              <span style={{ fontWeight: 800 }}>{c.nombre}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.color, overflow: "hidden", textOverflow: "ellipsis" }}>{c.handle}</span>
              <span className="suave" style={{ fontSize: 12, fontWeight: 500 }}>{c.href ? c.descripcion : "Escríbenos con el formulario de abajo"}</span>
            </span>
            <Icono nombre="derecha" tamano={18} color="var(--suave)" grosor={2} />
          </button>
        ))}
      </div>

      <h2 className="titulo-seccion" style={{ marginTop: 8 }}>Envíanos un mensaje</h2>
      <p className="suave" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>Te respondemos por correo. Para temas de boletos, incluye tu código de orden si ya la tienes.</p>
      {msg?.ok ? (
        <p className="aviso" role="status" style={{ margin: 0, fontSize: 15 }}>{msg.t}</p>
      ) : (
        <>
          <input className="oculto" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.sitio} onChange={(e) => setF({ ...f, sitio: e.target.value })} />
          <label className="campo">Nombre<input autoComplete="name" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
          <label className="campo">Correo<input type="email" autoComplete="email" autoCapitalize="none" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} /></label>
          <label className="campo">Teléfono (opcional)<input type="tel" autoComplete="tel" inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></label>
          <label className="campo">Asunto (opcional)<input value={f.asunto} onChange={(e) => setF({ ...f, asunto: e.target.value })} /></label>
          <label className="campo">Mensaje<textarea maxLength={4000} rows={6} value={f.mensaje} onChange={(e) => setF({ ...f, mensaje: e.target.value })} /></label>
          {msg && <p className="aviso error" role="alert" style={{ margin: 0 }}>{msg.t}</p>}
          <button className="boton principal" disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Enviar mensaje"}</button>
        </>
      )}
    </Pagina>
  );
}

// ── Conoce al equipo ─────────────────────────────────────────────────────────────────────────────────────────────
type Cifras = { producciones: number; funciones: number; talento: number; anios: number; temporadas: number };
const CIFRAS: { k: keyof Cifras; texto: string; uno?: string }[] = [
  { k: "anios", texto: "Años haciendo teatro", uno: "Año haciendo teatro" },
  { k: "producciones", texto: "Producciones" },
  { k: "temporadas", texto: "Temporadas", uno: "Temporada" },
  { k: "funciones", texto: "Funciones presentadas" },
  { k: "talento", texto: "Jóvenes en escena y detrás" },
];
const ANIO_INICIO = 2025;
type Miembro = { id: string; nombre: string; cargo: string; slug: string | null; retrato_path: string | null; semblanza: string | null; directivo?: boolean; descripcion?: string | null };

async function leerEquipo() {
  const [{ data }, stats, obras] = await Promise.all([
    supabase.rpc("team_public"), supabase.rpc("public_stats"),
    supabase.from("productions").select("temporada").in("estado", ["publicada", "archivada"]),
  ]);
  const equipo = (data ?? []) as Miembro[];
  const temporadas = new Set(((obras.data ?? []) as { temporada: string | null }[])
    .map((o) => (o.temporada ?? "").toLowerCase().replace(/temporada/g, "").trim()).filter(Boolean)).size;
  const anioMx = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Mexico_City" }).format(new Date()));
  const valores: Cifras | null = stats.data ? { ...(stats.data as Cifras), anios: anioMx - ANIO_INICIO, temporadas } : null;
  const cifras = valores ? CIFRAS.filter((c) => Number(valores[c.k]) > 0).map((c) => ({ ...c, valor: Number(valores[c.k]) })) : [];
  const cabezas = equipo.filter((m) => m.directivo);
  const grupos: [string, Miembro[]][] = !cabezas.length ? [["", equipo]] : [["Dirección", cabezas], ["Equipo", equipo.filter((m) => !m.directivo)]];
  return { cifras, grupos: grupos.filter(([, l]) => l.length), vacio: equipo.length === 0 };
}

export function Nosotros() {
  const { datos, cargando, error } = useCarga(leerEquipo, []);
  return (
    <Pagina etiqueta="Nosotros" titulo="Conoce al equipo" intro="Las personas que hacen posible cada temporada de DARF Productions.">
      {cargando && <div className="esqueleto" style={{ height: 240 }} />}
      {error && <p className="aviso error">No pudimos cargar el equipo. Revisa tu conexión.</p>}
      {datos && datos.cifras.length > 0 && (
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, borderRadius: 20, overflow: "hidden", background: "var(--linea)", border: "1px solid var(--linea)" }}>
          {datos.cifras.map((c, i) => (
            <div key={c.k} style={{ gridColumn: i === 0 && datos.cifras.length % 2 === 1 ? "1 / -1" : undefined, background: "var(--tarjeta)", padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
              <dd className="texto-degradado" style={{ margin: 0, fontSize: 36, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1 }}>{c.valor.toLocaleString("es-MX")}</dd>
              <dt className="suave" style={{ fontSize: 12, fontWeight: 600 }}>{c.valor === 1 && c.uno ? c.uno : c.texto}</dt>
            </div>
          ))}
        </dl>
      )}
      {datos?.vacio && <p className="aviso">Muy pronto conocerás a nuestro equipo.</p>}
      {datos?.grupos.map(([titulo, lista]) => (
        <section key={titulo || "equipo"} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
          {titulo && <h2 className="etiqueta" style={{ margin: 0, color: "#c9a845" }}>{titulo}</h2>}
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            {lista.map((m) => {
              const tarjeta = (
                <>
                  <div style={{ borderRadius: 16, overflow: "hidden", background: "var(--linea)", aspectRatio: "4 / 5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {m.retrato_path
                      ? <img src={perfilUrl(m.retrato_path)} alt={`Retrato de ${m.nombre}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span className="suave" style={{ fontSize: 44, fontWeight: 900 }}>{m.nombre.charAt(0)}</span>}
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, marginTop: 8 }}>{m.nombre}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--acento)" }}>{m.cargo}</span>
                  {m.descripcion && <span style={{ fontSize: 12, lineHeight: 1.4 }}>{m.descripcion}</span>}
                  {m.slug && <span className="suave" style={{ fontSize: 12, fontWeight: 700 }}>Ver perfil ›</span>}
                </>
              );
              const estilo = { display: "flex", flexDirection: "column" as const, gap: 2, color: "inherit" };
              return <li key={m.id}>{m.slug ? <Link to={`/artista/${m.slug}`} style={estilo}>{tarjeta}</Link> : <div style={estilo}>{tarjeta}</div>}</li>;
            })}
          </ul>
        </section>
      ))}
    </Pagina>
  );
}

// ── Perfil público de un artista ─────────────────────────────────────────────────────────────────────────────────
async function leerArtista(slug: string) {
  const { data } = await supabase.from("pro_profiles").select("*, people(nombre)").eq("slug", slug).maybeSingle();
  if (!data) return null;
  const pro = data as ProProfile & { people: { nombre: string } | null };
  const [fotos, obras] = await Promise.all([
    supabase.from("pro_photos").select("id, path, orden").eq("person_id", pro.person_id).order("orden"),
    supabase.rpc("pro_darf_credits", { pid: pro.person_id }),
  ]);
  return {
    pro, nombre: pro.people?.nombre ?? "",
    fotos: (fotos.data ?? []) as { id: string; path: string }[],
    obras: (obras.data ?? []) as { production_id: string; obra: string; tipo: string; papel: string | null }[],
  };
}

export function Artista() {
  const { slug = "" } = useParams();
  const { datos, cargando, error } = useCarga(() => leerArtista(slug), [slug]);
  if (cargando) return <Pagina titulo=" "><div className="esqueleto" style={{ height: 380 }} /></Pagina>;
  if (error || !datos) return <Pagina titulo="Artista"><p className="aviso">{error ? "No pudimos cargar este perfil. Revisa tu conexión." : "Este perfil no es público."}</p></Pagina>;
  const { pro, nombre, fotos, obras } = datos;
  const h = pro.habilidades ?? {};
  const reel = reelYoutube(pro.reel_url);
  const habilidades = [
    ...(h.canto ? [{ label: "Canto", items: [h.canto] }] : []),
    ...LISTAS.map((l) => ({ label: l.label, items: h[l.key] ?? [] })).filter((x) => x.items.length),
  ];
  const redes = [
    pro.instagram && { t: "Instagram", url: `https://instagram.com/${pro.instagram}` },
    pro.tiktok && { t: "TikTok", url: `https://tiktok.com/@${pro.tiktok}` },
    pro.youtube && { t: "YouTube", url: pro.youtube },
    pro.reel_url && !reel && { t: "Video de muestra", url: pro.reel_url },
  ].filter(Boolean) as { t: string; url: string }[];

  return (
    <Pagina etiqueta="Artista DARF" titulo={nombre}>
      <div style={{ borderRadius: 20, overflow: "hidden", background: "var(--linea)", aspectRatio: "4 / 5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {pro.retrato_path
          ? <img src={perfilUrl(pro.retrato_path)} alt={`Retrato de ${nombre}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span className="suave" style={{ fontSize: 80, fontWeight: 900 }}>{nombre.charAt(0)}</span>}
      </div>
      {pro.semblanza && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, whiteSpace: "pre-line" }}>{pro.semblanza}</p>}
      {redes.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {redes.map((r) => <button key={r.t} className="boton contorno" style={{ minHeight: 40, fontSize: 11 }} onClick={() => abrir(r.url)}>{r.t}</button>)}
        </div>
      )}
      {reel && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="titulo-seccion">Video de muestra</h2>
          <div style={{ position: "relative", aspectRatio: "16 / 9", borderRadius: 16, overflow: "hidden", background: "#000000" }}>
            <iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(reel)}?playsinline=1&rel=0`} title={`Video de muestra de ${nombre}`}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
          </div>
        </section>
      )}
      {obras.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="titulo-seccion">Con DARF Productions</h2>
          <div className="tarjeta lista">
            {obras.map((o, i) => (
              <Link key={i} to={`/obras/${o.production_id}`} className="fila">
                <span className="crece" style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 800 }}>{o.obra}</span>
                  <span className="suave" style={{ fontSize: 13, fontWeight: 500 }}>{o.papel || TIPO_CREDITO[o.tipo] || o.tipo}</span>
                </span>
                <Icono nombre="derecha" tamano={18} color="var(--suave)" grosor={2} />
              </Link>
            ))}
          </div>
        </section>
      )}
      {pro.trayectoria?.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 className="titulo-seccion">Trayectoria</h2>
          {ordenarTrayectoria(pro.trayectoria).map((t, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--linea)", display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14 }}><b>{t.obra}</b>{t.papel && <span className="suave"> · {t.papel}</span>}</span>
              {(t.compania || t.anio) && <span className="suave" style={{ fontSize: 12 }}>{[t.compania, t.anio].filter(Boolean).join(" · ")}</span>}
            </div>
          ))}
        </section>
      )}
      {habilidades.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="titulo-seccion">Habilidades</h2>
          {habilidades.map((x) => (
            <div key={x.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="suave" style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>{x.label}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {x.items.map((it) => <span key={it} style={{ padding: "5px 12px", borderRadius: 100, background: "var(--tarjeta)", border: "1px solid var(--linea)", fontSize: 13 }}>{it}</span>)}
              </div>
            </div>
          ))}
        </section>
      )}
      {fotos.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="titulo-seccion">Galería</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {fotos.map((f) => (
              <button key={f.id} onClick={() => abrir(perfilUrl(f.path))} style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                <img src={perfilUrl(f.path)} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 14, display: "block" }} />
              </button>
            ))}
          </div>
        </section>
      )}
    </Pagina>
  );
}
