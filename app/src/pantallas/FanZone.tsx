import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { TIPOS_ANUNCIO } from "@/lib/anuncio-rules";
import { partesFuncion } from "@/lib/disponibilidad";
import { ACCESO_EVENTO, TIPOS_EVENTO, accionEvento, precioTexto, whatsappEventoUrl, type Evento } from "@/lib/eventos-rules";
import { limiteTexto } from "@/lib/expiry-rules";
import { dominio, FAN_CATEGORIAS, numeroSocio, type FanCategoria } from "@/lib/fanzone-rules";
import { mensajeError } from "@/lib/errores";
import { Icono } from "~/componentes/Icono";
import { Lealtad } from "~/componentes/Lealtad";
import { leerCredencial } from "~/lib/cuenta";
import { env } from "~/lib/env";
import { leerEventos, leerEventosCartelera, leerFanZone, leerSocio, type AnuncioVista, type CredencialFan, type EventoCartelera, type FanItemVista, type FanProximo, type PreventaObra } from "~/lib/fanzone";
import { nombreDe, useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { abrir, useCarga } from "~/lib/usar";
import { recordarRegreso } from "./Acceso";

// Fan Zone y Club Fan nativos (igual que /fan-zone, /club-fan y /eventos en la web), siempre en la línea Oro:
// unirse (gratis) y salir, credencial de socio, preventas con recordatorio, anuncios con "Avísame", contenidos por
// obra y categoría (videos, fotos, documentos y enlaces), lo que se desbloquea después y los eventos del club.

const ORO = "#d7bb5f", ORO_CLARO = "#f3e3a3", FONDO = "#08070c", CAJA = "#120f17", LINEA = "rgba(215,187,95,0.28)", SUAVE = "#a8a2b4";
const TEMA = { "--fondo": FONDO, "--texto": "#ffffff", "--suave": SUAVE, "--linea": LINEA, "--tarjeta": CAJA, "--superficie": CAJA, "--acento": ORO, "--boton": ORO, "--sobre-boton": "#0b0b0b" } as CSSProperties;
const PESTANAS: (FanCategoria | "todo")[] = ["todo", "ensayo", "making", "fotos", "otro"];
const ETIQUETA: Record<FanCategoria, string> = { ensayo: "Ensayo", making: "Making of", fotos: "Fotos", otro: "Fan Zone" };
const BENEFICIOS: [string, string][] = [
  ["Preventa de boletos", "Cuando una obra tiene preventa, el club compra antes que nadie."],
  ["Detrás del telón", "Ensayos, making of y fotos de cada producción."],
  ["Foto con el elenco", "Aparta tu lugar en el encuentro con el elenco de tu función."],
  ["Eventos del club", "Eventos solo para socios, presenciales o en línea."],
  ["Tu credencial", "Con tu número de socio y QR. Los primeros 100 son Fan fundador."],
  ["Primero en enterarte", "Revelaciones de elenco, nuevas fechas y audiciones."],
];
const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(new Date(iso));
const chip = (on: boolean): CSSProperties => ({
  flexShrink: 0, padding: "8px 14px", borderRadius: 100, fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
  border: `1px solid ${on ? ORO : LINEA}`, background: on ? `linear-gradient(135deg,#8a6b1f,${ORO},${ORO_CLARO})` : "transparent", color: on ? "#0b0b0b" : "#ffffff",
});
const botonOro: CSSProperties = { background: `linear-gradient(135deg,#8a6b1f,${ORO},${ORO_CLARO})`, color: "#0b0b0b" };

function Pantalla({ children }: { children: ReactNode }) {
  const navegar = useNavigate();
  return (
    <main className="pantalla sin-barra" style={{ ...TEMA, background: FONDO, color: "#ffffff", minHeight: "100dvh" }}>
      <div aria-hidden="true" style={{ position: "absolute", top: -260, left: "20%", width: 520, height: 700, background: "radial-gradient(closest-side, rgba(215,187,95,0.22), transparent)", pointerEvents: "none" }} />
      <div className="contenido" style={{ gap: 16 }}>
        <button className="circulo" aria-label="Volver" style={{ background: "rgba(255,255,255,0.08)", color: "#ffffff" }} onClick={() => (window.history.length > 1 ? navegar(-1) : navegar("/"))}><Icono nombre="atras" /></button>
        {children}
      </div>
    </main>
  );
}

function Caja({ children, estilo }: { children: ReactNode; estilo?: CSSProperties }) {
  return <section style={{ padding: 16, borderRadius: 22, background: CAJA, border: `1px solid ${LINEA}`, display: "flex", flexDirection: "column", gap: 10, ...estilo }}>{children}</section>;
}

// ── Fan Zone ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function FanZone() {
  const { sesion, cargando: cargandoSesion } = useSesion();
  const [params, setParams] = useSearchParams();
  const pid = params.get("obra");
  const cat = (PESTANAS.find((p) => p === params.get("cat")) ?? "todo") as FanCategoria | "todo";
  const [version, setVersion] = useState(0);
  const uid = sesion?.user.id ?? null;
  const { datos, cargando, error } = useCarga(() => (uid ? leerFanZone(pid) : Promise.resolve(null)), [uid, pid, version]);
  const mia = useCarga(() => (uid ? leerCredencial().catch(() => null) : Promise.resolve(null)), [uid, version]);
  const nombre = nombreDe(sesion) ?? "";
  const recargar = () => setVersion((v) => v + 1);
  const filtrar = (obra: string | null, c: FanCategoria | "todo") => {
    const p = new URLSearchParams();
    if (obra) p.set("obra", obra);
    if (c !== "todo") p.set("cat", c);
    setParams(p, { replace: true });
  };

  if (!cargandoSesion && !sesion) return <ClubFanPublico />;
  if (cargando && !datos) return <Pantalla><div className="esqueleto" style={{ height: 320, background: CAJA }} /></Pantalla>;
  if (error || !datos) return <Pantalla><p className="aviso error">No pudimos cargar la Fan Zone. Revisa tu conexión.</p></Pantalla>;

  const visitas = mia.datos?.fan_visitas ?? 0;
  if (!datos.credencial && !datos.socio) {
    return (
      <Pantalla>
        <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" style={{ height: 32, width: "auto", alignSelf: "flex-start" }} />
        <h1 className="titulo-grande" style={{ fontSize: 34 }}>Únete al <span style={{ color: ORO }}>Club Fan</span></h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: SUAVE }}>Hola, {nombre.split(" ")[0]}. Aquí vive todo lo que no se ve desde la butaca. Es gratis: te damos tu número de socio y tu credencial.</p>
        <Unirse alUnirse={recargar} />
        <Beneficios />
        {visitas > 0 && <Lealtad n={visitas} programa="fan" socio={false} />}
        {datos.anuncios.length > 0 && <Anuncios lista={datos.anuncios} />}
      </Pantalla>
    );
  }

  const lista = cat === "todo" ? datos.items : datos.items.filter((i) => i.categoria === cat);
  const vienen = cat === "todo" ? datos.proximos : datos.proximos.filter((p) => p.categoria === cat);
  const obraDe = new Map(datos.obras.map((o) => [o.id, o.nombre]));
  const pildoras = datos.obras.filter((o) => datos.conContenido.has(o.id) || o.id === pid);
  const obraActual = pid ? datos.obras.find((o) => o.id === pid) : null;

  return (
    <Pantalla>
      <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" style={{ height: 30, width: "auto", alignSelf: "flex-start" }} />
      <h1 className="titulo-grande" style={{ fontSize: 34, marginTop: -4 }}>Hola, {nombre.split(" ")[0]}</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: SUAVE }}>Aquí vive todo lo que no se ve desde la butaca: ensayos, making of, fotos con el elenco y tu acceso anticipado.</p>
      {datos.credencial
        ? <Credencial nombre={nombre} c={datos.credencial} />
        : <Caja><p style={{ margin: 0, fontSize: 14, color: SUAVE, lineHeight: 1.5 }}>Como parte del equipo DARF ya tienes acceso al Club Fan. Únete para tener tu número de socio y el sello del club en tu gafete.</p><Unirse alUnirse={recargar} /></Caja>}
      <Link to="/cuenta/credencial" className="boton" style={{ ...botonOro, minHeight: 46 }}>Mi credencial con QR</Link>
      {visitas > 0 && <Lealtad n={visitas} programa="fan" socio={!!datos.credencial} />}

      {pildoras.length > 0 && (
        <nav aria-label="Producción" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "4px -4px 0", padding: "2px 4px" }}>
          <button style={chip(!pid)} onClick={() => filtrar(null, cat)}>Todas</button>
          {pildoras.map((o) => <button key={o.id} style={chip(o.id === pid)} onClick={() => filtrar(o.id, cat)}>{o.nombre}{o.temporada ? ` ${o.temporada}` : ""}</button>)}
        </nav>
      )}

      {datos.preventas.map((x) => <Preventa key={x.pid} x={x} />)}
      {datos.anuncios.length > 0 && <Anuncios lista={datos.anuncios} />}

      <span className="etiqueta" style={{ color: ORO, marginTop: 8 }}>Detrás del telón{obraActual ? ` · ${obraActual.nombre}` : ""}</span>
      <h2 className="titulo-seccion" style={{ fontSize: 22, marginTop: -10 }}>Lo nuevo para ti</h2>
      <nav aria-label="Categorías" style={{ display: "flex", gap: 6, overflowX: "auto" }}>
        {PESTANAS.map((p) => (
          <button key={p} onClick={() => filtrar(pid, p)} aria-current={cat === p ? "page" : undefined}
            style={{ flexShrink: 0, padding: "8px 10px", background: "none", border: "none", borderBottom: `2px solid ${cat === p ? ORO : "transparent"}`, color: cat === p ? "#ffffff" : SUAVE, fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            {p === "todo" ? "Todo" : FAN_CATEGORIAS[p]}
          </button>
        ))}
      </nav>
      {lista.length + vienen.length === 0 ? (
        <Caja><p style={{ margin: 0, fontSize: 14, color: SUAVE }}>{cat !== "todo" && obraActual ? `No hay ${FAN_CATEGORIAS[cat].toLowerCase()} de ${obraActual.nombre} todavía.` : "Muy pronto habrá contenido aquí. Te avisamos en tu cuenta cuando se publique algo nuevo."}</p></Caja>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {lista.map((it) => <Item key={it.id} it={it} obra={pid ? undefined : obraDe.get(it.production_id)} />)}
          {vienen.map((p) => <Proximo key={p.id} p={p} obra={pid ? undefined : obraDe.get(p.production_id)} />)}
        </div>
      )}

      <Caja estilo={{ marginTop: 8, gap: 14 }}>
        <span style={{ alignSelf: "flex-start", ...chip(true), padding: "5px 10px", fontSize: 10 }}>Experiencia fan</span>
        <h2 className="titulo-seccion" style={{ fontSize: 22, textTransform: "uppercase" }}>Eventos del Club Fan</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: SUAVE }}>Foto con el elenco, tours, meet & greets y transmisiones exclusivas. Aparta tu lugar cuando lo pida y en la entrada muestra tu credencial con QR.</p>
        {datos.eventos.length
          ? datos.eventos.map((e) => <EventoTarjeta key={e.id} e={e} sesion socio mostrarObra={!pid} recargar={recargar} />)
          : <p style={{ margin: 0, fontSize: 13, color: SUAVE }}>Todavía no hay eventos abiertos. Te avisaremos en los anuncios de la Fan Zone.</p>}
        <Link to="/eventos" style={{ fontSize: 13, fontWeight: 800, color: ORO_CLARO }}>Ver todos los eventos ›</Link>
      </Caja>

      {datos.credencial && <Salir numero={numeroSocio(datos.credencial.numero)} alSalir={recargar} />}
    </Pantalla>
  );
}

