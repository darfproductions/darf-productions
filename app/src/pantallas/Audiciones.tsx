import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ageAt, ESTADO_SOLICITUD, etiquetaConvocatoria, faltantesSolicitud, inscripcionAbierta, lugares, MODALIDAD, whatsappAudicionUrl } from "@/lib/audition-rules";
import { checkImage } from "@/lib/image-rules";
import { compressImage } from "@/lib/image-compress";
import { mensajeError } from "@/lib/errores";
import { CATEGORIAS, GENEROS, HABILIDADES, NINGUNA_HABILIDAD, NIVELES, resumenPersonaje, TESITURAS } from "@/lib/produccion-nueva-rules";
import { partesFormato } from "@/lib/texto-formato";
import { diasAudicion } from "@/lib/turno-rules";
import { Icono } from "~/componentes/Icono";
import { useApariencia } from "~/lib/apariencia";
import { formatSlot, leerAudicion, leerAudiciones, numeroVisible, textoCallback, type DetalleAudicion, type MyApplication } from "~/lib/audiciones";
import { imagen } from "~/lib/datos";
import { env } from "~/lib/env";
import { leerPerfil } from "~/lib/cuenta";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { paletaObra, variables } from "~/lib/tema";
import { abrir, abrirWeb, useCarga } from "~/lib/usar";

// Audiciones nativas (igual que /audiciones y /audiciones/[id] en la web): convocatorias, Registro permanente, mis
// inscripciones con su QR, invitaciones y el formulario de inscripción completo (foto, personajes, perfil artístico,
// horario, preguntas, tutor). La base valida todo otra vez (audition_apply).

const ESPECIALIDADES = ["Actuación", "Canto", "Baile", "Música en vivo", "Dirección", "Producción", "Técnica / crew", "Vestuario y maquillaje"];

function Formato({ texto, estilo }: { texto: string; estilo?: CSSProperties }) {
  return (
    <p style={{ margin: 0, whiteSpace: "pre-line", ...estilo }}>
      {partesFormato(texto).map((p, i) => (
        <span key={i} style={{ fontWeight: p.negrita ? 800 : undefined, fontStyle: p.cursiva ? "italic" : undefined, textDecoration: p.subrayado ? "underline" : undefined }}>{p.texto}</span>
      ))}
    </p>
  );
}

function Volver({ a = "/" }: { a?: string }) {
  const navegar = useNavigate();
  return <button className="circulo" aria-label="Volver" onClick={() => (window.history.length > 1 ? navegar(-1) : navegar(a))}><Icono nombre="atras" /></button>;
}

function Estado({ estado }: { estado: string }) {
  const verde = ["convocado", "seleccionado", "callback"].includes(estado);
  const gris = ["cancelado", "no_seleccionado", "no_cumple"].includes(estado);
  return (
    <span className="pildora" style={{ background: verde ? "rgba(34,197,94,0.16)" : gris ? "var(--linea)" : "rgba(124,58,237,0.16)", color: verde ? "#16a34a" : gris ? "var(--suave)" : "var(--acento)" }}>
      {ESTADO_SOLICITUD[estado]?.label ?? estado}
    </span>
  );
}

