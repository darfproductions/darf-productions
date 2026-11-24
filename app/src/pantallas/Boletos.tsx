import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { limiteTexto, tiempoRestante } from "@/lib/expiry-rules";
import { nombreArchivo, type BoletoVista } from "@/lib/ticket-design";
import { correoValido, ligaTraspaso, puedePasar, textoEnviado, textoRecibido, whatsappTraspasoUrl, type Traspaso } from "@/lib/traspaso-rules";
import { formatMoney, whatsappPayUrl } from "@/lib/tickets";
import { estadoOrden } from "@/lib/ventas-rules";
import { mensajeError } from "@/lib/errores";
import { crearPdf, imagenesBoletos } from "@/components/tickets/ticket-canvas";
import { dibujar as dibujarVoyAIr } from "@/components/tickets/VoyAIr";
import { Icono } from "~/componentes/Icono";
import { agregarAWallet, aBase64, guardarPdf, walletDelTelefono } from "~/lib/archivos";
import { boletosVista, estiloObra, fechaFuncion, leerOrdenes, type OrdenBoletos } from "~/lib/boletos";
import { funcionPasada, imagen, poster } from "~/lib/datos";
import { env } from "~/lib/env";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { abrir, useCarga } from "~/lib/usar";
import { Directory, Filesystem } from "@capacitor/filesystem";

// Mis boletos por orden (como Mi cuenta en la web). Cada orden muestra su estado y sus acciones; "Ver mis boletos"
// abre los boletos en pantalla completa, uno por uno y deslizando (como se pasan en el escáner), con Wallet. Desde la
// orden: Descargar PDF, Pasar boletos a otra persona y la imagen "Voy a ir" para historias.

const ESTADO: Record<OrdenBoletos["status"], { fondo: string; texto: string }> = {
  aprobado: { fondo: "#14532d", texto: "#a7f3c0" },
  pendiente: { fondo: "#5a4313", texto: "#fde68a" },
  rechazado: { fondo: "#3a3446", texto: "#cfc8da" },
};