function Beneficios() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {BENEFICIOS.map(([t, d]) => (
        <div key={t} style={{ padding: 14, borderRadius: 18, border: `1px solid ${LINEA}`, display: "flex", flexDirection: "column", gap: 4 }}>
          <strong style={{ fontSize: 13, color: ORO_CLARO }}>{t}</strong>
          <span style={{ fontSize: 12, lineHeight: 1.45, color: SUAVE }}>{d}</span>
        </div>
      ))}
    </div>
  );
}

/** Club Fan sin sesión (igual que /club-fan): beneficios y "Crear cuenta y unirme". */
function ClubFanPublico() {
  return (
    <Pantalla>
      <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" style={{ height: 32, width: "auto", alignSelf: "flex-start" }} />
      <h1 className="titulo-grande" style={{ fontSize: 34 }}>El <span style={{ color: ORO }}>Club Fan</span> de DARF</h1>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: SUAVE }}>Para quienes viven el teatro desde antes de que se abra el telón. Es gratis y te unes en un toque.</p>
      <Link to="/acceso" onClick={() => recordarRegreso("/fan-zone")} className="boton" style={botonOro}>Crear cuenta y unirme · gratis</Link>
      <Beneficios />
      <Caja>
        <strong>¿Cuánto cuesta?</strong><span style={{ fontSize: 13, color: SUAVE, marginTop: -6 }}>Nada. El Club Fan es gratis; solo necesitas una cuenta de DARF.</span>
        <strong>¿Puedo salirme?</strong><span style={{ fontSize: 13, color: SUAVE, marginTop: -6 }}>Sí, cuando quieras, desde la Fan Zone. Tus boletos y lugares apartados se quedan; tu número de socio no se guarda.</span>
      </Caja>
    </Pantalla>
  );
}