// ── Lista ────────────────────────────────────────────────────────────────────────────────────────────────────────
export function Audiciones() {
  const { sesion } = useSesion();
  const uid = sesion?.user.id ?? null;
  const { datos, cargando, error } = useCarga(() => leerAudiciones(uid), [uid]);

  return (
    <main className="pantalla sin-barra">
      <div className="contenido" style={{ gap: 14 }}>
        <Volver />
        <span className="etiqueta">Audiciones</span>
        <h1 className="titulo-grande" style={{ marginTop: -8 }}>Únete al elenco</h1>
        <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>Convocatorias abiertas y registro permanente de talento: actores, cantantes, bailarines, músicos y equipo técnico.</p>
        {cargando && <div className="esqueleto" style={{ height: 200 }} />}
        {error && <p className="aviso error">No pudimos cargar las audiciones. Revisa tu conexión.</p>}

        {datos && datos.invitaciones.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="titulo-seccion">Te invitaron a audicionar</h2>
            {datos.invitaciones.map((i) => (
              <Link key={i.audition_id} to={`/audiciones/${i.audition_id}`} className="tarjeta" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12, borderColor: "rgba(215,187,95,0.6)" }}>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="suave" style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>{i.obra ?? "Convocatoria"}</span>
                  <span style={{ fontWeight: 800 }}>{i.titulo}</span>
                  {i.inscripcion_cierra && <span className="suave" style={{ fontSize: 12 }}>Inscripción hasta el {formatSlot(i.inscripcion_cierra).toLowerCase()}</span>}
                </span>
                <span className="boton principal" style={{ minHeight: 38, fontSize: 11, padding: "0 14px" }}>Inscribirme</span>
              </Link>
            ))}
          </section>
        )}

        {datos && datos.mias.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="titulo-seccion">Mis audiciones</h2>
            {datos.mias.map((m) => <MiTarjeta key={m.id} m={m} />)}
          </section>
        )}

        {datos && (
          <section style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            <h2 className="titulo-seccion">Convocatorias</h2>
            {datos.convocatorias.length === 0 ? (
              <div className="aviso">
                <b>No hay convocatorias abiertas en este momento.</b><br />Cuando abramos una, aparecerá aquí con sus requisitos, fechas y formulario de inscripción.
              </div>
            ) : datos.convocatorias.map((a) => (
              <Link key={a.id} to={`/audiciones/${a.id}`} className="tarjeta" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="suave" style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>{a.productions?.nombre ?? "Convocatoria general"} · {etiquetaConvocatoria(a)}</span>
                <span style={{ fontSize: 18, fontWeight: 900 }}>{a.titulo}</span>
                {a.inscripcion_cierra && <span className="suave" style={{ fontSize: 13 }}>Inscripción hasta el {formatSlot(a.inscripcion_cierra).toLowerCase()}</span>}
                <span style={{ marginTop: 6, fontSize: 13, fontWeight: 800, color: "var(--acento)" }}>{inscripcionAbierta(a) ? "Ver e inscribirme ›" : "Ver detalles ›"}</span>
              </Link>
            ))}
          </section>
        )}

        {datos && (
          <section style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            <h2 className="titulo-seccion">Registro permanente</h2>
            <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>Déjanos tu perfil artístico aunque no haya convocatoria. Lo consultamos cuando preparamos una producción nueva.</p>
            {datos.permanente ? (
              <div className="tarjeta" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ESPECIALIDADES.map((e) => <span key={e} style={{ padding: "5px 11px", borderRadius: 100, border: "1px solid var(--linea)", fontSize: 12 }}>{e}</span>)}
                </div>
                <Link to={`/audiciones/${datos.permanente.id}`} className="boton principal">Registrarme</Link>
              </div>
            ) : <p className="aviso">Muy pronto podrás dejarnos tu perfil aquí.</p>}
          </section>
        )}
      </div>
    </main>
  );
}

function MiTarjeta({ m }: { m: MyApplication }) {
  const n = numeroVisible(m);
  const cb = m.estado === "callback" && m.auditions?.fase === "callback" ? textoCallback(m.auditions.callback_cuando, m.auditions.callback_fecha, m.auditions.callback_lugar) : null;
  return (
    <Link to={`/audiciones/${m.audition_id}`} className="tarjeta" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 900, fontSize: 16 }}>{m.auditions?.titulo ?? "Audición"}</span>
        <Estado estado={m.estado} />
      </div>
      {m.audition_slots && <span className="suave" style={{ fontSize: 13 }}>{formatSlot(m.audition_slots.inicia)}{m.audition_slots.sala ? ` · ${m.audition_slots.sala}` : ""}</span>}
      {n && <span style={{ fontSize: 13 }}>Tu número: <b>{n}</b></span>}
      {cb && <span style={{ fontSize: 13, fontWeight: 800, color: "#16a34a" }}>¡Pasaste a callback! {cb}.</span>}
      {m.completar_pedido_at && !m.checked_in_at
        ? <span style={{ fontSize: 13, fontWeight: 800, color: "#d97706" }}>El equipo te pidió completar tu inscripción ›</span>
        : <span style={{ fontSize: 13, fontWeight: 800, color: "var(--acento)" }}>{m.checked_in_at || ["cancelado", "no_cumple"].includes(m.estado) ? "Ver convocatoria ›" : "Ver mi QR ›"}</span>}
    </Link>
  );
}