export function Boletos() {
  const { sesion, cargando: cargandoSesion } = useSesion();
  const [pestana, setPestana] = useState<"proximos" | "pasados">("proximos");
  const uid = sesion?.user.id ?? null;
  const [version, setVersion] = useState(0);
  const { datos, error, cargando } = useCarga(() => (uid ? leerOrdenes(uid) : Promise.resolve({ ordenes: [], traspasos: [] })), [uid, version]);
  const recargar = () => setVersion((v) => v + 1);

  const { proximas, pasadas } = useMemo(() => {
    const ordenes = (datos?.ordenes ?? []).filter((o) => o.status !== "rechazado" || !funcionPasada(o.funcion?.starts_at ?? null));
    const futura = (o: OrdenBoletos) => !funcionPasada(o.funcion?.starts_at ?? null);
    return { proximas: ordenes.filter(futura), pasadas: ordenes.filter((o) => !futura(o) && o.status === "aprobado") };
  }, [datos]);

  return (
    <main className="pantalla">
      <div className="contenido">
        <h1 className="titulo-grande" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>Mis boletos</h1>
        {!cargandoSesion && !sesion && (
          <div className="tarjeta" style={{ marginTop: 16, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>Entra a tu cuenta para ver tus boletos y mostrarlos en la entrada.</p>
            <Link to="/acceso" className="boton principal">Entrar</Link>
          </div>
        )}
        {sesion && (
          <>
            <div role="tablist" aria-label="Boletos" className="segmentos" style={{ marginTop: 14 }}>
              <button role="tab" aria-selected={pestana === "proximos"} onClick={() => setPestana("proximos")}>Próximos</button>
              <button role="tab" aria-selected={pestana === "pasados"} onClick={() => setPestana("pasados")}>Pasados</button>
            </div>
            {cargando && !datos && <div className="esqueleto" style={{ marginTop: 16, height: 260, borderRadius: 24 }} />}
            {error && <p className="aviso error" style={{ marginTop: 16 }}>No pudimos cargar tus boletos. Revisa tu conexión.</p>}
            {datos && pestana === "proximos" && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                {proximas.map((o) => <TarjetaOrden key={o.id} o={o} traspasos={datos.traspasos} recargar={recargar} />)}
                {!proximas.length && (
                  <div className="tarjeta" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>Aún no tienes boletos para próximas funciones.</p>
                    <Link to="/obras" className="boton contorno">Ver obras</Link>
                  </div>
                )}
              </div>
            )}
            {datos && pestana === "pasados" && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {pasadas.map((o) => (
                  <div key={o.id} className="tarjeta" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
                    {o.obra && poster(o.obra, "boleto") && <img src={poster(o.obra, "boleto")!} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover" }} />}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{o.obra?.nombre ?? "Función"}</span>
                      <span className="suave" style={{ fontSize: 12 }}>{fechaFuncion(o.funcion?.starts_at ?? null)} · Orden {o.order_code}</span>
                    </div>
                  </div>
                ))}
                {!pasadas.length && <p className="suave" style={{ fontSize: 14 }}>Aquí aparecerán las funciones a las que vayas.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// ── Una orden ────────────────────────────────────────────────────────────────────────────────────────────────────
function TarjetaOrden({ o, traspasos, recargar }: { o: OrdenBoletos; traspasos: Traspaso[]; recargar: () => void }) {
  const navegar = useNavigate();
  const estilo = estiloObra(o.obra);
  const activos = o.boletos.filter((b) => b.is_active);
  const [visor, setVisor] = useState(false);
  const [ocupado, setOcupado] = useState<"pdf" | "voy" | "cancelar" | null>(null);
  const [aviso, setAviso] = useState("");
  const enviados = traspasos.filter((t) => t.direccion === "enviado" && t.order_id === o.id && t.estado !== "cancelada");
  const recibido = traspasos.find((t) => t.direccion === "recibido" && t.new_order_id === o.id) ?? null;
  const logo = imagen(o.obra?.logo_path);
  const st = ESTADO[o.status];
  const pasable = puedePasar({ status: o.status, tickets: o.boletos }, o.funcion?.starts_at ?? null, !!o.funcion?.cancelada_at);

  const pdf = async () => {
    setOcupado("pdf"); setAviso("");
    try { await guardarPdf(await crearPdf(await boletosVista(o), estilo), nombreArchivo(o.order_code)); }
    catch { setAviso("No se pudo preparar el PDF. Intenta de nuevo."); }
    finally { setOcupado(null); }
  };
  const voyAIr = async () => {
    if (!o.obra) return;
    setOcupado("voy"); setAviso("");
    try {
      const liga = ["publicada", "archivada"].includes(o.obra.estado ?? "") ? `${env.siteUrl}/producciones/${o.obra.id}` : env.siteUrl;
      const blob = await dibujarVoyAIr({
        obra: o.obra.nombre, funcion: fechaFuncion(o.funcion?.starts_at ?? null), lugar: o.funcion?.venue ?? o.obra.venue ?? null,
        ambiente: imagen(o.obra.ambiente_path), poster: poster(o.obra, "voy"), logo: imagen(o.obra.logo_path),
        fondo: estilo.fondo, superficie: estilo.superficie, texto: estilo.texto, acento: estilo.acento, liga,
      });
      if (!blob) throw new Error("sin imagen");
      if (Capacitor.isNativePlatform()) {
        const datos = aBase64(new Uint8Array(await blob.arrayBuffer()));
        const { uri } = await Filesystem.writeFile({ path: "voy-a-ir-darf.png", data: datos, directory: Directory.Cache });
        await Share.share({ title: o.obra.nombre, text: `¡Voy a ir a ${o.obra.nombre}! Compra tus boletos: ${liga}`, files: [uri] });
      } else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "voy-a-ir-darf.png"; a.click();
      }
    } catch { setAviso("No se pudo armar la imagen. Intenta de nuevo."); }
    finally { setOcupado(null); }
  };
  const cancelar = async () => {
    if (!window.confirm(`¿Cancelar tu apartado ${o.order_code}? Los lugares quedan libres para alguien más.`)) return;
    setOcupado("cancelar");
    const { error } = await supabase.rpc("cancel_my_order", { target_order_id: o.id });
    setOcupado(null);
    if (error) setAviso(mensajeError(error)); else recargar();
  };
  const wa = o.status === "pendiente" ? whatsappPayUrl(env.whatsapp, {
    prodName: o.obra?.nombre ?? "", orderCode: o.order_code, seats: activos.map((b) => b.etiqueta), total: o.total,
    buyerPhone: o.buyer_telefono, discountCode: o.discount_codigo, discountAmount: Number(o.discount_amount ?? 0),
  }) : "";
  const accion: CSSProperties = { flex: 1, minWidth: 0, minHeight: 64, padding: "8px 6px", borderRadius: 16, border: "1px solid var(--linea)", background: "transparent", color: "var(--texto)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11, fontWeight: 800, cursor: "pointer" };

  return (
    <article className="tarjeta" style={{ overflow: "hidden" }}>
      <div style={{ background: estilo.fondo, color: estilo.texto, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
        {logo ? <img src={logo} alt={o.obra?.nombre ?? ""} style={{ height: 46, maxWidth: 120, objectFit: "contain", flexShrink: 0 }} /> : null}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {!logo && <span style={{ fontSize: 17, fontWeight: 900 }}>{o.obra?.nombre}</span>}
          <span style={{ fontSize: 13, fontWeight: 700 }}>{fechaFuncion(o.funcion?.starts_at ?? null)}</span>
          {(o.funcion?.venue ?? o.obra?.venue) && <span style={{ fontSize: 12, opacity: 0.8 }}>{o.funcion?.venue ?? o.obra?.venue}</span>}
        </div>
        <span className="pildora" style={{ background: st.fondo, color: st.texto, flexShrink: 0 }}>{estadoOrden(o, "comprador")}</span>
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="suave" style={{ fontSize: 13 }}>
          {recibido ? `${textoRecibido(recibido)} · ` : ""}Orden {o.order_code} · {activos.length} {activos.length === 1 ? "boleto" : "boletos"}{!recibido ? ` · ${formatMoney(o.total)}` : ""}
        </span>
        {activos.length > 0 && <span style={{ fontSize: 14, fontWeight: 700 }}>{activos.map((b) => b.etiqueta).join(", ")}</span>}
        {o.funcion?.cancelada_at && <p className="aviso error" style={{ margin: 0 }}>Función cancelada{o.funcion.cancelada_motivo ? `: ${o.funcion.cancelada_motivo}` : ""}{o.status === "aprobado" ? ". Te contactamos para tu reembolso." : ""}</p>}
        {enviados.map((t) => (
          <div key={t.id} style={{ padding: "10px 12px", borderRadius: 12, background: "var(--fondo)", fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            <span>{textoEnviado(t)}{t.etiquetas?.length ? ` (${t.etiquetas.join(", ")})` : ""}</span>
            {t.estado === "pendiente" && (
              <div style={{ display: "flex", gap: 14 }}>
                <button className="liga" style={{ fontWeight: 800, color: "var(--acento)" }} onClick={() => abrir(whatsappTraspasoUrl({ obra: o.obra?.nombre ?? "", funcion: fechaFuncion(o.funcion?.starts_at ?? null), boletos: t.boletos, liga: ligaTraspaso(env.siteUrl, t.token) }))}>Mandar la liga</button>
                <button className="liga suave" style={{ fontWeight: 700 }} onClick={async () => {
                  if (!window.confirm("¿Cancelar este traspaso? Los boletos se quedan contigo.")) return;
                  const { error } = await supabase.rpc("ticket_transfer_cancel", { p_id: t.id });
                  if (error) setAviso(mensajeError(error)); else recargar();
                }}>Cancelar traspaso</button>
              </div>
            )}
          </div>
        ))}

        {o.status === "pendiente" && (
          <>
            {o.expires_at && tiempoRestante(o.expires_at)
              ? <p className="aviso" style={{ margin: 0, borderColor: "#d97706" }}>Paga antes de <b>{limiteTexto(o.expires_at)}</b> (te quedan {tiempoRestante(o.expires_at)}). Si no, los lugares se liberan solos.</p>
              : <p className="suave" style={{ margin: 0, fontSize: 13 }}>Tus lugares siguen apartados a tu nombre hasta que se confirme tu pago.</p>}
            <button className="boton" style={{ background: "#25d366", color: "#062b16" }} onClick={() => (wa ? abrir(wa) : navegar("/contacto"))}><Icono nombre="whatsapp" tamano={18} />Pagar por WhatsApp</button>
            <button className="liga suave" style={{ alignSelf: "center", fontSize: 13, fontWeight: 700 }} disabled={!!ocupado} onClick={cancelar}>Cancelar mi apartado</button>
          </>
        )}

        {o.status === "aprobado" && activos.length > 0 && (
          <>
            <button className="boton principal" onClick={() => setVisor(true)}><Icono nombre="boletos" tamano={20} />Ver mis boletos ({activos.length})</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={accion} disabled={!!ocupado} onClick={pdf}><Icono nombre="documento" tamano={20} color="var(--acento)" />{ocupado === "pdf" ? "Preparando…" : "PDF"}</button>
              {pasable && <button style={accion} onClick={() => navegar(`/boletos/${encodeURIComponent(o.order_code)}/pasar`)}><Icono nombre="flecha" tamano={20} color="var(--acento)" />Pasar boletos</button>}
              <button style={accion} disabled={!!ocupado} onClick={voyAIr}><Icono nombre="compartir" tamano={20} color="var(--acento)" />{ocupado === "voy" ? "Armando…" : "Voy a ir"}</button>
            </div>
          </>
        )}
        {aviso && <p className="aviso error" role="alert" style={{ margin: 0 }}>{aviso}</p>}
      </div>
      {visor && createPortal(<Visor o={o} cerrar={() => setVisor(false)} />, document.body)}
    </article>
  );
}

// ── Boletos en pantalla completa: uno por uno, deslizando ────────────────────────────────────────────────────────
function Visor({ o, cerrar }: { o: OrdenBoletos; cerrar: () => void }) {
  const estilo = estiloObra(o.obra);
  const wallet = walletDelTelefono();
  const { datos, error } = useCarga(async () => {
    const vista = await boletosVista(o);
    return { vista, imagenes: await imagenesBoletos(vista, estilo) };
  }, [o.id]);
  const [i, setI] = useState(0);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const carril = useRef<HTMLDivElement>(null);
  const total = datos?.vista.length ?? 0;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (Capacitor.isNativePlatform()) void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    return () => { document.body.style.overflow = prev; };
  }, []);
  const ir = (k: number) => carril.current?.scrollTo({ left: k * carril.current.clientWidth, behavior: "smooth" });
  const actual: BoletoVista | undefined = datos?.vista[i];

  return (
    <div role="dialog" aria-modal="true" aria-label={`Boletos de la orden ${o.order_code}`}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "#050407", color: "#ffffff", display: "flex", flexDirection: "column", paddingTop: "var(--arriba)", paddingBottom: "calc(var(--abajo) + 12px)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px" }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>{total ? `Boleto ${i + 1} de ${total}` : "Tus boletos"}</span>
        <button onClick={cerrar} aria-label="Cerrar" style={{ width: 44, height: 44, borderRadius: 22, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)", color: "#ffffff", fontSize: 22, fontWeight: 700 }}>×</button>
      </div>
      {error && <p className="aviso error" style={{ margin: 16 }}>No se pudieron dibujar tus boletos. Revisa tu conexión.</p>}
      {!datos && !error && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#a8a2b4" }}>Preparando tus boletos…</div>}
      {datos && (
        <>
          <div ref={carril} onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); setMsg(""); }}
            style={{ flex: 1, minHeight: 0, display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
            {datos.imagenes.map((src, k) => (
              <div key={k} style={{ flex: "0 0 100%", scrollSnapAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 16px" }}>
                <img src={src} alt={`Boleto ${k + 1} de ${total}: ${datos.vista[k].asiento}`} style={{ maxWidth: "100%", maxHeight: "100%", aspectRatio: "9 / 16", objectFit: "contain", borderRadius: 18 }} />
              </div>
            ))}
          </div>
          {total > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "8px 0" }}>
              <button aria-label="Boleto anterior" disabled={i === 0} onClick={() => ir(i - 1)} style={{ width: 40, height: 40, borderRadius: 20, border: "1px solid rgba(255,255,255,0.25)", background: "none", color: "#ffffff", opacity: i === 0 ? 0.3 : 1 }}><Icono nombre="atras" tamano={18} /></button>
              <div style={{ display: "flex", gap: 6 }}>{datos.vista.map((_, k) => <span key={k} style={{ width: k === i ? 18 : 7, height: 7, borderRadius: 4, background: k === i ? "#ffffff" : "rgba(255,255,255,0.35)", transition: "width .2s" }} />)}</div>
              <button aria-label="Boleto siguiente" disabled={i === total - 1} onClick={() => ir(i + 1)} style={{ width: 40, height: 40, borderRadius: 20, border: "1px solid rgba(255,255,255,0.25)", background: "none", color: "#ffffff", opacity: i === total - 1 ? 0.3 : 1 }}><Icono nombre="derecha" tamano={18} /></button>
            </div>
          )}
          <div style={{ padding: "4px 16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {wallet && actual?.qr && (
              <button disabled={ocupado} onClick={async () => {
                setOcupado(true); setMsg("");
                try { setMsg(await agregarAWallet(`boleto/${actual.id}`)); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setOcupado(false); }
              }} style={{ width: "100%", maxWidth: 360, minHeight: 50, borderRadius: 14, border: "1px solid rgba(255,255,255,0.35)", background: "#000000", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 15, fontWeight: 700 }}>
                <Icono nombre="wallet" tamano={22} />{ocupado ? "Preparando tu pase…" : wallet === "apple" ? "Añadir a Apple Wallet" : "Agregar a Google Wallet"}
              </button>
            )}
            {msg && <span role="status" style={{ fontSize: 12, color: "#cfc8da", textAlign: "center" }}>{msg}</span>}
            <span style={{ fontSize: 12, color: "#a8a2b4", textAlign: "center" }}>Desliza para ver el siguiente. Sube el brillo para que el QR se lea fácil.</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Pasar boletos a otra persona (igual que /cuenta/boletos/[orden]/pasar) ───────────────────────────────────────
export function PasarBoletos() {
  const { orden = "" } = useParams();
  const navegar = useNavigate();
  const { sesion } = useSesion();
  const uid = sesion?.user.id ?? null;
  const { datos } = useCarga(async () => (uid ? (await leerOrdenes(uid)).ordenes.find((o) => o.order_code === orden) ?? null : null), [uid, orden]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [correo, setCorreo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  const [listo, setListo] = useState<{ token: string; texto: string } | null>(null);
  const pasables = (datos?.boletos ?? []).filter((b) => b.is_active && !b.checked_in_at);
  useEffect(() => { if (pasables.length === 1) setMarcados(new Set([pasables[0].id])); }, [datos]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async () => {
    setErr("");
    if (!marcados.size) return setErr("Elige al menos un boleto.");
    if (!correoValido(correo)) return setErr("Revisa el correo de la persona.");
    setEnviando(true);
    const { data, error } = await supabase.rpc("ticket_transfer_create", { p_order: datos!.id, p_tickets: [...marcados], p_email: correo.trim(), p_mensaje: mensaje.trim().slice(0, 300) || null });
    setEnviando(false);
    if (error) return setErr(mensajeError(error));
    const r = data as { token: string; con_cuenta: boolean };
    setListo({ token: r.token, texto: r.con_cuenta ? "Listo. Ya le avisamos en su cuenta; también puedes mandarle la liga." : "Listo. Esa persona todavía no tiene cuenta en DARF: mándale la liga y la acepta al entrar." });
  };

  return (
    <main className="pantalla sin-barra">
      <div className="contenido" style={{ gap: 14 }}>
        <button className="circulo" aria-label="Volver" onClick={() => navegar(-1)}><Icono nombre="atras" /></button>
        <h1 className="titulo-grande">Pasar boletos</h1>
        {datos && <p className="suave" style={{ margin: 0, fontSize: 14 }}>{datos.obra?.nombre} · {fechaFuncion(datos.funcion?.starts_at ?? null)} · Orden {datos.order_code}</p>}
        {listo ? (
          <div className="tarjeta" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <strong style={{ display: "flex", alignItems: "center", gap: 8 }}><Icono nombre="palomita" tamano={18} grosor={2.4} color="#16a34a" />{listo.texto}</strong>
            <p className="suave" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>Cuando acepte, los boletos aparecen en su cuenta con QR nuevos y salen de la tuya. Hasta entonces siguen contigo y puedes cancelar el traspaso desde Mis boletos.</p>
            <button className="boton" style={{ background: "#25d366", color: "#062b16" }} onClick={() => abrir(whatsappTraspasoUrl({ obra: datos?.obra?.nombre ?? "", funcion: fechaFuncion(datos?.funcion?.starts_at ?? null), boletos: marcados.size, liga: ligaTraspaso(env.siteUrl, listo.token) }))}>Mandar la liga por WhatsApp</button>
            <button className="boton contorno" onClick={() => Share.share({ url: ligaTraspaso(env.siteUrl, listo.token) }).catch(() => {})}>Compartir la liga</button>
            <Link to="/boletos" className="liga" style={{ alignSelf: "center", fontWeight: 700 }}>Volver a Mis boletos</Link>
          </div>
        ) : datos ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 700 }}>¿Qué boletos pasas?</span>
            <div className="tarjeta lista">
              {pasables.map((b) => {
                const on = marcados.has(b.id);
                return (
                  <button key={b.id} className="fila" aria-pressed={on} onClick={() => setMarcados((m) => { const n = new Set(m); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${on ? "var(--acento)" : "var(--linea)"}`, background: on ? "var(--acento)" : "transparent", color: "var(--sobre-acento)", display: "flex", alignItems: "center", justifyContent: "center" }}>{on && <Icono nombre="palomita" tamano={14} grosor={3} />}</span>
                    <span className="crece" style={{ fontWeight: 800 }}>{b.etiqueta}</span>
                    {b.zona && <span className="suave" style={{ fontSize: 12 }}>{b.zona}</span>}
                  </button>
                );
              })}
            </div>
            <label className="campo">Correo de la persona<input type="email" autoCapitalize="none" autoComplete="off" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="ella@correo.com" />
              <span className="suave" style={{ fontSize: 12, fontWeight: 500 }}>Si ya tiene cuenta en DARF con ese correo, le avisamos y solo ella podrá aceptar. Si no, le mandas la liga y la acepta al crear su cuenta.</span>
            </label>
            <label className="campo">Mensaje (opcional)<input maxLength={300} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Ej. Para ti y tu mamá, ¡nos vemos ahí!" /></label>
            <p className="suave" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>Al aceptar, se generan QR nuevos y los boletos que pasaste dejan de servir en tu cuenta (PDF y Wallet incluidos). Se puede hasta antes de que empiece la función.</p>
            {err && <p className="aviso error" role="alert" style={{ margin: 0 }}>{err}</p>}
            <button className="boton principal" disabled={enviando || !marcados.size} onClick={enviar}>{enviando ? "Enviando…" : marcados.size === 1 ? "Pasar 1 boleto" : `Pasar ${marcados.size} boletos`}</button>
          </>
        ) : <div className="esqueleto" style={{ height: 240 }} />}
      </div>
    </main>
  );
}