function Unirse({ alUnirse }: { alUnirse: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  return (
    <>
      <button className="boton" style={botonOro} disabled={enviando} onClick={async () => {
        setEnviando(true); setErr("");
        const { error } = await supabase.rpc("fan_join");
        setEnviando(false);
        if (error) setErr(mensajeError(error)); else alUnirse();
      }}>{enviando ? "Un momento…" : "Unirme al Club Fan · gratis"}</button>
      {err && <p className="aviso error" role="alert" style={{ margin: 0 }}>{err}</p>}
    </>
  );
}

function Salir({ numero, alSalir }: { numero: string; alSalir: () => void }) {
  const [msg, setMsg] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
      <button className="liga" style={{ alignSelf: "flex-start", fontSize: 13, fontWeight: 700, color: SUAVE }} onClick={async () => {
        if (!window.confirm(`¿Salir del Club Fan? Dejas de ver la Fan Zone, las preventas y los eventos del club, y pierdes tu número de socio ${numero} (si vuelves, te toca uno nuevo). Tus boletos y lugares apartados se quedan.`)) return;
        const { error } = await supabase.rpc("fan_leave");
        if (error) return setMsg(mensajeError(error));
        alSalir();
      }}>Salir del Club Fan</button>
      {msg && <p style={{ margin: 0, fontSize: 13, color: "#ff8fa3" }}>{msg}</p>}
    </div>
  );
}

