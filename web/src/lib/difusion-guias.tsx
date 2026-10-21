/* eslint-disable @next/next/no-img-element -- dentro de ImageResponse (satori), no es una página */
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { partesTitulo, type Guia } from "@/lib/difusion-guias-rules";
import { cargarFuentes } from "@/lib/medalla";
import { TAMANO, comoPng, type FormatoTarjeta } from "@/lib/tarjeta-elenco";

// Guías de difusión de DARF (Club Fan, crear cuenta): fondo de la casa, título grande, pasos numerados,
// QR a la página y el logo de DARF. Mismo estilo que los diseños de las obras (0111).

const FONDO = "#0b0910";
const TEXTO = "#f4f1f8";
const VIOLETA = "#a48bff";
const ORO = "#d7bb5f";
/** Oro metálico del Club Fan (mismo trazo que --oro-metal del sitio). */
const ORO_METAL = "linear-gradient(135deg, #f3e3a6 0%, #d7bb5f 40%, #9e7b33 75%, #e9d58c 100%)";

export async function guiaPng(g: Guia, formato: FormatoTarjeta, sitio: string): Promise<Buffer> {
  const { w, h } = TAMANO[formato];
  const historia = formato === "historia";
  const acento = g.oro ? ORO : VIOLETA;
  const liga = `${sitio}${g.ruta}`;
  const [arribaLogo, darf, qr] = await Promise.all([
    comoPng(g.oro ? "/marca/fan-zone-oro.svg" : "/marca/darf-horizontal-blanco.svg", 640),
    comoPng("/marca/darf-horizontal-blanco.svg", 360),
    QRCode.toDataURL(liga, { margin: 1, width: 360, errorCorrectionLevel: "M" }),
  ]);
  const tamTitulo = historia ? 150 : 124;
  const tamPaso = historia ? 44 : 37;
  const circulo = historia ? 76 : 64;

  const res = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", background: FONDO, color: TEXTO, fontFamily: "Montserrat", padding: `${historia ? 120 : 64}px 72px ${historia ? 110 : 56}px` }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex", backgroundImage: `radial-gradient(circle at 50% 8%, ${acento}44 0%, ${FONDO} 58%)` }} />
        {arribaLogo && <img src={arribaLogo} style={{ width: g.oro ? (historia ? 520 : 420) : (historia ? 420 : 340), objectFit: "contain" }} alt="" />}
        <span style={{ marginTop: historia ? 56 : 36, fontSize: historia ? 40 : 34, fontWeight: 800, letterSpacing: 8, color: acento }}>{g.arriba.toUpperCase()}</span>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {partesTitulo(g.titulo).map((renglon, i) => (
            <div key={i} style={{ display: "flex", lineHeight: 1 }}>
              {renglon.map((p, j) => (
                <span key={j} style={{ fontSize: tamTitulo, fontWeight: 900, textAlign: "center",
                  ...(p.resaltado ? (g.oro ? { backgroundImage: ORO_METAL, backgroundClip: "text", color: "transparent" } : { color: VIOLETA }) : {}) }}>
                  {p.texto.toUpperCase()}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: historia ? 80 : 48, display: "flex", flexDirection: "column", gap: historia ? 34 : 24, width: "100%" }}>
          {g.pasos.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <div style={{ width: circulo, height: circulo, flexShrink: 0, borderRadius: circulo, display: "flex", alignItems: "center", justifyContent: "center",
                background: g.oro ? ORO_METAL : VIOLETA, color: FONDO, fontSize: circulo * 0.55, fontWeight: 900 }}>{i + 1}</div>
              <span style={{ fontSize: tamPaso, fontWeight: 800, lineHeight: 1.2 }}>{p}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: historia ? 64 : 36, display: "flex", padding: "10px 30px", background: acento, transform: "skewX(-10deg)" }}>
          <span style={{ fontSize: historia ? 28 : 23, fontWeight: 900, letterSpacing: 2, color: FONDO }}>{g.extra.toUpperCase()}</span>
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 36 }}>
          <div style={{ display: "flex", padding: 12, background: "#ffffff", borderRadius: 20 }}>
            <img src={qr} width={historia ? 230 : 180} height={historia ? 230 : 180} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {darf ? <img src={darf} style={{ width: 340, objectFit: "contain" }} alt="" /> : <span style={{ fontSize: 38, fontWeight: 900 }}>DARF PRODUCTIONS</span>}
            <span style={{ fontSize: historia ? 34 : 29, fontWeight: 800, letterSpacing: 1 }}>{liga.replace(/^https?:\/\/(www\.)?/, "")}</span>
          </div>
        </div>
      </div>
    ),
    { width: w, height: h, fonts: await cargarFuentes() },
  );
  return Buffer.from(await res.arrayBuffer());
}