// ── Detalle e inscripción ────────────────────────────────────────────────────────────────────────────────────────
export function Audicion() {
  const { id = "" } = useParams();
  const { sesion } = useSesion();
  const uid = sesion?.user.id ?? null;
  const { modo } = useApariencia();
  const [version, setVersion] = useState(0);
  const { datos, cargando, error } = useCarga(() => leerAudicion(id, uid), [id, uid, version]);
  const paleta = useMemo(() => (datos?.obra ? paletaObra(datos.obra, modo) : null), [datos, modo]);

  if (cargando && !datos) return <main className="pantalla sin-barra"><div className="contenido" style={{ gap: 14 }}><Volver a="/audiciones" /><div className="esqueleto" style={{ height: 360 }} /></div></main>;
  if (error || !datos) {
    return (
      <main className="pantalla sin-barra"><div className="contenido" style={{ gap: 14 }}><Volver a="/audiciones" />
        <p className="aviso">{error ? "No pudimos cargar la convocatoria. Revisa tu conexión." : "Esta convocatoria no existe o ya no está disponible."}</p>
      </div></main>
    );
  }
  return <DetalleVista d={datos} estilo={paleta ? (variables(paleta) as CSSProperties) : undefined} recargar={() => setVersion((v) => v + 1)} />;
}

function Caja({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <section style={{ padding: 16, borderRadius: 20, background: "var(--superficie, var(--tarjeta))", border: "1px solid var(--linea)", display: "flex", flexDirection: "column", gap: 10 }}>
      {titulo && <span className="suave" style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>{titulo}</span>}
      {children}
    </section>
  );
}