function Credencial({ nombre, c }: { nombre: string; c: CredencialFan }) {
  const desde = new Intl.DateTimeFormat("es-MX", { year: "numeric", timeZone: "America/Mexico_City" }).format(new Date(c.desde));
  return (
    <div role="group" aria-label={`Credencial del Club Fan de ${nombre}, miembro ${numeroSocio(c.numero)}`}
      style={{ position: "relative", overflow: "hidden", aspectRatio: "1.6 / 1", borderRadius: 22, border: "1px solid rgba(215,187,95,0.45)", padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between",
        boxShadow: "0 0 70px -20px rgba(215,187,95,0.55)", background: "radial-gradient(90% 120% at 100% 0%, rgba(215,187,95,0.18), transparent 55%), linear-gradient(160deg, #1a1622, #0b0910)" }}>
      <img src="/marca/sello-club.svg" alt="" aria-hidden="true" style={{ position: "absolute", right: -50, top: -50, width: "48%", opacity: 0.5 }} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", color: ORO }}>Club Fan DARF</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ maxWidth: "72%", fontSize: 19, fontWeight: 900, textTransform: "uppercase", lineHeight: 1.15 }}>{nombre}</span>
        <span style={{ fontSize: 12, color: SUAVE }}>Miembro <b style={{ color: ORO_CLARO }}>{numeroSocio(c.numero)}</b> · Desde <b style={{ color: ORO_CLARO }}>{desde}</b></span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        {c.fundador ? <span style={{ ...chip(true), padding: "4px 10px", fontSize: 10 }}>Fan fundador</span> : <span />}
        <img src="/marca/darf-monograma-oro.svg" alt="" aria-hidden="true" style={{ height: 34, width: "auto" }} />
      </div>
    </div>
  );
}

function Preventa({ x }: { x: PreventaObra }) {
  const navegar = useNavigate();
  const [on, setOn] = useState(x.recordatorio);
  const [msg, setMsg] = useState("");
  const h = x.hasta ? partesFuncion(x.hasta) : null;
  return (
    <Caja estilo={{ background: `linear-gradient(100deg, rgba(215,187,95,0.14), ${CAJA} 60%)`, borderColor: "rgba(215,187,95,0.4)" }}>
      <strong style={{ fontSize: 16 }}>{x.estado === "abierta" ? `Preventa de ${x.nombre} abierta para el Club Fan` : `Preventa de ${x.nombre} para el Club Fan`}</strong>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: SUAVE }}>
        {x.estado === "abierta" && h ? `Compras antes que nadie, hasta el ${h.dia} ${h.numero} ${h.mes}, ${h.hora}. Después se abre para todos.` : "Tienes acceso antes de la venta general. Te avisamos en tu cuenta y en tu teléfono el día que abra."}
      </span>
      {x.estado === "abierta"
        ? <button className="boton" style={{ ...botonOro, minHeight: 44 }} onClick={() => navegar(`/obras/${x.pid}`)}>Entrar a preventa</button>
        : <button className="boton" aria-pressed={on} style={on ? { minHeight: 44, background: "transparent", border: `1.5px solid ${ORO}`, color: ORO_CLARO } : { ...botonOro, minHeight: 44 }} onClick={async () => {
            const { error } = await supabase.rpc("preventa_recordar", { pid: x.pid, p_on: !on });
            if (error) return setMsg(mensajeError(error));
            setOn(!on);
            setMsg(!on ? "Listo: te avisamos en tu cuenta y en tu teléfono cuando abra la preventa." : "Recordatorio desactivado.");
          }}>{on ? "✓ Recordatorio activo" : "Activar recordatorio"}</button>}
      {msg && <span style={{ fontSize: 12, color: SUAVE }}>{msg}</span>}
    </Caja>
  );
}

