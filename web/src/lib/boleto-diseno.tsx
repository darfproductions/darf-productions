/* eslint-disable @next/next/no-img-element -- dentro de ImageResponse (satori), no es una página */
import { ImageResponse } from "next/og";
import { cargarFuentes } from "@/lib/medalla";
import { comoPng } from "@/lib/tarjeta-elenco";
import { fechaLarga, hora } from "@/lib/difusion-rules";
import { createClient } from "@/lib/supabase/server";
import { getTheme, posterUrl } from "@/lib/productions";
import { POSTER_COLUMNS } from "@/lib/poster";
import { BOLETO, buildPdf, qrBoleto, ticketsPdf, type BoletoVisual, type PdfTicket } from "@/lib/pdf-ticket";

// Boleto en PDF, versión bonita (Diego, 2026-10-26): una imagen por boleto con los colores, el ambiente y el logo
// de la obra. El QR no va en la imagen: el PDF lo dibuja encima en vectores, en el hueco blanco (BOLETO.qr).

const ORO = "#d7bb5f";

/** "A8" → fila A, asiento 8 (si viene así); si no, el texto tal cual. */
function partesAsiento(t: PdfTicket): { fila: string | null; numero: string | null; texto: string } {
  if (t.fila && t.numero != null) return { fila: t.fila, numero: String(t.numero), texto: t.asiento };
  return { fila: null, numero: null, texto: t.asiento };
}

export async function boletoJpeg(t: PdfTicket, v: BoletoVisual): Promise<Buffer> {
  const { w, h, qr } = BOLETO;
  const c = v.colores;
  const m = 36; // margen de la tarjeta
  const corte = qr.y - 70; // línea del talón
  const fecha = t.inicio ? fechaLarga(t.inicio) : t.funcion;
  const lahora = t.inicio ? hora(t.inicio) : null;
  const a = partesAsiento(t);
  const incluye = t.incluyeLista ?? [];
  const chico = incluye.length > 3;
  // satori no lee WebP ni rutas relativas: las imágenes van como PNG en data URI (si fallan, sin imagen).
  const [fondo, logo] = await Promise.all([comoPng(v.fondoUrl, w - 72), comoPng(v.logoUrl, 760)]);

  const res = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", background: "#0b0910", fontFamily: "Montserrat" }}>
        <div style={{ position: "absolute", left: m, top: m, width: w - m * 2, height: h - m * 2, display: "flex", flexDirection: "column", borderRadius: 44, overflow: "hidden", background: c.fondo, color: c.texto }}>
          {/* Arriba: ambiente o póster de la obra, con su logo. */}
          <div style={{ position: "relative", height: 520, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "40px 48px" }}>
            {fondo && <img src={fondo} alt="" width={w - m * 2} height={520} style={{ position: "absolute", left: 0, top: 0, width: w - m * 2, height: 520, objectFit: "cover" }} />}
            <div style={{ position: "absolute", left: 0, top: 0, width: w - m * 2, height: 520, display: "flex", backgroundImage: `linear-gradient(180deg, rgba(11,9,16,0.55) 0%, rgba(11,9,16,0.15) 40%, ${c.fondo} 100%)` }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: 7, color: ORO }}>BOLETO · DARF PRODUCTIONS</span>
              <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: 4, padding: "10px 20px", borderRadius: 30, border: `2px solid ${ORO}`, color: ORO }}>ADMITE 1</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              {logo
                ? <img src={logo} alt="" height={230} style={{ maxWidth: 760, height: 230, objectFit: "contain" }} />
                : <span style={{ fontSize: 84, fontWeight: 900, textAlign: "center", color: "#ffffff" }}>{t.obra}</span>}
            </div>
          </div>

          {/* Fecha, hora y lugar. */}
          <div style={{ display: "flex", flexDirection: "column", padding: "18px 56px 0" }}>
            <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: 5, color: c.acento }}>FUNCIÓN</span>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontSize: 50, fontWeight: 900, letterSpacing: -1 }}>{fecha}</span>
              {lahora && <span style={{ fontSize: 50, fontWeight: 900, color: c.acento }}>{lahora}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10, fontSize: 26, fontWeight: 800, opacity: 0.85 }}>
              {(t.lugar || t.puertas) && <span>{[t.lugar, t.puertas].filter(Boolean).join(" · ")}</span>}
              {t.direccion && <span style={{ marginTop: 4, fontSize: 22, opacity: 0.8 }}>{t.direccion}</span>}
            </div>
          </div>

          {/* Lugar asignado. */}
          <div style={{ display: "flex", margin: "28px 56px 0", padding: "22px 30px", borderRadius: 26, background: c.superficie, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: 5, color: c.acento }}>{t.zona ? t.zona.toUpperCase() : "TU LUGAR"}</span>
              {!a.fila && <span style={{ marginTop: 4, fontSize: 46, fontWeight: 900 }}>{a.texto}</span>}
            </div>
            {a.fila && (
              <div style={{ display: "flex", gap: 40 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 20, fontWeight: 800, opacity: 0.7 }}>FILA</span>
                  <span style={{ fontSize: 72, fontWeight: 900, lineHeight: 1 }}>{a.fila}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 20, fontWeight: 800, opacity: 0.7 }}>ASIENTO</span>
                  <span style={{ fontSize: 72, fontWeight: 900, lineHeight: 1 }}>{a.numero}</span>
                </div>
              </div>
            )}
          </div>

          {/* Lo que incluye (completo, cada uno en su renglón). */}
          {incluye.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", padding: "24px 56px 0", overflow: "hidden", maxHeight: 300 }}>
              <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: 5, color: c.acento }}>TU LUGAR INCLUYE</span>
              {incluye.slice(0, 6).map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", marginTop: chico ? 6 : 10 }}>
                  <div style={{ width: 12, height: 12, marginTop: chico ? 9 : 11, marginRight: 18, flexShrink: 0, background: ORO, transform: "rotate(45deg)" }} />
                  <span style={{ fontSize: chico ? 22 : 26, fontWeight: 800, lineHeight: 1.3 }}>{x}</span>
                </div>
              ))}
            </div>
          )}

          {/* Talón: línea punteada con muescas. */}
          <div style={{ position: "absolute", left: 0, top: corte - m, width: w - m * 2, display: "flex", alignItems: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, background: "#0b0910", marginLeft: -32 }} />
            <div style={{ flex: 1, height: 0, borderTop: `4px dashed ${c.texto}`, opacity: 0.35, margin: "0 10px" }} />
            <div style={{ width: 64, height: 64, borderRadius: 32, background: "#0b0910", marginRight: -32 }} />
          </div>

          {/* QR (hueco blanco: el PDF dibuja el código encima) y datos de la orden. */}
          <div style={{ position: "absolute", left: qr.x - m - 16, top: qr.y - m - 16, width: qr.size + 32, height: qr.size + 32, borderRadius: 28, background: "#ffffff", display: "flex" }} />
          <div style={{ position: "absolute", left: qr.x - m + qr.size + 56, top: qr.y - m, width: w - m * 2 - (qr.x - m + qr.size + 56) - 48, height: qr.size, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: 5, color: c.acento }}>ORDEN</span>
              <span style={{ fontSize: 40, fontWeight: 900 }}>{t.orden}</span>
              <span style={{ marginTop: 18, fontSize: 20, fontWeight: 900, letterSpacing: 5, color: c.acento }}>A NOMBRE DE</span>
              <span style={{ fontSize: 32, fontWeight: 800 }}>{t.comprador}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.35, opacity: 0.85 }}>Presenta este código en la entrada. Cada código vale una sola vez.</span>
              <span style={{ marginTop: 14, fontSize: 22, fontWeight: 900, color: ORO }}>darfproductions.com</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: w, height: h, fonts: await cargarFuentes() },
  );
  const png = Buffer.from(await res.arrayBuffer());
  const sharp = (await import("sharp")).default;
  return sharp(png).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
}

