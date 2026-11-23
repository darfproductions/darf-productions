import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type TouchList } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { telefonoOk } from "@/lib/account-rules";
import { MOMENTOS_ENTREGA, notaBeneficio, textoBeneficio, textoCupo, type BeneficioCorto } from "@/lib/beneficios-rules";
import { enPreventa, enPrivada, partesFuncion, privadaPorAbrir, ventaPorAbrir } from "@/lib/disponibilidad";
import { limiteTexto } from "@/lib/expiry-rules";
import { hora } from "@/lib/logistica-rules";
import { encuadrePlano, FormaSvg, etiquetasFila } from "@/components/MapaPlano";
import { mensajeError } from "@/lib/errores";
import { colorZona, textoSobre } from "@/lib/seatmap-rules";
import { clampSeat, formatMoney, groupSeatsByRow, previewDiscount, seatSize, whatsappApartadoUrl, whatsappPayUrl, ZONE_COLORS, type DiscountPreview, type MapSeat } from "@/lib/tickets";
import { funcionVendible, textosVenta } from "@/lib/ventas-rules";
import { Icono } from "~/componentes/Icono";
import { useApariencia } from "~/lib/apariencia";
import { apartarAsientos, apartarGeneral, leerFuncionVenta, leerMapa, miPreventa, ocupados, revisarVendedor, soySocio, type Orden, type ZonaGeneral, type ZonaPrecio } from "~/lib/compra";
import { leerPerfil } from "~/lib/cuenta";
import { env } from "~/lib/env";
import { fechaLarga } from "~/lib/formato";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { paletaObra, variables } from "~/lib/tema";
import { abrir, abrirWeb, useCarga } from "~/lib/usar";
import { recordarRegreso } from "./Acceso";

// Compra nativa: lo mismo que /comprar/[funcion] en la web (preventa privada, preventa del Club Fan, venta por abrir,
// promos, mapa de asientos con zoom, entrada general, descuentos, vendedor y beneficios por zona) con los colores de la
// obra. La orden la crea la base; el pago sigue por WhatsApp, como en la web.

const MAX_ASIENTOS = 20;
const MAX_GENERAL = 10;
const toque = () => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});

function Caja({ children, estilo }: { children: ReactNode; estilo?: CSSProperties }) {
  return <section style={{ padding: 16, borderRadius: 20, background: "var(--superficie, var(--tarjeta))", border: "1px solid var(--linea)", display: "flex", flexDirection: "column", gap: 12, ...estilo }}>{children}</section>;
}