function Regresiva({ hasta }: { hasta: string }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((Date.parse(hasta) - ahora) / 1000));
  const partes: [number, string][] = [[Math.floor(s / 86400), "días"], [Math.floor((s % 86400) / 3600), "horas"], [Math.floor((s % 3600) / 60), "min"], [s % 60, "seg"]];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {partes.map(([n, t]) => (
        <div key={t} style={{ flex: 1, padding: "8px 0", borderRadius: 12, border: `1px solid ${LINEA}`, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <b style={{ fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{String(n).padStart(2, "0")}</b>
          <span style={{ fontSize: 10, color: SUAVE, textTransform: "uppercase", letterSpacing: "0.12em" }}>{t}</span>
        </div>
      ))}
    </div>
  );
}

function Anuncios({ lista }: { lista: AnuncioVista[] }) {
  return (
    <>
      <span className="etiqueta" style={{ color: ORO, marginTop: 8 }}>Solo para la comunidad</span>
      <h2 className="titulo-seccion" style={{ fontSize: 22, marginTop: -10 }}>Anuncios</h2>
      {lista.map((a) => <AnuncioTarjeta key={a.id} a={a} />)}
    </>
  );
}

function AnuncioTarjeta({ a }: { a: AnuncioVista }) {
  const navegar = useNavigate();
  const [apuntado, setApuntado] = useState(a.apuntado);
  const [msg, setMsg] = useState("");
  const esperando = !a.revelado && !!a.revela_at;
  return (
    <Caja>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: ORO }}>{TIPOS_ANUNCIO[a.tipo]}</span>
        {a.solo_club && <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 100, border: `1px solid ${ORO}`, color: ORO_CLARO, textTransform: "uppercase" }}>Solo Club Fan</span>}
      </div>
      <strong style={{ fontSize: 19, lineHeight: 1.2 }}>{a.titulo}</strong>
      {a.adelanto && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, opacity: 0.85 }}>{a.adelanto}</p>}
      {esperando && a.revela_at && <><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", color: SUAVE }}>Se revela en</span><Regresiva hasta={a.revela_at} /></>}
      {!a.bloqueado && a.imagen_url && <img src={a.imagen_url} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 16 }} />}
      {!a.bloqueado && a.contenido && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line" }}>{a.contenido}</p>}
      {!a.bloqueado && a.enlace && (
        <button className="boton" style={{ ...botonOro, minHeight: 42, fontSize: 11, alignSelf: "flex-start", padding: "0 18px" }}
          onClick={() => (a.enlace!.startsWith("/") ? navegar(a.enlace!.replace(/^\/producciones\//, "/obras/")) : abrir(a.enlace!))}>{a.boton || "Ver más"}</button>
      )}
      {esperando && a.registro && (
        <button className="boton" aria-pressed={apuntado} style={apuntado ? { minHeight: 42, fontSize: 11, alignSelf: "flex-start", background: "transparent", border: `1.5px solid ${ORO}`, color: ORO_CLARO } : { ...botonOro, minHeight: 42, fontSize: 11, alignSelf: "flex-start", padding: "0 18px" }}
          onClick={async () => {
            const { error } = await supabase.rpc("anuncio_registro", { aid: a.id, p_on: !apuntado });
            if (error) return setMsg(error.message);
            setMsg(!apuntado ? "Listo: te avisamos en tu cuenta y en tu teléfono cuando se revele." : "Ya no te avisaremos de este anuncio.");
            setApuntado(!apuntado);
          }}>{apuntado ? "✓ Te avisaremos" : "Avísame"}</button>
      )}
      {msg && <span style={{ fontSize: 12, color: SUAVE }}>{msg}</span>}
    </Caja>
  );
}

function Item({ it, obra }: { it: FanItemVista; obra?: string }) {
  const [play, setPlay] = useState(false);
  const etiqueta = <span style={{ position: "absolute", left: 10, top: 10, zIndex: 2, ...chip(true), padding: "4px 9px", fontSize: 10 }}>{ETIQUETA[it.categoria]}</span>;
  const pie = (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "12px 16px 16px" }}>
      <strong style={{ lineHeight: 1.3 }}>{it.titulo}</strong>
      <span style={{ fontSize: 12, color: SUAVE }}>{[obra, it.tipo === "enlace" && it.url ? dominio(it.url) : null].filter(Boolean).join(" · ")}</span>
      {it.descripcion && it.tipo !== "texto" && <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.5, color: SUAVE, whiteSpace: "pre-line" }}>{it.descripcion}</p>}
    </div>
  );
  const caja: CSSProperties = { borderRadius: 22, overflow: "hidden", background: CAJA, border: `1px solid ${LINEA}` };
  if (it.tipo === "video" && it.youtube_id) {
    return (
      <article style={caja}>
        <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#000000" }}>
          {etiqueta}
          {play
            ? <iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(it.youtube_id)}?autoplay=1&playsinline=1&rel=0`} title={it.titulo} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
            : <button aria-label={`Reproducir ${it.titulo}`} onClick={() => setPlay(true)} style={{ position: "absolute", inset: 0, padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                <img src={`https://i.ytimg.com/vi/${it.youtube_id}/hqdefault.jpg`} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 56, height: 56, borderRadius: 28, background: "rgba(8,7,12,0.8)", border: "1px solid rgba(255,255,255,0.3)", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>▶</span>
              </button>}
        </div>
        {pie}
      </article>
    );
  }
  if (it.tipo === "foto" && it.archivo_url) {
    return (
      <article style={caja}>
        <button onClick={() => abrir(it.archivo_url!)} style={{ position: "relative", display: "block", width: "100%", aspectRatio: "16 / 9", padding: 0, border: "none", background: "#000000" }}>
          {etiqueta}<img src={it.archivo_url} alt={it.titulo} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </button>
        {pie}
      </article>
    );
  }
  if (it.tipo === "texto") {
    return (
      <article style={{ ...caja, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: ORO }}>{ETIQUETA[it.categoria]}</span>
        <strong style={{ fontSize: 18 }}>{it.titulo}</strong>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: SUAVE, whiteSpace: "pre-line" }}>{it.descripcion}</p>
        {obra && <span style={{ fontSize: 12, color: SUAVE }}>{obra}</span>}
      </article>
    );
  }
  const href = it.tipo === "documento" ? it.archivo_url : it.url;
  return (
    <article style={caja}>
      <button onClick={() => href && abrir(href)} style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: ORO, fontSize: 36,
        background: `radial-gradient(70% 60% at 50% 40%, rgba(215,187,95,0.18), transparent 70%), ${CAJA}` }}>
        {etiqueta}<span aria-hidden="true">{it.tipo === "documento" ? "📄" : "↗"}</span>
        <span style={{ position: "absolute", right: 12, bottom: 10, fontSize: 11, fontWeight: 800, color: ORO_CLARO }}>{it.tipo === "documento" ? "Abrir PDF" : "Ir al enlace"} ›</span>
      </button>
      {pie}
    </article>
  );
}

