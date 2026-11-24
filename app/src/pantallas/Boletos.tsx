import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import QRCode from "qrcode";
import { Icono } from "~/componentes/Icono";
import { agregarAWallet, walletDelTelefono } from "~/lib/archivos";
import { funcionPasada, imagen, leerMisOrdenes, poster, type Boleto, type Orden } from "~/lib/datos";
import { env } from "~/lib/env";
import { dinero, fechaLarga, hora } from "~/lib/formato";
import { useSesion } from "~/lib/sesion";
import { abrir, abrirWeb, useCarga } from "~/lib/usar";

// Mis boletos: los aprobados con su QR, los pendientes de pago y los de funciones pasadas.
// Pendiente: guardarlos en el teléfono para verlos sin señal (ver app/README.md).

export function Boletos() {
  const { sesion, cargando: cargandoSesion } = useSesion();
  const [pestana, setPestana] = useState<"proximos" | "pasados">("proximos");
  const userId = sesion?.user.id ?? null;
  const { datos, error, cargando } = useCarga(() => (userId ? leerMisOrdenes(userId) : Promise.resolve([])), [userId]);

  const { aprobadas, pendientes, pasadas } = useMemo(() => {
    const ordenes = datos ?? [];
    const futura = (o: Orden) => !funcionPasada(o.funcion?.starts_at ?? null);
    return {
      aprobadas: ordenes.filter((o) => o.status === "aprobado" && futura(o)),
      pendientes: ordenes.filter((o) => o.status === "pendiente" && futura(o)),
      pasadas: ordenes.filter((o) => o.status === "aprobado" && !futura(o)),
    };
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
            {cargando && <div className="esqueleto" style={{ marginTop: 16, height: 420, borderRadius: 24 }} />}
            {error && <p className="aviso error" style={{ marginTop: 16 }}>No pudimos cargar tus boletos. Revisa tu conexión.</p>}

            {!cargando && pestana === "proximos" && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                {aprobadas.flatMap((o) => o.boletos.filter((b) => b.is_active).map((b, i, todos) => <TarjetaBoleto key={b.id} o={o} b={b} n={i + 1} total={todos.length} />))}
                {pendientes.map((o) => <Pendiente key={o.id} o={o} />)}
                {!aprobadas.length && !pendientes.length && (
                  <div className="tarjeta" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>Aún no tienes boletos para próximas funciones.</p>
                    <Link to="/obras" className="boton contorno">Ver obras</Link>
                  </div>
                )}
              </div>
            )}

            {!cargando && pestana === "pasados" && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {pasadas.map((o) => (
                  <div key={o.id} className="tarjeta" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
                    {o.obra && poster(o.obra, "boleto") && <img src={poster(o.obra, "boleto")!} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover" }} />}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{o.obra?.nombre ?? "Función"}</span>
                      <span className="suave" style={{ fontSize: 12 }}>{o.funcion?.starts_at ? fechaLarga(o.funcion.starts_at) : ""}</span>
                    </div>
                    <span className="suave" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>Asististe</span>
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

function TarjetaBoleto({ o, b, n, total }: { o: Orden; b: Boleto; n: number; total: number }) {
  const [qr, setQr] = useState<string | null>(null);
  const wallet = walletDelTelefono();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  useEffect(() => { QRCode.toDataURL(b.qr_token, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(null)); }, [b.qr_token]);
  const fondo = o.obra?.color_fondo ?? "#0c1830";
  const texto = o.obra?.color_texto ?? "#ffffff";
  const acento = o.obra?.color_acento ?? "#d7a312";
  const logo = imagen(o.obra?.logo_path);
  const f = o.funcion?.starts_at;

  return (
    <article aria-label={`Boleto ${n} de ${total}: ${b.asiento ?? b.zona ?? ""}`} style={{ borderRadius: 24, overflow: "hidden", background: "#ffffff", boxShadow: "var(--sombra)" }}>
      <div style={{ background: fondo, color: texto, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {logo ? <img src={logo} alt={o.obra?.nombre ?? ""} style={{ height: 44, maxWidth: 160, objectFit: "contain" }} /> : <span style={{ fontSize: 18, fontWeight: 900 }}>{o.obra?.nombre}</span>}
          <span className="pildora" style={{ marginLeft: "auto", background: "#14532d", color: "#a7f3c0" }}>Pagado</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>{f ? `${fechaLarga(f)} · ${hora(f)}` : ""}{o.funcion?.venue ? ` · ${o.funcion.venue}` : ""}</span>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <div><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: acento }}>Zona</dt><dd style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{b.zona ?? "—"}</dd></div>
          <div><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: acento }}>Asiento</dt><dd style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{b.asiento ?? "General"}</dd></div>
        </dl>
      </div>
      <div aria-hidden="true" style={{ position: "relative", height: 20, display: "flex", alignItems: "center" }}>
        <span style={{ position: "absolute", left: -10, width: 20, height: 20, borderRadius: 10, background: "var(--fondo)" }} />
        <span style={{ flex: 1, margin: "0 16px", borderTop: "2px dashed #d6d6d6" }} />
        <span style={{ position: "absolute", right: -10, width: 20, height: 20, borderRadius: 10, background: "var(--fondo)" }} />
      </div>
      <div style={{ padding: "4px 16px 18px", display: "flex", alignItems: "center", gap: 16, color: "#0b0b0b" }}>
        {qr ? <img src={qr} alt="Código QR del boleto" style={{ width: 140, height: 140 }} /> : <div style={{ width: 140, height: 140, background: "#ebebeb", borderRadius: 8 }} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5f5f5f" }}>Boleto {n} de {total} · {o.order_code}</span>
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{b.checked_in_at ? "Este boleto ya entró." : "Muestra este código en la entrada."}</span>
        </div>
      </div>
      {wallet && !b.checked_in_at && !funcionPasada(o.funcion?.starts_at ?? null) && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <button disabled={ocupado} onClick={async () => {
            setOcupado(true); setAviso("");
            try { setAviso(await agregarAWallet(`boleto/${b.id}`)); } catch (e) { setAviso(e instanceof Error ? e.message : String(e)); } finally { setOcupado(false); }
          }} style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#000000", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            <Icono nombre="wallet" tamano={20} />{ocupado ? "Preparando tu pase…" : wallet === "apple" ? "Añadir a Apple Wallet" : "Agregar a Google Wallet"}
          </button>
          {aviso && <span role="status" style={{ fontSize: 12, color: "#5f5f5f", textAlign: "center" }}>{aviso}</span>}
        </div>
      )}
    </article>
  );
}

function Pendiente({ o }: { o: Orden }) {
  const pagar = () => {
    if (!env.whatsapp) return abrirWeb("/cuenta");
    const texto = `Hola, envío el comprobante de mi orden ${o.order_code} (${o.obra?.nombre ?? ""}) por ${dinero(o.total)}.`;
    return abrir(`https://wa.me/${env.whatsapp}?text=${encodeURIComponent(texto)}`);
  };
  return (
    <div className="tarjeta" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dorado-texto)" }}>Pago pendiente · {o.order_code}</span>
        <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45 }}>{o.obra?.nombre}: envíanos tu comprobante para confirmar ({dinero(o.total)}).</span>
      </div>
      <button className="boton" onClick={pagar} style={{ minHeight: 44, padding: "0 16px", background: "#25d366", color: "#0b0b0b", fontSize: 12 }}>
        <Icono nombre="whatsapp" tamano={16} />WhatsApp
      </button>
    </div>
  );
}
