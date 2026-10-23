/* eslint-disable @next/next/no-img-element -- dentro de ImageResponse (satori), no es una página */
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { TAMANO_PREVENTA, type FormatoPreventa, type TextoPreventa } from "@/lib/difusion-preventa-rules";
import { cargarFuentes } from "@/lib/medalla";
import { comoPng } from "@/lib/tarjeta-elenco";

// Diseños de preventa: el póster de la obra de fondo, degradado oscuro, arriba el logo de DARF (o de la Fan Zone)
// y el de la obra; el mensaje encima. El de código agrega el código, la liga y su QR.

export type DatosImagenPreventa = {
  formato: FormatoPreventa;
  obra: string;
  fondoUrl: string | null;
  logoUrl: string | null;
  colores: { fondo: string; texto: string; acento: string };
  texto: TextoPreventa;
  /** Club Fan: logo y color dorados. */
  fan: boolean;
  /** Preventa privada: código, liga (sin https://) y la URL completa para el QR. */
  codigo?: { codigo: string; liga: string; url: string } | null;
};

const ORO = "#d7bb5f";
const ORO_METAL = "linear-gradient(135deg, #f3e3a6 0%, #d7bb5f 40%, #9e7b33 75%, #e9d58c 100%)";

/** El renglón más largo cabe en el ancho (Montserrat Black ≈ 0.8 em por letra). */
function tamGrande(grande: string, max: number): number {
  const largo = Math.max(...grande.split("\n").map((r) => r.length));
  return Math.min(max, Math.floor(940 / (largo * 0.8)));
}

export async function preventaPng(d: DatosImagenPreventa): Promise<Buffer> {
  const { w, h } = TAMANO_PREVENTA[d.formato];
  const historia = d.formato === "historia";
  const cuadrado = d.formato === "cuadrado";
  const acento = d.fan ? ORO : d.colores.acento;
  const t = d.texto;
  const [fondo, logoObra, marca, qr] = await Promise.all([
    comoPng(d.fondoUrl, w),
    comoPng(d.logoUrl, 520),
    comoPng(d.fan ? "/marca/fan-zone-oro.svg" : "/marca/darf-horizontal-blanco.svg", 520),
    d.codigo ? QRCode.toDataURL(d.codigo.url, { margin: 1, width: 420, color: { dark: "#0b0910", light: "#ffffff" } }) : Promise.resolve(null),
  ]);
  // Tamaños según el formato (el cuadrado es el más justo).
  const s = (c: number, p: number, hi: number) => (cuadrado ? c : historia ? hi : p);
  const tam = tamGrande(t.grande, s(118, 150, 170));
  const qrLado = s(210, 230, 260);

  const res = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", position: "relative", background: d.colores.fondo, color: "#ffffff", fontFamily: "Montserrat" }}>
        {fondo
          ? <img src={fondo} width={w} height={h} style={{ position: "absolute", left: 0, top: 0, width: w, height: h, objectFit: "cover" }} alt="" />
          : <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex", backgroundImage: `radial-gradient(circle at 50% 30%, ${acento}66 0%, ${d.colores.fondo} 70%)` }} />}
        {/* Degradado: oscuro arriba (logos) y más abajo (texto). */}
        <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex",
          backgroundImage: "linear-gradient(180deg, rgba(11,9,16,0.75) 0%, rgba(11,9,16,0.05) 22%, rgba(11,9,16,0.15) 40%, rgba(11,9,16,0.88) 66%, rgba(11,9,16,0.97) 100%)" }} />
        {/* Arriba: DARF o Fan Zone a la izquierda; logo de la obra a la derecha. */}
        <div style={{ position: "absolute", left: 0, top: 0, width: w, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${s(44, 56, 90)}px 60px 0` }}>
          {marca ? <img src={marca} style={{ width: d.fan ? s(300, 340, 380) : s(260, 300, 330), objectFit: "contain" }} alt="" /> : <span style={{ fontSize: 40, fontWeight: 900 }}>DARF</span>}
          {logoObra ? <img src={logoObra} style={{ maxWidth: s(320, 360, 400), maxHeight: s(150, 170, 200), objectFit: "contain" }} alt="" />
            : <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: 2 }}>{d.obra.toUpperCase()}</span>}
        </div>
        {/* Mensaje encima del póster, en la parte de abajo. */}
        <div style={{ position: "absolute", left: 0, bottom: 0, width: w, display: "flex", flexDirection: "column", alignItems: "center", padding: `0 60px ${s(46, 64, 120)}px` }}>
          {t.arriba && <span style={{ fontSize: s(36, 42, 50), fontWeight: 800, letterSpacing: 8, color: acento, textAlign: "center" }}>{t.arriba.toUpperCase()}</span>}
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {t.grande.split("\n").map((r) => (
              <span key={r} style={{ fontSize: tam, fontWeight: 900, textAlign: "center", lineHeight: 1,
                ...(d.fan && /club fan/i.test(r) ? { backgroundImage: ORO_METAL, backgroundClip: "text", color: "transparent" } : {}) }}>{r.toUpperCase()}</span>
            ))}
          </div>
          {t.abajo && <span style={{ marginTop: s(10, 14, 20), fontSize: s(32, 36, 42), fontWeight: 800, textAlign: "center" }}>{t.abajo}</span>}
          {d.codigo && (
            // QR y código lado a lado (medidas que caben en el ancho), y la liga en su propio renglón centrado.
            <div style={{ marginTop: s(18, 26, 40), width: w - 120, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: s(24, 28, 36) }}>
                {qr && <img src={qr} width={qrLado} height={qrLado} style={{ width: qrLado, height: qrLado, borderRadius: 18, flexShrink: 0 }} alt="" />}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={{ fontSize: s(22, 26, 30), fontWeight: 800, letterSpacing: 6, color: acento }}>TU CÓDIGO</span>
                  <span style={{ marginTop: 6, padding: "8px 20px", border: `4px solid ${acento}`, borderRadius: 16, fontSize: s(44, 52, 60), fontWeight: 900, letterSpacing: 3 }}>{d.codigo.codigo}</span>
                </div>
              </div>
              <span style={{ marginTop: s(14, 18, 24), fontSize: s(22, 25, 28), fontWeight: 800, textAlign: "center" }}>{`Entra a ${d.codigo.liga}`}</span>
            </div>
          )}
          {/* Franja itálica (satori no trae itálica: se inclina). */}
          <div style={{ marginTop: s(22, 30, 46), display: "flex", padding: "10px 34px", background: acento, transform: "skewX(-10deg)" }}>
            <span style={{ fontSize: s(26, 30, 34), fontWeight: 900, letterSpacing: 3, color: "#0b0910" }}>{t.banda.toUpperCase()}</span>
          </div>
        </div>
      </div>
    ),
    { width: w, height: h, fonts: await cargarFuentes() },
  );
  return Buffer.from(await res.arrayBuffer());
}