function DetalleVista({ d, estilo, recargar }: { d: DetalleAudicion; estilo?: CSSProperties; recargar: () => void }) {
  const { sesion } = useSesion();
  const { a, obra, mia, roles, slots, fichas, invitacion, qr } = d;
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const enLinea = a.modalidad === "en_linea";
  const abierta = inscripcionAbierta(a);
  const puede = a.solo_invitados ? invitacion : !!sesion;
  const pedido = !!mia?.completar_pedido_at && !mia.checked_in_at && ["abierta", "cerrada"].includes(a.estado) && !["cancelado", "no_cumple"].includes(mia.estado);
  const nombreObra = a.productions?.nombre || obra?.nombre || a.titulo;
  const wa = whatsappAudicionUrl(env.whatsapp, nombreObra, mia?.nombre ?? null);
  const edades = a.edad_min || a.edad_max ? `${a.edad_min ? `de ${a.edad_min}` : ""}${a.edad_max ? ` hasta ${a.edad_max}` : ""} años` : null;
  const dias = enLinea ? [] : diasAudicion(slots);
  const ficha = new Map(fichas.map((f) => [f.id, f]));
  const logo = obra?.logo_path ? imagen(obra.logo_path) : null;
  const ambiente = obra?.ambiente_path ? imagen(obra.ambiente_path) : null;
  const cb = mia && mia.estado === "callback" && mia.auditions?.fase === "callback" ? textoCallback(mia.auditions.callback_cuando, mia.auditions.callback_fecha, mia.auditions.callback_lugar) : null;
  const n = mia ? numeroVisible(mia) ?? mia.numero : null;

  const cancelar = async () => {
    if (!mia || !window.confirm("¿Cancelar tu inscripción?")) return;
    const { error } = await supabase.rpc("audition_cancel_mine", { app: mia.id });
    setMsg(error ? { ok: false, t: mensajeError(error) } : { ok: true, t: "Inscripción cancelada." });
    if (!error) recargar();
  };

  return (
    <main className="pantalla sin-barra" style={{ ...estilo, background: "var(--fondo)", color: "var(--texto)", minHeight: "100dvh" }}>
      {logo ? (
        <header style={{ position: "relative", overflow: "hidden", margin: "calc(-14px - var(--arriba)) -20px 0" }}>
          {ambiente && <img src={ambiente} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, color-mix(in srgb, var(--fondo) 30%, transparent), var(--fondo))" }} />
          <div className="contenido" style={{ alignItems: "center", gap: 12, textAlign: "center", padding: "calc(var(--arriba) + 14px) 20px 20px" }}>
            <div style={{ alignSelf: "stretch" }}><Volver a="/audiciones" /></div>
            <img src={logo} alt={obra?.nombre ?? ""} style={{ maxHeight: 130, maxWidth: "78%", objectFit: "contain" }} />
            <span className="etiqueta">Audiciones · {etiquetaConvocatoria(a)}</span>
            <h1 className="titulo-grande" style={{ marginTop: -6 }}>{a.titulo}</h1>
            {a.descripcion && <Formato texto={a.descripcion} estilo={{ fontSize: 14, lineHeight: 1.6, opacity: 0.9 }} />}
          </div>
        </header>
      ) : null}
      <div className="contenido" style={{ gap: 14 }}>
        {!logo && (
          <>
            <Volver a="/audiciones" />
            <span className="etiqueta">{obra ? obra.nombre : a.permanente ? "Registro permanente" : "Convocatoria general"} · {etiquetaConvocatoria(a)}</span>
            <h1 className="titulo-grande" style={{ marginTop: -8 }}>{a.titulo}</h1>
            {a.descripcion && <Formato texto={a.descripcion} estilo={{ fontSize: 14, lineHeight: 1.6, color: "var(--suave)" }} />}
          </>
        )}
        {obra?.publica && a.production_id && (
          <Link to={`/obras/${a.production_id}`} style={{ fontSize: 13, fontWeight: 800, color: "var(--acento)" }}>Ver la obra {obra.nombre} ›</Link>
        )}

        {mia && mia.estado !== "cancelado" && a.estado !== "cancelada" && (
          <Caja>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 900 }}>Ya estás inscrito</span>
              <Estado estado={mia.estado} />
            </div>
            {qr && !enLinea && (
              <div style={{ alignSelf: "center", padding: 12, borderRadius: 18, background: "#ffffff" }}>
                <img src={qr} alt="Tu QR para la audición" width={220} height={220} style={{ display: "block" }} />
              </div>
            )}
            {qr && !enLinea && <p className="suave" style={{ margin: 0, fontSize: 13, textAlign: "center" }}>Muestra este QR en la mesa de registro el día de la audición. Sube el brillo de tu pantalla.</p>}
            {mia.estado === "inscrito" && !mia.completar_pedido_at && <p className="suave" style={{ margin: 0, fontSize: 13 }}>Tu solicitud está en revisión: te avisamos en tu cuenta cuando la aprueben.</p>}
            {mia.estado === "convocado" && <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#16a34a" }}>¡Tu solicitud fue aprobada! Ya estás en la lista para audicionar.</p>}
            {mia.audition_slots && <p style={{ margin: 0, fontSize: 13 }}>Horario: <b>{formatSlot(mia.audition_slots.inicia)}</b>{mia.audition_slots.sala ? ` · ${mia.audition_slots.sala}` : ""}</p>}
            {!mia.audition_slots && !a.elegir_horario && !enLinea && <p className="suave" style={{ margin: 0, fontSize: 13 }}>Te avisaremos tu horario.</p>}
            {cb && <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#16a34a" }}>¡Pasaste a callback! {cb}.{qr ? " Lleva este mismo QR." : ""}</p>}
            {n && <p style={{ margin: 0, fontSize: 13 }}>Tu {a.numeracion === "personaje" ? "lugar" : "número"}: <b>{n}</b>{!mia.checked_in_at && a.numeracion !== "llegada" ? " (puede ajustarse antes del día)" : ""}</p>}
            {!mia.numero && a.numeracion === "personaje" && !mia.checked_in_at && <p className="suave" style={{ margin: 0, fontSize: 13 }}>Tu lugar para audicionar te llega a tu cuenta cuando cierren las inscripciones (se ordena por personaje).</p>}
            {enLinea && <p className="suave" style={{ margin: 0, fontSize: 13 }}>Audición en línea: el equipo revisará tus videos y te avisará el resultado aquí y en Mi cuenta.</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {wa && <button className="boton contorno" style={{ minHeight: 40, fontSize: 11 }} onClick={() => abrir(wa)}>Dudas por WhatsApp</button>}
              {!mia.checked_in_at && ["inscrito", "convocado", "en_espera"].includes(mia.estado) && (
                <button className="liga" style={{ fontSize: 13, fontWeight: 700, color: "var(--acento)" }} onClick={cancelar}>Cancelar mi inscripción</button>
              )}
            </div>
          </Caja>
        )}
        {msg && <p className={`aviso ${msg.ok ? "" : "error"}`} role="status" style={{ margin: 0 }}>{msg.t}</p>}

        {abierta && !sesion && (
          <Caja>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Para inscribirte necesitas una cuenta DARF.</p>
            <Link to="/acceso" className="boton principal">Entrar o crear cuenta</Link>
          </Caja>
        )}
        {abierta && a.solo_invitados && sesion && !invitacion && !mia && (
          <Caja>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Esta convocatoria es solo por invitación.</p>
            <p className="suave" style={{ margin: 0, fontSize: 13 }}>Si te invitaron, entra con la cuenta del mismo correo al que te llegó la invitación.</p>
          </Caja>
        )}
        {pedido && (
          <div className="aviso" style={{ borderColor: "#d97706" }}>
            <b>Completa tu inscripción.</b> El equipo revisó tu solicitud y te la regresó para que la corrijas.
            {mia?.completar_nota && <><br /><b>Nota del equipo:</b> {mia.completar_nota}</>}
            <br />Corrígelo abajo y dale guardar; el equipo la vuelve a revisar.
          </div>
        )}

        {(abierta || pedido) && sesion && (puede || mia) && !mia?.checked_in_at && (
          <>
            <h2 className="titulo-seccion" style={{ marginTop: 6 }}>{mia && mia.estado !== "cancelado" ? "Editar mi inscripción" : "Inscripción"}</h2>
            {invitacion && (a.edad_min || a.edad_max) && <p className="aviso" style={{ margin: 0 }}>Tienes una invitación directa: puedes inscribirte aunque no cumplas la edad de esta convocatoria. Si eres menor de edad, pide a tu madre, padre o tutor que llene sus datos.</p>}
            <Formulario d={d} alGuardar={recargar} />
          </>
        )}

        {a.estado === "cancelada" && <p className="aviso error">Esta convocatoria se canceló. Gracias por tu interés; te avisaremos de nuevas audiciones aquí.</p>}
        {!abierta && !mia && a.estado !== "cancelada" && <p className="aviso">La inscripción a esta convocatoria está cerrada.</p>}

        <Caja titulo="Detalles">
          <Dato t="Forma" v={`${MODALIDAD[a.modalidad]}${a.solo_invitados ? " · por invitación" : ""}`} />
          {a.sede && !enLinea && <Dato t="Sede" v={a.sede} />}
          {edades && <Dato t="Edad" v={edades} />}
          {dias.length > 0 && <Dato t={dias.length === 1 ? "Fecha de audición" : "Fechas de audición"} v={dias.join("\n")} />}
          {a.inscripcion_cierra && <Dato t="Inscripción hasta" v={formatSlot(a.inscripcion_cierra)} />}
          {a.requisitos && <Formato texto={a.requisitos} estilo={{ fontSize: 13, lineHeight: 1.6, color: "var(--suave)" }} />}
        </Caja>

        {roles.length > 0 && (
          <Caja titulo={`Personajes · ${roles.length}`}>
            <span className="suave" style={{ fontSize: 12, marginTop: -4 }}>Toca un personaje para ver su descripción.</span>
            {roles.map((r) => {
              const f = ficha.get(r.id);
              const resumen = f ? resumenPersonaje({ ...f, categoria: (f.categoria ?? "protagonista") as "protagonista", cupo: f.cupo ?? 1 }) : "";
              const cat = f?.categoria ? CATEGORIAS.find((c) => c.valor === f.categoria)?.label : null;
              return (
                <details key={r.id} style={{ padding: 12, borderRadius: 14, border: "1px solid var(--linea)" }}>
                  <summary style={{ listStyle: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                      {cat && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--acento)" }}>{cat}</span>}
                      <span style={{ fontSize: 16, fontWeight: 900 }}>{r.nombre}</span>
                    </span>
                    <span className="suave"><Icono nombre="abajo" tamano={18} grosor={2} /></span>
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                    {resumen && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--acento)" }}>{resumen}</span>}
                    {(f?.descripcion ?? r.descripcion) && <span style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-line", opacity: 0.85 }}>{f?.descripcion ?? r.descripcion}</span>}
                    {f?.rasgos && <span className="suave" style={{ fontSize: 12 }}>{f.rasgos}</span>}
                  </div>
                </details>
              );
            })}
          </Caja>
        )}
      </div>
    </main>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span className="suave" style={{ fontSize: 12 }}>{t}</span>
      <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "pre-line" }}>{v}</span>
    </div>
  );
}

// ── Formulario ───────────────────────────────────────────────────────────────────────────────────────────────────
const chip = (activo: boolean): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: "pointer",
  border: `1.5px solid ${activo ? "var(--acento)" : "var(--linea)"}`, background: activo ? "color-mix(in srgb, var(--acento) 14%, transparent)" : "transparent",
});
const fmtSlot = (iso: string) => formatSlot(iso);