/** PDF de boletos con el diseño de la obra: una página por boleto (imagen + QR en vectores). Si la imagen falla
 *  (fuentes, red al bajar el póster), el PDF sencillo: el boleto siempre se descarga. */
export async function boletosPdf(tickets: PdfTicket[], v: BoletoVisual): Promise<Uint8Array> {
  try {
    const imgs = await Promise.all(tickets.map((t) => boletoJpeg(t, v)));
    return buildPdf(tickets.map((t, i) => ({ content: qrBoleto(t.qr), imagen: imgs[i] })));
  } catch (e) {
    console.error("boletosPdf: se usa el PDF sencillo", e);
    return ticketsPdf(tickets);
  }
}

/** Colores, logo y fondo (póster 16:9 o ambiente) de la obra; sin kit, los de DARF. */
export async function visualDeObra(pid: string | null | undefined): Promise<BoletoVisual> {
  const darf: BoletoVisual = { colores: { fondo: "#120d1d", superficie: "#221a35", texto: "#ffffff", acento: "#b78cff" }, logoUrl: null, fondoUrl: null };
  if (!pid) return darf;
  const { data } = await (await createClient()).from("productions")
    .select(`color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, frase, ${POSTER_COLUMNS}`).eq("id", pid).maybeSingle();
  const t = data ? getTheme(data as unknown as Parameters<typeof getTheme>[0]) : null;
  if (!t) return darf;
  return {
    colores: { fondo: t.fondo, superficie: t.superficie, texto: t.texto, acento: t.acento },
    logoUrl: t.logo,
    fondoUrl: posterUrl(data as unknown as Parameters<typeof posterUrl>[0], "destacada")?.url ?? t.ambiente,
  };
}