function Proximo({ p, obra }: { p: FanProximo; obra?: string }) {
  return (
    <article style={{ borderRadius: 22, overflow: "hidden", background: CAJA, border: `1px solid ${LINEA}` }} aria-label={`${p.titulo}: se desbloquea el ${fecha(p.disponible_desde)}`}>
      <div style={{ aspectRatio: "16 / 9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(160deg,#1a1622,#0b0910)" }}>
        <span aria-hidden="true" style={{ fontSize: 26 }}>🔒</span>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: ORO }}>Se desbloquea el {fecha(p.disponible_desde)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "12px 16px 16px" }}>
        <strong>{p.titulo}</strong>
        <span style={{ fontSize: 12, color: SUAVE }}>{[obra, FAN_CATEGORIAS[p.categoria]].filter(Boolean).join(" · ")} · Solo Club Fan</span>
      </div>
    </article>
  );
}

// ── Un evento (0081): apartar, pagar por WhatsApp, recordarme o entrar a la transmisión ───────────────────────────
function EventoTarjeta({ e, sesion, socio, mostrarObra = true, recargar }: { e: Evento; sesion: boolean; socio: boolean; mostrarObra?: boolean; recargar: () => void }) {
  const navegar = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const f = partesFuncion(e.starts_at);
  const accion = accionEvento(e, { sesion, socio });
  const enLinea = e.tipo === "en_linea";
  const correr = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setEnviando(true);
    const { error } = await fn();
    setEnviando(false);
    setMsg(error ? { ok: false, t: mensajeError(error) } : { ok: true, t: ok });
    if (!error) recargar();
  };
  const apartar = (on: boolean) => correr(async () => supabase.rpc("fan_encuentro_apartar", { eid: e.id, p_on: on }),
    on ? (e.precio != null && Number(e.mi_precio ?? 0) > 0 ? "Lugar apartado. Paga por WhatsApp para confirmarlo." : "¡Lugar apartado! Te avisamos una hora antes.") : "Liberaste tu lugar.");
  const entrar = async () => {
    const { data } = await supabase.rpc("evento_entrar", { eid: e.id });
    if (typeof data === "string" && data.startsWith("https://")) void abrir(data);
    else setMsg({ ok: false, t: "La transmisión todavía no abre." });
  };
  const btn = (texto: string, fn: () => void, contorno = false) => (
    <button className="boton" disabled={enviando} onClick={fn} style={contorno ? { minHeight: 40, fontSize: 11, padding: "0 16px", background: "transparent", border: `1.5px solid ${LINEA}`, color: "#ffffff" } : { ...botonOro, minHeight: 40, fontSize: 11, padding: "0 16px" }}>{enviando ? "…" : texto}</button>
  );
  return (
    <div style={{ padding: 14, borderRadius: 18, border: `1px solid ${LINEA}`, background: "rgba(8,7,12,0.4)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingRight: 14, borderRight: "1px solid rgba(255,255,255,0.1)" }}>
          <small style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: ORO }}>{f.dia}</small>
          <b style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{f.numero}</b>
          <small style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: SUAVE }}>{f.mes}</small>
        </div>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: ORO }}>
            {e.categoria || TIPOS_EVENTO[e.tipo].label}
            {e.en_vivo && <span style={{ padding: "2px 7px", borderRadius: 100, background: "#d20122", color: "#ffffff", fontSize: 9 }}>En vivo</span>}
            <span style={{ padding: "2px 7px", borderRadius: 100, border: `1px solid ${LINEA}`, color: ORO_CLARO, fontSize: 9 }}>{ACCESO_EVENTO[e.acceso].corto}</span>
          </span>
          <strong style={{ fontSize: 15 }}>{e.titulo}</strong>
          <span style={{ fontSize: 12, color: SUAVE }}>{f.hora}{enLinea ? " · En línea" : e.venue ? ` · ${e.venue}` : ""}{mostrarObra && e.obra ? ` · ${e.obra}` : ""}</span>
          {e.requiere_registro && e.cupo != null && !enLinea && <span style={{ fontSize: 12, color: ORO_CLARO }}>{e.apartado ? "✓ Tienes lugar" : e.libres === 0 ? "Sin lugares" : `${e.libres} ${e.libres === 1 ? "lugar" : "lugares"}`}</span>}
          {e.apartado && enLinea && <span style={{ fontSize: 12, color: ORO_CLARO }}>✓ Registrado</span>}
          {e.precio != null && <span style={{ fontSize: 12, fontWeight: 800 }}>{precioTexto(e)}{sesion && e.mi_precio != null && e.precio_socio != null && !e.apartado && <span style={{ fontWeight: 500, color: SUAVE }}> · a ti te toca ${Number(e.mi_precio).toLocaleString("es-MX")}</span>}</span>}
        </div>
      </div>
      {e.descripcion && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: SUAVE }}>{e.descripcion}</p>}
      {e.notas && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: SUAVE }}>{e.notas}</p>}
      {accion === "pagar" && e.orden_codigo && (
        <p className="aviso" style={{ margin: 0, background: "rgba(217,119,6,0.1)", borderColor: "rgba(217,119,6,0.5)" }}>
          <b>Lugar apartado, falta tu pago.</b> Total ${Number(e.orden_monto ?? 0).toLocaleString("es-MX")} · Código <b>{e.orden_codigo}</b>
          {e.orden_expira && <><br />Paga antes de <b>{limiteTexto(e.orden_expira)}</b>; si no, tu lugar se libera solo.</>}
        </p>
      )}
      {accion === "pagado" && <span style={{ fontSize: 13, fontWeight: 800, color: "#22c55e" }}>✓ Pagado · {e.orden_codigo}</span>}
      {!enLinea && accion !== "pagar" && (e.apartado || (!e.requiere_registro && e.acceso === "club")) && <span style={{ fontSize: 13, fontWeight: 800, color: ORO_CLARO }}>Muestra tu credencial (con QR) en la entrada.</span>}
      {!enLinea && !e.requiere_registro && e.acceso !== "club" && <span style={{ fontSize: 13, color: SUAVE }}>Entrada libre{e.cupo ? ` hasta llenar el cupo (${e.cupo})` : ""}.</span>}
      {enLinea && !e.liga && <span style={{ fontSize: 13, color: SUAVE }}>La liga para entrar aparece aquí 15 minutos antes.</span>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {accion === "entrar" && btn("Entrar a la transmisión", entrar)}
        {accion === "apartar" && btn(e.precio != null && Number(e.mi_precio ?? 0) > 0 ? `Apartar · $${Number(e.mi_precio).toLocaleString("es-MX")}` : enLinea ? "Registrarme" : "Apartar mi lugar", () => apartar(true))}
        {accion === "pagar" && e.orden_codigo && env.whatsapp && btn("Pagar por WhatsApp", () => abrir(whatsappEventoUrl(env.whatsapp, { titulo: e.titulo, obra: e.obra, codigo: e.orden_codigo!, monto: Number(e.orden_monto ?? 0) })))}
        {accion === "pagar" && <button className="liga" style={{ fontSize: 12, fontWeight: 700, color: SUAVE }} onClick={() => { if (window.confirm("¿Cancelar tu apartado? Se libera tu lugar.")) void apartar(false); }}>Cancelar apartado</button>}
        {accion === "liberar" && btn("Liberar mi lugar", () => apartar(false), true)}
        {accion === "recordar" && btn(e.recordar ? "✓ Te recordaremos" : "Recordarme", () => correr(async () => supabase.rpc("evento_recordar", { eid: e.id, p_on: !e.recordar }), !e.recordar ? "Listo: te avisamos una hora antes." : "Recordatorio desactivado."), e.recordar)}
        {accion === "boleto" && e.production_id && <button className="liga" style={{ fontSize: 13, fontWeight: 800, color: ORO_CLARO }} onClick={() => navegar(`/obras/${e.production_id}`)}>Necesitas boleto para esta función ›</button>}
        {accion === "entrar_sesion" && <Link to="/acceso" onClick={() => recordarRegreso("/eventos")} className="boton" style={{ minHeight: 40, fontSize: 11, padding: "0 16px", background: "transparent", border: `1.5px solid ${LINEA}`, color: "#ffffff" }}>Entra para apartar</Link>}
        {accion === "unirse_club" && <Link to="/fan-zone" className="boton" style={{ minHeight: 40, fontSize: 11, padding: "0 16px", background: "transparent", border: `1.5px solid ${LINEA}`, color: "#ffffff" }}>Únete al Club Fan</Link>}
        {accion === "lleno" && <span style={{ fontSize: 13, color: SUAVE }}>Ya no hay lugares.</span>}
        {accion === "cerrado" && <span style={{ fontSize: 13, color: SUAVE }}>El registro está cerrado.</span>}
      </div>
      {msg && <span role="status" style={{ fontSize: 12, color: msg.ok ? "#22c55e" : "#ff8fa3" }}>{msg.t}</span>}
    </div>
  );
}