function Beneficios({ bs }: { bs?: BeneficioCorto[] }) {
  if (!bs?.length) return null;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
      {bs.map((b, i) => {
        const cuando = b.entrega && b.tipo !== "acceso" ? `Se entrega ${MOMENTOS_ENTREGA[b.entrega].corto}` : null;
        const extra = [cuando, textoCupo(b.cupo)].filter(Boolean).join(" · ");
        return (
          <li key={`${b.nombre}-${i}`} style={{ display: "flex", gap: 6 }}>
            <span aria-hidden="true">✦</span>
            <span><b>{textoBeneficio(b)}</b>{notaBeneficio(b) && <span style={{ opacity: 0.75 }}> — {notaBeneficio(b)}</span>}
              {extra && <span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.7 }}>{extra}</span>}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Comprar() {
  const { funcion = "" } = useParams();
  const { sesion, cargando: cargandoSesion } = useSesion();
  const { modo } = useApariencia();
  const conSesion = !!sesion;
  const { datos, cargando, error } = useCarga(async () => {
    const base = await leerFuncionVenta(funcion);
    if (!base) return null;
    const [mia, socio] = conSesion ? await Promise.all([miPreventa(base.p.id), soySocio()]) : [null, false];
    return { ...base, mia, socio };
  }, [funcion, conSesion]);
  const paleta = useMemo(() => (datos ? paletaObra(datos.p, modo) : null), [datos, modo]);

  if (cargando || cargandoSesion) return <Marco><div className="esqueleto" style={{ height: 420 }} /></Marco>;
  if (error || !datos || datos.p.funciones_publicadas === false) return <Marco><p className="aviso">{error ? "No pudimos cargar la función. Revisa tu conexión." : "Esta función no existe o no está a la venta."}</p></Marco>;
  return <Venta d={datos} estilo={paleta ? (variables(paleta) as CSSProperties) : undefined} />;
}

function Marco({ children, estilo, volverA }: { children: ReactNode; estilo?: CSSProperties; volverA?: string }) {
  const navegar = useNavigate();
  return (
    <main className="pantalla sin-barra" style={{ ...estilo, background: "var(--fondo)", color: "var(--texto)", minHeight: "100dvh" }}>
      <div className="contenido" style={{ gap: 14 }}>
        <button className="circulo" aria-label="Volver" onClick={() => (window.history.length > 1 ? navegar(-1) : navegar(volverA ?? "/obras"))}><Icono nombre="atras" /></button>
        {children}
      </div>
    </main>
  );
}

type Datos = NonNullable<Awaited<ReturnType<typeof leerFuncionVenta>>> & { mia: Awaited<ReturnType<typeof miPreventa>>; socio: boolean };

function Venta({ d, estilo }: { d: Datos; estilo?: CSSProperties }) {
  const { f, p, mia } = d;
  const { sesion } = useSesion();
  const [socio, setSocio] = useState(d.socio);
  const tv = textosVenta(p.modo_venta);
  const hibrido = p.modo_venta === "hibrido";
  const verbo = hibrido ? "apartar" : "comprar";
  const conTotal = p.mostrar_total !== false;
  const vendible = funcionVendible(f, p.concluded);
  const yaPaso = !!f.starts_at && !funcionVendible({ on_sale: true, starts_at: f.starts_at }, false);
  const privada = vendible && enPrivada(f, mia);
  const preventa = vendible && enPreventa(f);
  const bloqueada = preventa && !mia?.acceso && !socio;
  const hasta = preventa && f.preventa_hasta ? partesFuncion(f.preventa_hasta) : null;
  const privadaAbre = vendible ? privadaPorAbrir(f, mia) : null;
  const abre = vendible && !privada && ventaPorAbrir(f) && f.preventa_desde ? partesFuncion(privadaAbre ?? f.preventa_desde) : null;
  const porWhatsApp = p.modo_venta === "whatsapp";
  const conMapa = vendible && !abre && !bloqueada && !porWhatsApp;
  const [version, setVersion] = useState(0);
  const mapa = useCarga(() => (conMapa ? leerMapa(p.id, f) : Promise.resolve(null)), [conMapa, p.id, f.id, version]);
  const [orden, setOrden] = useState<{ o: Orden; telefono: string } | null>(null);

  const titulo = hibrido ? tv.titulo : mapa.datos && mapa.datos.zonas.length === 0 && mapa.datos.general.length > 0 ? "Elige tus boletos" : "Elige tus asientos";
  const cabecera = (
    <>
      <span className="etiqueta">{tv.eyebrow} · {p.nombre}</span>
      <h1 className="titulo-grande" style={{ marginTop: -8 }}>{orden ? (hibrido ? "¡Listo! Sigue en WhatsApp" : "¡Lugares apartados!") : titulo}</h1>
      <p className="suave" style={{ margin: 0, fontSize: 14 }}>
        {f.starts_at ? fechaLarga(f.starts_at) : "Fecha por confirmar"} · {f.venue ?? p.venue}{mapa.datos?.puertas ? ` · Puertas ${hora(mapa.datos.puertas)}` : ""}
      </p>
    </>
  );

  const unirse = async () => {
    const { error } = await supabase.rpc("fan_join");
    if (error) return window.alert(mensajeError(error));
    setSocio(true);
  };
  const entrar = () => recordarRegreso(`/comprar/${f.id}`);
  const botonClub = sesion
    ? <button className="boton" style={{ background: "#d7bb5f", color: "#0b0b0b" }} onClick={unirse}>Unirme al Club Fan · gratis</button>
    : <Link to="/acceso" onClick={entrar} className="boton" style={{ background: "#d7bb5f", color: "#0b0b0b" }}>Entra o crea tu cuenta para unirte</Link>;
  const wa = porWhatsApp && env.whatsapp ? `https://wa.me/${env.whatsapp}?text=${encodeURIComponent(`Hola, me gustaría más información de ${p.nombre}${f.starts_at ? ` — Función: ${fechaLarga(f.starts_at)}` : ""}.`)}` : null;

  if (orden) return <Marco estilo={estilo}>{cabecera}<Listo o={orden.o} telefono={orden.telefono} obra={p.nombre} hibrido={hibrido} conTotal={conTotal} /></Marco>;

  return (
    <Marco estilo={estilo} volverA={`/obras/${p.id}`}>
      {cabecera}
      {!vendible ? (
        <Caja><p style={{ margin: 0, fontSize: 15 }}>{yaPaso ? "Esta función ya pasó." : "Esta función no está a la venta en este momento."}</p>
          <Link to={`/obras/${p.id}`} style={{ fontWeight: 800, color: "var(--acento)" }}>‹ Volver a la obra</Link></Caja>
      ) : porWhatsApp ? (
        <Caja>
          <span style={{ fontSize: 20, fontWeight: 900 }}>Boletos por WhatsApp</span>
          <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>Los lugares de esta función se apartan por WhatsApp. Escríbenos y te ayudamos a elegirlos; al confirmar tu pago te llega tu boleto con QR.</p>
          {wa && <button className="boton" style={{ background: "#25d366", color: "#062b16" }} onClick={() => abrir(wa)}>Pedir boletos por WhatsApp</button>}
        </Caja>
      ) : abre ? (
        <Caja>
          <span style={{ fontSize: 20, fontWeight: 900 }}>{privadaAbre ? "Tu preventa privada abre pronto" : f.preventa_hasta ? "La preventa del Club Fan abre pronto" : "La venta abre pronto"}</span>
          <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {privadaAbre ? `Con tu código puedes ${verbo}` : f.preventa_hasta ? `Los socios del Club Fan pueden ${verbo}` : `Puedes ${verbo}`} desde el {abre.dia} {abre.numero} {abre.mes}, {abre.hora}.
            {!privadaAbre && f.preventa_hasta && ` Únete gratis al Club Fan para ${verbo} antes que nadie.`}
          </p>
          {!privadaAbre && f.preventa_hasta && !socio && botonClub}
        </Caja>
      ) : bloqueada ? (
        <Caja estilo={{ background: "linear-gradient(160deg, #1a1622, #0b0910)", borderColor: "rgba(215,187,95,0.45)", color: "#ffffff" }}>
          <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" style={{ height: 30, width: "auto", alignSelf: "flex-start" }} />
          <span style={{ fontSize: 20, fontWeight: 900 }}>Preventa para el <span style={{ color: "#d7bb5f" }}>Club Fan</span></span>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#cccccc" }}>Esta función está en preventa{hasta ? ` hasta el ${hasta.dia} ${hasta.numero} ${hasta.mes}, ${hasta.hora}` : ""}. Únete gratis al Club Fan y {verbo === "apartar" ? "aparta" : "compra"} antes que nadie; después se abre para todos.</p>
          {botonClub}
        </Caja>
      ) : mapa.cargando && !mapa.datos ? (
        <div className="esqueleto" style={{ height: 380 }} />
      ) : mapa.error || !mapa.datos ? (
        <p className="aviso error">No se pudo cargar el mapa de asientos. <button className="liga" onClick={() => setVersion((v) => v + 1)}>Reintentar</button></p>
      ) : mapa.datos.zonas.length === 0 && mapa.datos.general.length === 0 ? (
        <p className="aviso">Esta función aún no tiene precios disponibles. Intenta más tarde.</p>
      ) : (
        <>
          {privada && <p className="aviso" style={{ margin: 0, borderColor: "var(--acento)" }}>Preventa privada: tienes acceso con tu código antes que nadie.{mia?.max ? ` Máximo ${mia.max} ${mia.max === 1 ? "lugar" : "lugares"} por persona en esta función.` : ""}</p>}
          {mapa.datos.promo && conTotal && <p className="aviso" style={{ margin: 0, borderColor: "var(--acento)", fontWeight: 700 }}>Promo {mapa.datos.promo.nombre}: {mapa.datos.promo.percent}% de descuento ya aplicado{[...mapa.datos.zonas, ...mapa.datos.general].some((z) => z.antes == null) ? " en algunas zonas" : ""}.</p>}
          {mapa.datos.general.length > 0 && <General fid={f.id} zonas={mapa.datos.general} hibrido={hibrido} conTotal={conTotal} listo={(o, t) => setOrden({ o, telefono: t })} entrar={entrar} />}
          {mapa.datos.zonas.length > 0 && mapa.datos.general.length > 0 && <h2 className="titulo-seccion">O elige asientos numerados</h2>}
          {mapa.datos.zonas.length > 0 && (
            <Asientos fid={f.id} pid={p.id} datos={mapa.datos} hibrido={hibrido} conTotal={conTotal} max={mia?.max ?? null}
              listo={(o, t) => setOrden({ o, telefono: t })} entrar={entrar} recargar={() => setVersion((v) => v + 1)} />
          )}
        </>
      )}
    </Marco>
  );
}

// ── Datos del comprador (teléfono, descuento y vendedor), comunes a asientos y entrada general ────────────────────
function useComprador() {
  const { sesion } = useSesion();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  useEffect(() => {
    if (!sesion) return;
    void leerPerfil(sesion.user.id).then((pr) => {
      setNombre(pr?.nombre || sesion.user.email || "");
      setTelefono((t) => t || pr?.telefono || "");
    });
  }, [sesion]);
  return { sesion, nombre: nombre || sesion?.user.email || "", telefono, setTelefono };
}

function Vendedor({ fid, valor, cambia, check, setCheck }: { fid: string; valor: string; cambia: (v: string) => void; check: { ok: boolean; text: string; code: string } | null; setCheck: (c: { ok: boolean; text: string; code: string } | null) => void }) {
  return (
    <label className="campo">Código de vendedor (opcional)
      <input value={valor} autoCapitalize="characters" style={{ textTransform: "uppercase" }}
        onChange={(e) => { cambia(e.target.value); setCheck(null); }}
        onBlur={async () => setCheck(valor.trim() ? await revisarVendedor(fid, valor) : null)} />
      {check && <span style={{ fontSize: 12, fontWeight: 600, color: check.ok ? "#16a34a" : "#dc2626" }}>{check.text}</span>}
    </label>
  );
}

function Legal() {
  return (
    <p className="suave" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
      Al apartar aceptas los <button className="liga" onClick={() => abrirWeb("/terminos")}>términos</button> y la{" "}
      <button className="liga" onClick={() => abrirWeb("/reembolsos")}>política de cambios y reembolsos</button>.
    </p>
  );
}

// ── Asientos numerados ───────────────────────────────────────────────────────────────────────────────────────────
function Asientos({ fid, pid, datos, hibrido, conTotal, max, listo, entrar, recargar }: {
  fid: string; pid: string; datos: NonNullable<Awaited<ReturnType<typeof leerMapa>>>; hibrido: boolean; conTotal: boolean; max: number | null;
  listo: (o: Orden, tel: string) => void; entrar: () => void; recargar: () => void;
}) {
  const { sesion, nombre, telefono, setTelefono } = useComprador();
  const tope = Math.min(MAX_ASIENTOS, max ?? MAX_ASIENTOS);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [taken, setTaken] = useState<Set<string>>(new Set(datos.taken));
  const [aviso, setAviso] = useState("");
  const [err, setErr] = useState("");
  const [codigo, setCodigo] = useState("");
  const [desc, setDesc] = useState<DiscountPreview | null>(null);
  const [descMsg, setDescMsg] = useState("");
  const [vend, setVend] = useState("");
  const [vendCheck, setVendCheck] = useState<{ ok: boolean; text: string; code: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const resumen = useRef<HTMLDivElement>(null);

  // Disponibilidad en vivo: cada 30 s (con la app al frente) se pregunta qué está ocupado; lo que se ocupó sale de tu selección.
  useEffect(() => { setTaken(new Set(datos.taken)); }, [datos.taken]);
  useEffect(() => {
    const revisar = async () => {
      if (document.visibilityState === "hidden") return;
      const lista = await ocupados(fid).catch(() => null);
      if (!lista) return;
      const oc = new Set(lista);
      setTaken(oc);
      setSel((prev) => {
        const perdidos = [...prev].filter((id) => oc.has(id));
        if (!perdidos.length) return prev;
        setAviso(`Alguien acaba de apartar ${datos.asientos.filter((s) => perdidos.includes(s.id)).map((s) => s.seat_label).join(", ")}. Lo quitamos de tu selección; elige otro.`);
        return new Set([...prev].filter((id) => !oc.has(id)));
      });
    };
    const id = setInterval(revisar, 30000);
    document.addEventListener("visibilitychange", revisar);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", revisar); };
  }, [fid, datos.asientos]);

  const porZona = useMemo(() => new Map(datos.zonas.map((z) => [z.categoryId, z])), [datos.zonas]);
  const elegidos = datos.asientos.filter((s) => sel.has(s.id));
  const subtotal = elegidos.reduce((n, s) => n + (porZona.get(s.price_category_id ?? "")?.price ?? 0), 0);
  const d = previewDiscount(desc, elegidos, (id) => porZona.get(id)?.price);
  const zonasElegidas = [...new Set(elegidos.map((s) => s.price_category_id ?? ""))].map((c) => porZona.get(c)).filter((z): z is ZonaPrecio => !!z?.beneficios?.length);

  const alternar = (s: MapSeat) => {
    if (taken.has(s.id) || !porZona.has(s.price_category_id ?? "")) return;
    setErr("");
    void toque();
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(s.id)) n.delete(s.id);
      else if (n.size < tope) n.add(s.id);
      else setErr(`Máximo ${tope} asientos ${hibrido ? "por persona" : "por compra"}.`);
      return n;
    });
  };

  const aplicar = async () => {
    if (desc) { setDesc(null); setDescMsg(""); setCodigo(""); return; }
    if (!codigo.trim()) return;
    const { data, error } = await supabase.rpc("preview_discount_code", { target_performance_id: fid, target_code: codigo.trim() });
    if (error) { setDesc(null); setDescMsg(mensajeError(error)); return; }
    const x = data as DiscountPreview;
    setDesc(x); setCodigo(x.codigo); setDescMsg(`Código ${x.codigo} aplicado: ${x.percent}% de descuento.`);
  };

  const apartar = async () => {
    setErr("");
    if (!telefonoOk(telefono)) return setErr("Revisa tu teléfono: escribe tus 10 dígitos (puedes incluir la lada).");
    if (vend.trim() && (!vendCheck || vendCheck.code !== vend.trim().toUpperCase())) setVendCheck(await revisarVendedor(fid, vend));
    const vc = vend.trim() ? (vendCheck?.code === vend.trim().toUpperCase() ? vendCheck : await revisarVendedor(fid, vend)) : null;
    if (vc && !vc.ok) return setErr(`${vc.text} Corrígelo o déjalo vacío.`);
    setEnviando(true);
    try {
      const o = await apartarAsientos({ fid, pid, nombre, telefono, asientos: [...sel], vendedor: vend, descuento: desc?.codigo ?? null });
      void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      listo(o, telefono.trim());
    } catch (e) {
      const m = mensajeError(e as { message: string });
      setErr(/disponible|bloqueado/i.test(m) ? `${m}. Actualizamos el mapa: elige otro asiento.` : m);
      recargar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      {aviso && <p className="aviso error" role="alert" style={{ margin: 0 }}>{aviso}</p>}
      <Mapa asientos={datos.asientos} zonas={datos.zonas} formas={datos.formas} taken={taken} sel={sel} alternar={alternar} sinPrecios={!conTotal} />
      <button className="liga" style={{ alignSelf: "flex-start", fontSize: 13, fontWeight: 700, color: "var(--acento)" }} onClick={() => { setAviso(""); recargar(); }}>Actualizar disponibilidad</button>

      {datos.zonas.some((z) => z.beneficios?.length) && (
        <Caja>
          {datos.zonas.filter((z) => z.beneficios?.length).map((z) => (
            <div key={z.categoryId} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{z.nombre} incluye</span>
              <Beneficios bs={z.beneficios} />
            </div>
          ))}
        </Caja>
      )}

      <div ref={resumen}>
        <Caja>
          <span style={{ fontSize: 17, fontWeight: 900 }}>{hibrido ? "Tu lugar" : "Tu compra"}</span>
          {elegidos.length === 0 ? <p className="suave" style={{ margin: 0, fontSize: 14 }}>Toca los asientos en el mapa para elegirlos.</p> : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
              {elegidos.map((s) => (
                <li key={s.id} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{s.seat_label}</span>
                  <span className={conTotal ? undefined : "suave"}>{conTotal ? formatMoney(porZona.get(s.price_category_id ?? "")?.price ?? 0) : porZona.get(s.price_category_id ?? "")?.nombre}</span>
                </li>
              ))}
            </ul>
          )}
          {zonasElegidas.map((z) => (
            <div key={z.categoryId} style={{ padding: 12, borderRadius: 14, background: "var(--fondo)" }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--acento)" }}>Tu lugar en {z.nombre} incluye</span>
              <Beneficios bs={z.beneficios} />
            </div>
          ))}
          <div className="campo">Código de descuento
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ flex: 1, minWidth: 0 }} value={codigo} disabled={!!desc} autoCapitalize="characters" onChange={(e) => setCodigo(e.target.value)} />
              <button className="boton contorno" style={{ minHeight: 52, fontSize: 11 }} onClick={aplicar}>{desc ? "Quitar" : "Aplicar"}</button>
            </div>
            {(d.note || descMsg) && <span style={{ fontSize: 12, fontWeight: 600, color: d.note || !desc ? "#dc2626" : "#16a34a" }}>{d.note || descMsg}</span>}
          </div>
          {conTotal && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, borderTop: "1px solid var(--linea)", paddingTop: 10 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{formatMoney(subtotal)}</span></span>
              {d.amount > 0 && <span style={{ display: "flex", justifyContent: "space-between", color: "#16a34a" }}><span>Descuento {desc?.codigo}</span><span>−{formatMoney(d.amount)}</span></span>}
              <span style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900 }}><span>Total</span><span>{formatMoney(subtotal - d.amount)}</span></span>
              <span className="suave" style={{ fontSize: 11 }}>El total final lo confirma el sistema al apartar tus asientos.</span>
            </div>
          )}
          {sesion && <label className="campo">Teléfono<input type="tel" inputMode="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></label>}
          <Vendedor fid={fid} valor={vend} cambia={setVend} check={vendCheck} setCheck={setVendCheck} />
          {err && <p className="aviso error" role="alert" style={{ margin: 0 }}>{err}</p>}
          {hibrido && <p className="suave" style={{ margin: 0, fontSize: 12 }}>Al tocar Siguiente se apartan tus lugares y se abre WhatsApp para seguir ahí.</p>}
          <Legal />
          {sesion
            ? <button className="boton principal" disabled={enviando || elegidos.length === 0} onClick={apartar}>
                {enviando ? "Apartando…" : hibrido ? "Siguiente" : `Apartar ${elegidos.length || ""} ${elegidos.length === 1 ? "asiento" : "asientos"}`}
              </button>
            : <>
                <Link to="/acceso" onClick={entrar} className="boton principal">Entrar para apartar</Link>
                <p className="suave" style={{ margin: 0, fontSize: 12 }}>Entra o crea tu cuenta gratis y regresas aquí.</p>
              </>}
        </Caja>
      </div>

      {elegidos.length > 0 && (
        <div style={{ position: "fixed", left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 30, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "10px 10px 10px 18px", borderRadius: 26, background: "var(--superficie, var(--tarjeta))", border: "1px solid var(--linea)", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
          <span style={{ fontSize: 14 }}><b>{elegidos.length} {elegidos.length === 1 ? "asiento" : "asientos"}</b>{conTotal && <> · {formatMoney(subtotal - d.amount)}</>}</span>
          <button className="boton principal" style={{ minHeight: 42, fontSize: 11, padding: "0 18px" }} onClick={() => resumen.current?.scrollIntoView({ behavior: "smooth" })}>{hibrido ? "Siguiente" : "Continuar"}</button>
        </div>
      )}
      <div style={{ height: elegidos.length ? 80 : 0 }} />
    </>
  );
}

// ── Mapa (filas o mapa libre), con zoom de dos dedos ─────────────────────────────────────────────────────────────
function Mapa({ asientos, zonas, formas, taken, sel, alternar, sinPrecios }: {
  asientos: MapSeat[]; zonas: ZonaPrecio[]; formas: NonNullable<Awaited<ReturnType<typeof leerMapa>>>["formas"];
  taken: Set<string>; sel: Set<string>; alternar: (s: MapSeat) => void; sinPrecios: boolean;
}) {
  const porZona = useMemo(() => new Map(zonas.map((z) => [z.categoryId, z])), [zonas]);
  const colores = useMemo(() => new Map([...zonas].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((z, i) => [z.categoryId, colorZona(z, i, ZONE_COLORS)])), [zonas]);
  const filas = useMemo(() => groupSeatsByRow(asientos), [asientos]);
  const libre = asientos.some((s) => s.pos_x != null);
  const caja = useRef<HTMLDivElement>(null);
  const cols = useMemo(() => Math.max(1, ...filas.map((r) => r.blocks.reduce((n, b) => n + b.length, 0) + r.blocks.length * 2 + 2)), [filas]);
  const [ajuste, setAjuste] = useState(24);
  const [zoom, setZoom] = useState<number | null>(null);
  const [zoomPlano, setZoomPlano] = useState(1);
  const pinch = useRef<{ d: number; s: number } | null>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAjuste(seatSize(e.contentRect.width - 16, cols)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols]);
  const tam = zoom ?? ajuste;
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const zPlano = (v: number) => Math.min(5, Math.max(1, Math.round(v * 10) / 10));
  const pinta = (s: MapSeat) => {
    const z = porZona.get(s.price_category_id ?? "");
    const ocupado = taken.has(s.id) || !z;
    const marcado = sel.has(s.id);
    const color = z ? colores.get(z.categoryId) ?? "#888888" : "#888888";
    return { z, ocupado, marcado, fondo: marcado ? "#ffffff" : ocupado ? "#3a3446" : color, texto: marcado ? "#0b0910" : ocupado ? "#6e6878" : textoSobre(color),
      titulo: `Asiento ${s.seat_label}${z ? `, ${z.nombre}${sinPrecios ? "" : `, ${formatMoney(z.price)}`}` : ""}${ocupado ? ", ocupado" : ""}` };
  };
  const zoomBoton = (t: string, etiqueta: string, fn: () => void) => <button aria-label={etiqueta} onClick={fn} style={{ minWidth: 40, height: 40, padding: "0 12px", borderRadius: 20, border: "1px solid var(--linea)", background: "transparent", color: "inherit", fontWeight: 800 }}>{t}</button>;

  return (
    <>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
        {[...zonas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || b.price - a.price).map((z) => (
          <li key={z.categoryId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 100, background: "var(--superficie, var(--tarjeta))", border: "1px solid var(--linea)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: colores.get(z.categoryId) }} />
            {z.nombre}{!sinPrecios && <> · {z.antes != null && <s style={{ opacity: 0.6 }}>{formatMoney(z.antes).replace(" MXN", "")}</s>} {formatMoney(z.price).replace(" MXN", "")}</>}
          </li>
        ))}
        <li style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px" }}><span style={{ width: 10, height: 10, borderRadius: 5, background: "#3a3446" }} />Ocupado</li>
        <li style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px" }}><span style={{ width: 10, height: 10, borderRadius: 5, background: "#ffffff", border: "1px solid var(--linea)" }} />Tu selección</li>
      </ul>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span className="suave">Zoom</span>
        {libre ? <>{zoomBoton("−", "Alejar", () => setZoomPlano((v) => zPlano(v - 0.5)))}{zoomBoton("+", "Acercar", () => setZoomPlano((v) => zPlano(v + 0.5)))}{zoomBoton("Ajustar", "Ajustar", () => setZoomPlano(1))}</>
          : <>{zoomBoton("−", "Alejar", () => setZoom(clampSeat(tam - 4)))}{zoomBoton("+", "Acercar", () => setZoom(clampSeat(tam + 4)))}{zoomBoton("Ajustar", "Ajustar", () => setZoom(null))}</>}
        <span className="suave" style={{ fontSize: 11 }}>o usa dos dedos</span>
      </div>
      <div ref={caja} style={{ maxHeight: "62vh", overflow: "auto", borderRadius: 20, background: "#16131c", padding: 8, touchAction: "pan-x pan-y", WebkitOverflowScrolling: "touch" }}
        onTouchStart={(e) => { if (e.touches.length === 2) pinch.current = { d: dist(e.touches), s: libre ? zoomPlano : tam }; }}
        onTouchMove={(e) => {
          if (e.touches.length !== 2 || !pinch.current) return;
          const k = dist(e.touches) / pinch.current.d;
          if (libre) setZoomPlano(zPlano(pinch.current.s * k)); else setZoom(clampSeat(pinch.current.s * k));
        }}
        onTouchEnd={() => { pinch.current = null; }}>
        {libre ? (() => {
          const puntos = asientos.filter((s) => s.pos_x != null).map((s) => ({ s, x: s.pos_x!, y: s.pos_y ?? 0, numero: s.seat_number, fila: s.seat_row, grupo: s.section ?? undefined }));
          const enc = encuadrePlano(formas, puntos);
          return (
            <svg viewBox={`${enc.x} ${enc.y} ${enc.w} ${enc.h}`} style={{ width: `${zoomPlano * 100}%`, display: "block" }} role="group" aria-label="Mapa de asientos">
              {formas.map((fo) => <FormaSvg key={fo.id} f={fo} />)}
              {etiquetasFila(puntos).map((e, i) => <text key={`${e.fila}-${i}`} x={e.x} y={e.y} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={800} fill="#a39cb3" aria-hidden="true">{e.fila}</text>)}
              {puntos.map(({ s, x, y }) => {
                const v = pinta(s);
                return (
                  <g key={s.id} role="button" aria-label={v.titulo} aria-pressed={v.marcado} aria-disabled={v.ocupado} onClick={() => !v.ocupado && alternar(s)} style={{ cursor: v.ocupado ? "not-allowed" : "pointer" }}>
                    <circle cx={x} cy={y} r={9} fill={v.fondo} stroke={v.marcado ? "#ffffff" : "none"} strokeWidth={2} />
                    {s.seat_number !== null && <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={s.seat_number > 99 ? 6.5 : 8} fontWeight={700} fill={v.texto} style={{ pointerEvents: "none" }}>{s.seat_number}</text>}
                  </g>
                );
              })}
            </svg>
          );
        })() : (
          <div style={{ margin: "0 auto", width: "max-content", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{ width: "100%", marginBottom: 10, padding: "8px 0", borderRadius: 8, background: "#2a2436", color: "#a39cb3", textAlign: "center", fontSize: 11, fontWeight: 800, letterSpacing: "0.3em" }}>ESCENARIO</div>
            {filas.map(({ row, blocks }) => (
              <div key={row} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 14, textAlign: "center", fontSize: 11, fontWeight: 800, color: "#a39cb3" }}>{row}</span>
                {blocks.map((b, bi) => (
                  <div key={bi} style={{ display: "flex", gap: 4 }}>
                    {b.map((s) => {
                      const v = pinta(s);
                      return (
                        <button key={s.id} type="button" disabled={v.ocupado} aria-pressed={v.marcado} aria-label={v.titulo} onClick={() => alternar(s)}
                          style={{ width: tam, height: tam, padding: 0, border: "none", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: Math.max(7, Math.round(tam * 0.38)), fontWeight: 800, background: v.fondo, color: v.texto, cursor: v.ocupado ? "not-allowed" : "pointer" }}>
                          {s.seat_number}
                        </button>
                      );
                    })}
                  </div>
                ))}
                <span style={{ width: 14, textAlign: "center", fontSize: 11, fontWeight: 800, color: "#a39cb3" }}>{row}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Entrada general ──────────────────────────────────────────────────────────────────────────────────────────────
function General({ fid, zonas, hibrido, conTotal, listo, entrar }: { fid: string; zonas: ZonaGeneral[]; hibrido: boolean; conTotal: boolean; listo: (o: Orden, tel: string) => void; entrar: () => void }) {
  const { sesion, nombre, telefono, setTelefono } = useComprador();
  const [zona, setZona] = useState(zonas.find((z) => z.libres > 0)?.price_category_id ?? "");
  const [cant, setCant] = useState(1);
  const [codigo, setCodigo] = useState("");
  const [nota, setNota] = useState("");
  const [vend, setVend] = useState("");
  const [vendCheck, setVendCheck] = useState<{ ok: boolean; text: string; code: string } | null>(null);
  const [err, setErr] = useState("");
  const [enviando, setEnviando] = useState(false);
  const z = zonas.find((x) => x.price_category_id === zona);
  const tope = Math.min(MAX_GENERAL, z?.libres ?? 0);

  const revisarCodigo = async () => {
    setNota("");
    if (!codigo.trim()) return;
    const { data, error } = await supabase.rpc("preview_discount_code", { target_performance_id: fid, target_code: codigo.trim() });
    setNota(error ? mensajeError(error) : `Código ${(data as DiscountPreview).codigo}: ${(data as DiscountPreview).percent}% de descuento (se confirma al apartar).`);
  };
  const apartar = async () => {
    setErr("");
    if (!telefonoOk(telefono)) return setErr("Revisa tu teléfono: escribe tus 10 dígitos (puedes incluir la lada).");
    setEnviando(true);
    try {
      listo(await apartarGeneral({ fid, nombre, telefono, zona, cantidad: cant, vendedor: vend, descuento: codigo }), telefono.trim());
    } catch (e) {
      setErr(mensajeError(e as { message: string }));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Caja>
      <span style={{ fontSize: 17, fontWeight: 900 }}>Entrada general</span>
      <p className="suave" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>Sin asiento numerado: entras a la zona y te acomodas al llegar. Máximo {MAX_GENERAL} {hibrido ? "por persona" : "por compra"}.</p>
      {zonas.map((x) => {
        const on = zona === x.price_category_id;
        return (
          <button key={x.price_category_id} type="button" disabled={x.libres === 0} aria-pressed={on} onClick={() => { setZona(x.price_category_id); setCant(1); }}
            style={{ textAlign: "left", padding: 14, borderRadius: 16, border: `1.5px solid ${on ? "var(--acento)" : "var(--linea)"}`, background: on ? "color-mix(in srgb, var(--acento) 10%, transparent)" : "transparent", color: "inherit", opacity: x.libres === 0 ? 0.5 : 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontWeight: 800 }}>{x.nombre}{conTotal && <> · {x.antes != null && <s style={{ opacity: 0.6, fontWeight: 500 }}>{formatMoney(x.antes)}</s>} {formatMoney(x.precio)}</>}</span>
            {x.descripcion && <span className="suave" style={{ fontSize: 12 }}>{x.descripcion}</span>}
            <Beneficios bs={x.beneficios} />
            <span style={{ fontSize: 13, fontWeight: 600, color: x.libres === 0 ? "#dc2626" : x.libres <= 10 ? "#d97706" : "var(--suave)" }}>{x.libres === 0 ? "Agotado" : x.libres <= 10 ? `¡Quedan ${x.libres}!` : `${x.libres} lugares disponibles`}</span>
          </button>
        );
      })}
      {z && tope > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>¿Cuántos?</span>
            <button className="circulo" aria-label="Uno menos" onClick={() => { void toque(); setCant((n) => Math.max(1, n - 1)); }}>−</button>
            <span style={{ width: 28, textAlign: "center", fontSize: 22, fontWeight: 900 }}>{cant}</span>
            <button className="circulo" aria-label="Uno más" onClick={() => { void toque(); setCant((n) => Math.min(tope, n + 1)); }}>+</button>
            {conTotal && <span style={{ marginLeft: "auto", fontSize: 18, fontWeight: 900 }}>{formatMoney(z.precio * cant)}</span>}
          </div>
          {sesion && <label className="campo">Teléfono<input type="tel" inputMode="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></label>}
          <label className="campo">Código de descuento<input value={codigo} autoCapitalize="characters" style={{ textTransform: "uppercase" }} onChange={(e) => setCodigo(e.target.value)} onBlur={() => void revisarCodigo()} />
            {nota && <span className="suave" style={{ fontSize: 12, fontWeight: 500 }}>{nota}</span>}
          </label>
          <Vendedor fid={fid} valor={vend} cambia={setVend} check={vendCheck} setCheck={setVendCheck} />
          {err && <p className="aviso error" role="alert" style={{ margin: 0 }}>{err}</p>}
          <Legal />
          {sesion
            ? <button className="boton principal" disabled={enviando || !telefono.trim()} onClick={apartar}>{enviando ? "Apartando…" : hibrido ? "Siguiente" : `Apartar ${cant} ${cant === 1 ? "lugar" : "lugares"}`}</button>
            : <Link to="/acceso" onClick={entrar} className="boton principal">Entrar para apartar</Link>}
        </>
      )}
      {zonas.every((x) => x.libres === 0) && <p style={{ margin: 0, color: "#dc2626", fontWeight: 600 }}>La entrada general está agotada para esta función.</p>}
    </Caja>
  );
}

// ── Listo ────────────────────────────────────────────────────────────────────────────────────────────────────────
function Listo({ o, telefono, obra, hibrido, conTotal }: { o: Orden; telefono: string; obra: string; hibrido: boolean; conTotal: boolean }) {
  const url = hibrido
    ? whatsappApartadoUrl(env.whatsapp, { prodName: obra, orderCode: o.orderCode, seats: o.seats, total: o.total, buyerPhone: telefono, incluye: o.incluye })
    : whatsappPayUrl(env.whatsapp, { prodName: obra, orderCode: o.orderCode, seats: o.seats, total: o.total, buyerPhone: telefono, discountCode: o.discountCodigo, discountAmount: o.discountAmount, incluye: o.incluye });
  const abierto = useRef(false);
  useEffect(() => {
    if (hibrido && url && !abierto.current) { abierto.current = true; void abrir(url); }
  }, [hibrido, url]);
  return (
    <Caja>
      <span style={{ fontSize: 16 }}>{hibrido ? "Código" : "Orden"} <b>{o.orderCode}</b> · {o.seats.join(", ")}{conTotal && <> · Total {formatMoney(o.total)}</>}</span>
      {o.incluye.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>{o.incluye.map((x) => <li key={x}>{x}</li>)}</ul>}
      <p className="aviso" style={{ margin: 0, borderColor: o.expiresAt ? "#d97706" : undefined }}>
        {o.expiresAt
          ? <>Tus lugares quedan apartados hasta <b>{limiteTexto(o.expiresAt)}</b>; {hibrido ? "si no se confirman para entonces" : "si no se confirma tu pago para entonces"}, se liberan solos.</>
          : <>Tus lugares quedan apartados a tu nombre {hibrido ? "hasta que se confirmen" : "hasta que se confirme tu pago"}.</>}
      </p>
      {hibrido ? (
        <p className="suave" style={{ margin: 0, fontSize: 14 }}>Te llevamos a WhatsApp con tu código y tus lugares para seguir ahí. Si no se abrió, toca el botón.</p>
      ) : (
        <>
          {conTotal && <span style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900, borderTop: "1px solid var(--linea)", borderBottom: "1px solid var(--linea)", padding: "10px 0" }}><span>Total a pagar</span><span>{formatMoney(o.total)}</span></span>}
          <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>Pago por WhatsApp: te pasamos los datos para pagar y confirmamos tu pago ahí. Cuando se apruebe, tus boletos con QR aparecen en Boletos y te llega un aviso.</p>
        </>
      )}
      {url
        ? <button className="boton" style={{ background: "#25d366", color: "#062b16" }} onClick={() => abrir(url)}>{hibrido ? "Abrir WhatsApp" : "Pagar con WhatsApp"}</button>
        : <Link to="/contacto" className="boton" style={{ background: "#25d366", color: "#062b16" }}>{hibrido ? "Escríbenos" : "Escríbenos para pagar"}</Link>}
      <Link to="/boletos" className="boton contorno">{hibrido ? "Ir a Mi cuenta" : "Ir a Mis boletos"}</Link>
    </Caja>
  );
}