function Formulario({ d, alGuardar }: { d: DetalleAudicion; alGuardar: () => void }) {
  const { sesion } = useSesion();
  const { a, mia: p, roles, fields, invitacion } = d;
  const uid = sesion!.user.id;
  const slots = a.elegir_horario && a.modalidad !== "en_linea" ? d.slots : [];
  const perfilPide = a.perfil_preguntas ?? [];
  const pide = (q: string) => perfilPide.includes(q);
  const fechaAudicion = d.slots[0]?.inicia ? new Date(d.slots[0].inicia) : new Date();

  const [f, setF] = useState({
    nombre: p?.nombre ?? "", telefono: p?.telefono ?? "", nac: p?.fecha_nacimiento ?? "", slot: p?.slot_id ?? "",
    tutorNombre: p?.tutor_nombre ?? "", tutorTel: p?.tutor_telefono ?? "", tutorCorreo: p?.tutor_email ?? "",
    tesitura: p?.perfil_tesitura ?? "", genero: p?.perfil_genero ?? "", canto: p?.perfil_canto ?? "", baile: p?.perfil_baile ?? "",
    otra: (p?.perfil_habilidades ?? []).filter((h) => !HABILIDADES.includes(h) && h !== NINGUNA_HABILIDAD).join(", "),
    datos: false, tutorOk: false, imagen: p?.consentimiento_imagen ?? false,
  });
  const [sel, setSel] = useState<string[]>(p?.roles ?? []);
  const [habs, setHabs] = useState<string[]>((p?.perfil_habilidades ?? []).filter((h) => HABILIDADES.includes(h) || h === NINGUNA_HABILIDAD));
  const [resp, setResp] = useState<Record<string, string>>(p?.respuestas ?? {});
  const [foto, setFoto] = useState(p?.foto_path ?? "");
  const [fotoMsg, setFotoMsg] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  // Si es su primera inscripción, se llena con su cuenta.
  useEffect(() => {
    if (p) return;
    void leerPerfil(uid).then((pr) => pr && setF((x) => ({ ...x, nombre: x.nombre || pr.nombre || "", telefono: x.telefono || pr.telefono || "", nac: x.nac || pr.fecha_nacimiento || "" })));
  }, [p, uid]);

  const edad = f.nac ? ageAt(f.nac, fechaAudicion) : null;
  const menor = edad !== null && edad < 18 && (a.pedir_tutor || invitacion);
  const habilidades = [...habs, ...f.otra.split(",").map((x) => x.trim()).filter(Boolean)];
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function subirFoto(file: File | undefined) {
    if (!file) return;
    setFotoMsg("");
    setSubiendo(true);
    try {
      const bmp = await createImageBitmap(file);
      const c = await compressImage(file, "retrato");
      const check = checkImage("retrato", { type: file.type, size: c.file.size, width: bmp.width, height: bmp.height });
      bmp.close();
      if (!check.ok) return setFotoMsg(check.errors.join(" "));
      const t = c.file.type;
      const ext = t === "image/png" ? "png" : t === "image/webp" ? "webp" : "jpg";
      const path = `${a.id}/${uid}/foto-${Date.now().toString(36)}.${ext}`;
      const { error } = await supabase.storage.from("audiciones").upload(path, c.file, { contentType: t });
      if (error) return setFotoMsg(`No se pudo subir: ${mensajeError(error)}`);
      setFoto(path);
      setFotoMsg(["Foto lista.", ...check.warnings].join(" "));
    } catch {
      setFotoMsg("No se pudo leer la imagen.");
    } finally {
      setSubiendo(false);
    }
  }

  const enviar = async () => {
    setMsg(null);
    if (!f.nombre.trim() || !f.telefono.trim() || !f.nac) return setMsg({ ok: false, t: "Escribe tu nombre, teléfono y fecha de nacimiento." });
    if (slots.length && !f.slot) return setMsg({ ok: false, t: "Elige tu horario." });
    const faltan = faltantesSolicitud(fields, resp, a.pedir_foto, foto, {
      hayPersonajes: roles.length > 0, personajes: sel, perfilPedido: perfilPide,
      perfil: { tesitura: f.tesitura, genero: f.genero, canto: f.canto, baile: f.baile }, habilidades,
      tutorFaltaCorreo: menor && !f.tutorCorreo.trim(),
    });
    if (faltan.length) return setMsg({ ok: false, t: `Tu solicitud está incompleta. Falta: ${faltan.join(", ")}.` });
    if (menor && (!f.tutorNombre.trim() || !f.tutorTel.trim() || !f.tutorOk)) return setMsg({ ok: false, t: "Completa los datos de tu madre, padre o tutor y su autorización." });
    if (!f.datos) return setMsg({ ok: false, t: "Para inscribirte autoriza el uso de tus datos para esta convocatoria." });
    setEnviando(true);
    try {
      const perfil = perfilPide.length ? { tesitura: f.tesitura, genero: f.genero, canto: f.canto, baile: f.baile, habilidades } : {};
      const { error } = await supabase.rpc("audition_apply", {
        aid: a.id,
        p: {
          nombre: f.nombre.trim(), telefono: f.telefono.trim(), fecha_nacimiento: f.nac, slot_id: f.slot, roles: sel,
          respuestas: Object.fromEntries(Object.entries(resp).map(([k, v]) => [k, v.trim()])), foto_path: foto,
          tutor_nombre: menor ? f.tutorNombre : "", tutor_telefono: menor ? f.tutorTel : "", tutor_email: menor ? f.tutorCorreo : "",
          consentimiento_datos: f.datos, consentimiento_tutor: menor && f.tutorOk, consentimiento_imagen: f.imagen, perfil,
        },
      });
      if (error) return setMsg({ ok: false, t: mensajeError(error) });
      if (perfilPide.length) {
        const { data: app } = await supabase.from("audition_applications").select("id").eq("audition_id", a.id).eq("user_id", uid).maybeSingle();
        if (app) await supabase.rpc("audition_perfil_guardar", { p_app: app.id, p_tesitura: f.tesitura, p_canto: f.canto, p_baile: f.baile, p_genero: f.genero, p_habilidades: habilidades });
      }
      setMsg({ ok: true, t: "¡Listo! Tu inscripción quedó guardada. Tu QR para el día de la audición está arriba." });
      window.scrollTo({ top: 0, behavior: "smooth" });
      alGuardar();
    } finally {
      setEnviando(false);
    }
  };

  const opcionesNivel = (no: string) => NIVELES.map((n) => <option key={n.valor} value={n.valor}>{n.valor === "no" ? no : n.valor === "basico" ? "Básico" : "Con experiencia / formación"}</option>);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label className="campo">Nombre completo<input autoComplete="name" value={f.nombre} onChange={set("nombre")} /></label>
      <label className="campo">Teléfono<input type="tel" inputMode="tel" autoComplete="tel" value={f.telefono} onChange={set("telefono")} /></label>
      <label className="campo">Fecha de nacimiento<input type="date" value={f.nac} onChange={set("nac")} />
        {edad !== null && <span className="suave" style={{ fontSize: 12, fontWeight: 500 }}>Tendrás {edad} años el día de la audición.</span>}
      </label>

      {a.pedir_foto && (
        <div className="campo">Foto (rostro, vertical)
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {foto && <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 22, background: "#16a34a", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}><Icono nombre="palomita" tamano={22} grosor={2.4} /></span>}
            <label className="boton contorno" style={{ minHeight: 44, fontSize: 11 }}>
              {subiendo ? "Subiendo…" : foto ? "Cambiar foto" : "Tomar o elegir foto"}
              <input type="file" accept="image/*" hidden disabled={subiendo} onChange={(e) => { void subirFoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          {fotoMsg && <span className="suave" style={{ fontSize: 12, fontWeight: 500 }}>{fotoMsg}</span>}
        </div>
      )}

      {roles.length > 0 && (
        <div className="campo">¿Para qué personajes audicionas? <span className="suave" style={{ fontWeight: 500 }}>Elige al menos uno.</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {roles.map((r) => {
              const on = sel.includes(r.id);
              return <button key={r.id} type="button" aria-pressed={on} style={chip(on)} onClick={() => setSel(on ? sel.filter((x) => x !== r.id) : [...sel, r.id])}>{on && <Icono nombre="palomita" tamano={14} grosor={2.4} />}{r.nombre}</button>;
            })}
          </div>
        </div>
      )}

      {perfilPide.length > 0 && (
        <Caja titulo="Tu perfil artístico">
          <p className="suave" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>Ayuda al equipo a ver para qué personajes encajas. Si no sabes tu tesitura, elige «No sé»; si no tienes habilidades especiales, marca «Ninguna».</p>
          {pide("tesitura") && (
            <label className="campo">Tesitura
              <select value={f.tesitura} onChange={set("tesitura")}>
                <option value="">Elige…</option>
                {TESITURAS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                <option value="no_se">No sé</option>
              </select>
            </label>
          )}
          {pide("genero") && (
            <label className="campo">Interpreto personajes
              <select value={f.genero} onChange={set("genero")}>
                <option value="">Elige…</option>
                {GENEROS.filter((g) => g.valor !== "cualquiera").map((g) => <option key={g.valor} value={g.valor}>{g.valor === "mujer" ? "Femeninos" : "Masculinos"}</option>)}
                <option value="otro">Ambos / otro</option>
              </select>
            </label>
          )}
          {pide("canto") && <label className="campo">Canto<select value={f.canto} onChange={set("canto")}><option value="">Elige…</option>{opcionesNivel("No canto")}</select></label>}
          {pide("baile") && <label className="campo">Baile<select value={f.baile} onChange={set("baile")}><option value="">Elige…</option>{opcionesNivel("No bailo")}</select></label>}
          {pide("habilidades") && (
            <div className="campo">Habilidades especiales
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[...HABILIDADES, NINGUNA_HABILIDAD].map((h) => {
                  const on = habs.includes(h);
                  return <button key={h} type="button" aria-pressed={on} style={{ ...chip(on), padding: "6px 10px", fontSize: 12 }} onClick={() => setHabs(on ? habs.filter((x) => x !== h) : [...habs, h])}>{h}</button>;
                })}
              </div>
              <input value={f.otra} onChange={set("otra")} placeholder="Otra (separa con comas)" />
            </div>
          )}
        </Caja>
      )}

      {slots.length > 0 && (
        <div className="campo">Elige tu horario
          {slots.map((s) => {
            const libres = lugares(s.cupo, s.ocupados) + (p?.slot_id === s.id && p.estado !== "cancelado" ? 1 : 0);
            const on = f.slot === s.id;
            return (
              <button key={s.id} type="button" disabled={!libres} aria-pressed={on} onClick={() => setF({ ...f, slot: s.id })}
                style={{ ...chip(on), borderRadius: 14, padding: "12px 14px", justifyContent: "space-between", opacity: libres ? 1 : 0.5, textAlign: "left", color: "var(--texto)" }}>
                <span><b>{fmtSlot(s.inicia)}</b>{s.sala ? ` · ${s.sala}` : ""}</span>
                <span className="suave" style={{ fontSize: 12 }}>{libres ? `${libres} lugares` : "Lleno"}</span>
              </button>
            );
          })}
        </div>
      )}

      {fields.map((c) => {
        const v = resp[c.id] ?? "";
        const cambia = (e: { target: { value: string } }) => setResp({ ...resp, [c.id]: e.target.value });
        if (c.tipo === "parrafo") return <label key={c.id} className="campo">{c.etiqueta}{!c.obligatorio && " (opcional)"}<textarea rows={4} value={v} onChange={cambia} /></label>;
        if (c.tipo === "opcion" || c.tipo === "si_no") {
          const ops = c.tipo === "si_no" ? ["Sí", "No"] : c.opciones ?? [];
          return <label key={c.id} className="campo">{c.etiqueta}{!c.obligatorio && " (opcional)"}<select value={v} onChange={cambia}><option value="">Elige…</option>{ops.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
        }
        return <label key={c.id} className="campo">{c.etiqueta}{!c.obligatorio && " (opcional)"}<input type={c.tipo === "enlace" ? "url" : "text"} autoCapitalize={c.tipo === "enlace" ? "none" : undefined} value={v} onChange={cambia} placeholder={c.tipo === "enlace" ? "https://" : ""} /></label>;
      })}

      {menor && (
        <Caja titulo="Eres menor de edad: datos de tu madre, padre o tutor">
          <label className="campo">Nombre<input value={f.tutorNombre} onChange={set("tutorNombre")} /></label>
          <label className="campo">Teléfono<input type="tel" inputMode="tel" value={f.tutorTel} onChange={set("tutorTel")} /></label>
          <label className="campo">Correo<input type="email" autoCapitalize="none" value={f.tutorCorreo} onChange={set("tutorCorreo")} /></label>
          <Casilla on={f.tutorOk} cambia={(v) => setF({ ...f, tutorOk: v })}>Como madre, padre o tutor, autorizo esta inscripción y que se usen sus datos solo para esta audición.</Casilla>
        </Caja>
      )}

      <Casilla on={f.datos} cambia={(v) => setF({ ...f, datos: v })}>
        Autorizo a DARF Productions a usar mis datos solo para esta convocatoria (en el Registro permanente, hasta que me dé de baja), según el{" "}
        <button type="button" className="liga" style={{ fontWeight: 700 }} onClick={() => abrirWeb("/privacidad")}>aviso de privacidad</button>.
      </Casilla>
      <Casilla on={f.imagen} cambia={(v) => setF({ ...f, imagen: v })}>Autorizo que se tomen fotos o video durante la audición para uso interno de la producción.</Casilla>

      {msg && <p className={`aviso ${msg.ok ? "" : "error"}`} role={msg.ok ? "status" : "alert"} style={{ margin: 0 }}>{msg.t}</p>}
      <button className="boton principal" disabled={enviando || subiendo} onClick={enviar}>
        {enviando ? "Enviando…" : p && p.estado !== "cancelado" ? "Guardar cambios" : "Inscribirme"}
      </button>
    </div>
  );
}

function Casilla({ on, cambia, children }: { on: boolean; cambia: (v: boolean) => void; children: ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, lineHeight: 1.5 }}>
      <input type="checkbox" checked={on} onChange={(e) => cambia(e.target.checked)} style={{ width: 22, height: 22, marginTop: 1, flexShrink: 0 }} />
      <span>{children}</span>
    </label>
  );
}