// ── Todos los eventos (igual que /eventos) ───────────────────────────────────────────────────────────────────────
export function Eventos() {
  const { sesion } = useSesion();
  const uid = sesion?.user.id ?? null;
  const [version, setVersion] = useState(0);
  const { datos, cargando, error } = useCarga(async () => {
    const [eventos, cartelera, s] = await Promise.all([leerEventos(null), leerEventosCartelera(30), uid ? leerSocio() : Promise.resolve({ socio: false, credencial: null })]);
    return { eventos, cartelera, socio: s.socio || !!s.credencial };
  }, [uid, version]);
  const visibles = new Set((datos?.eventos ?? []).map((e) => e.id));
  const bloqueados: EventoCartelera[] = (datos?.cartelera ?? []).filter((e) => !visibles.has(e.id));
  const enVivo = (datos?.eventos ?? []).filter((e) => e.en_vivo);
  const proximos = (datos?.eventos ?? []).filter((e) => !e.en_vivo);
  const recargar = () => setVersion((v) => v + 1);
  return (
    <Pantalla>
      <span className="etiqueta" style={{ color: ORO }}>DARF Productions</span>
      <h1 className="titulo-grande" style={{ marginTop: -8 }}>Eventos</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: SUAVE }}>Fotos con el elenco, tours por backstage, ensayos abiertos, meet & greets y transmisiones exclusivas.{datos && !datos.socio && " Muchos son del Club Fan (es gratis)."}</p>
      {cargando && !datos && <div className="esqueleto" style={{ height: 240, background: CAJA }} />}
      {error && <p className="aviso error">No pudimos cargar los eventos. Revisa tu conexión.</p>}
      {enVivo.length > 0 && <><h2 className="titulo-seccion">Ahora</h2>{enVivo.map((e) => <EventoTarjeta key={e.id} e={e} sesion={!!sesion} socio={!!datos?.socio} recargar={recargar} />)}</>}
      {datos && (
        <>
          <h2 className="titulo-seccion">Próximos</h2>
          {proximos.length
            ? proximos.map((e) => <EventoTarjeta key={e.id} e={e} sesion={!!sesion} socio={datos.socio} recargar={recargar} />)
            : <p style={{ margin: 0, fontSize: 14, color: SUAVE }}>Por ahora no hay eventos{sesion ? ". Te avisamos en tu cuenta cuando haya." : " públicos. Entra para ver los de tu cuenta y del Club Fan."}</p>}
        </>
      )}
      {bloqueados.length > 0 && (
        <>
          <h2 className="titulo-seccion">{sesion ? "Del Club Fan" : "Más eventos"}</h2>
          <p style={{ margin: 0, fontSize: 14, color: SUAVE }}>{sesion ? "Únete gratis al Club Fan para apartar tu lugar y entrar." : "Entra con tu cuenta para verlos; algunos son exclusivos del Club Fan (es gratis)."}</p>
          {bloqueados.map((e) => {
            const f = partesFuncion(e.starts_at);
            return (
              <Link key={e.id} to={sesion ? "/fan-zone" : "/acceso"} onClick={() => !sesion && recordarRegreso("/eventos")} style={{ padding: 14, borderRadius: 18, border: `1px solid ${LINEA}`, display: "flex", alignItems: "center", gap: 14, color: "#ffffff" }}>
                <span aria-hidden="true" style={{ fontSize: 20 }}>🔒</span>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  <strong>{e.titulo}</strong>
                  <span style={{ fontSize: 12, color: SUAVE }}>{f.dia} {f.numero} {f.mes} · {f.hora}{e.obra ? ` · ${e.obra}` : ""} · {ACCESO_EVENTO[e.acceso].corto}</span>
                </span>
                <span style={{ color: ORO_CLARO }}>›</span>
              </Link>
            );
          })}
        </>
      )}
    </Pantalla>
  );
}
