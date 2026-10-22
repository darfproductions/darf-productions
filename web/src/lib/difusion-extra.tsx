/* eslint-disable @next/next/no-img-element -- dentro de ImageResponse (satori), no es una página */
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { textoBeneficio } from "@/lib/beneficios-rules";
import { TAMANO_PREVENTA, type FormatoPreventa } from "@/lib/difusion-preventa-rules";
import { precioCorto, puntosMapa, type DisenoExtra, type OpcionCompra } from "@/lib/difusion-extra-rules";
import type { DatosExtra } from "@/lib/difusion-extra-datos";
import { cargarFuentes } from "@/lib/medalla";
import { comoPng } from "@/lib/tarjeta-elenco";

// Más diseños de Difusión, con el mismo marco que los de preventa: póster de fondo oscurecido, logo de DARF y de la
// obra arriba. Cada diseño pone su contenido en el cuerpo.

export type DatosImagenExtra = {
  diseno: DisenoExtra;
  formato: FormatoPreventa;
  obra: string;
  fondoUrl: string | null;
  logoUrl: string | null;
  colores: { fondo: string; texto: string; acento: string };
  /** Liga de la obra sin https:// y URL completa para el QR. */
  liga: string;
  url: string;
  whatsapp: string;
  lugar: string | null;
  /** Fecha y hora de la función elegida (o fechas de la temporada). */
  fecha: string;
  hora: string | null;
  extra?: DatosExtra;
  pasos?: OpcionCompra[];
  calendario?: { renglones: { fecha: string; hora: string }[]; mas: number };
};

export async function extraPng(d: DatosImagenExtra): Promise<Buffer> {
  const { w, h } = TAMANO_PREVENTA[d.formato];
  const cuadrado = d.formato === "cuadrado", historia = d.formato === "historia";
  const s = (c: number, p: number, hi: number) => (cuadrado ? c : historia ? hi : p);
  const acento = d.colores.acento;
  const invitacion = d.diseno === "invitacion";
  const [fondo, logoObra, marca, qr] = await Promise.all([
    comoPng(d.fondoUrl, w),
    comoPng(d.logoUrl, invitacion ? 900 : 520),
    comoPng("/marca/darf-horizontal-blanco.svg", 520),
    d.diseno === "mapa" || d.diseno === "incluye" ? Promise.resolve(null) : QRCode.toDataURL(d.url, { margin: 1, width: 360, color: { dark: "#0b0910", light: "#ffffff" } }),
  ]);
  const arriba = s(40, 50, 80);
  const cuerpoTop = invitacion ? 0 : s(190, 220, 300);
  const titulo = (t: string, tam = s(70, 84, 96)) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {t.split("\n").map((r) => <span key={r} style={{ fontSize: tam, fontWeight: 900, lineHeight: 1, textAlign: "center" }}>{r.toUpperCase()}</span>)}
    </div>
  );
  const pie = (
    <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: s(18, 26, 40) }}>
      {qr && <img src={qr} width={s(150, 180, 220)} height={s(150, 180, 220)} style={{ borderRadius: 14 }} alt="" />}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: s(22, 25, 30), fontWeight: 800, letterSpacing: 4, color: acento }}>MÁS INFORMACIÓN</span>
        {d.whatsapp && <span style={{ marginTop: 6, fontSize: s(30, 34, 40), fontWeight: 900 }}>WhatsApp {d.whatsapp}</span>}
        <span style={{ marginTop: 2, fontSize: s(24, 27, 32), fontWeight: 800 }}>{d.liga}</span>
      </div>
    </div>
  );

  let cuerpo: React.ReactNode = null;
  if (d.diseno === "mapa" && d.extra) {
    const mw = w - 120, mh = s(520, 760, 1060);
    const m0 = puntosMapa(d.extra.asientos, d.extra.formas, mw, mh);
    // La caja mide lo que mide el mapa (sin espacio vacío abajo).
    const alto = m0.puntos.length ? Math.min(mh, Math.max(...m0.puntos.map((p) => p.y)) + m0.radio + 24) : Math.round(mh * 0.4);
    const m = m0;
    const color = new Map(d.extra.zonas.map((z) => [z.id, z.color]));
    const zonas = d.extra.zonas.filter((z) => z.general || d.extra!.asientos.some((a) => a.zona === z.id));
    cuerpo = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: w }}>
        {titulo("Zonas y precios", s(56, 70, 84))}
        <span style={{ marginTop: 6, fontSize: s(26, 30, 36), fontWeight: 800, opacity: 0.85 }}>{d.fecha}{d.hora ? ` · ${d.hora}` : ""}</span>
        <div style={{ position: "relative", marginTop: s(14, 24, 36), width: mw, height: alto, display: "flex", borderRadius: 24, background: "rgba(11,9,16,0.55)" }}>
          {m.escenarioArriba && m.puntos.length > 0 && (
            <div style={{ position: "absolute", left: mw * 0.2, top: 14, width: mw * 0.6, height: s(44, 52, 64), display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "rgba(255,255,255,0.14)" }}>
              <span style={{ fontSize: s(20, 22, 26), fontWeight: 900, letterSpacing: 8 }}>ESCENARIO</span>
            </div>
          )}
          {m.formas.map((f, i) => (
            <div key={i} style={{ position: "absolute", left: f.x - f.ancho / 2, top: f.y - f.alto / 2, width: f.ancho, height: f.alto, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "rgba(255,255,255,0.14)", transform: `rotate(${f.rot}deg)` }}>
              <span style={{ fontSize: s(18, 20, 24), fontWeight: 900, letterSpacing: 4 }}>{f.etiqueta.toUpperCase()}</span>
            </div>
          ))}
          {m.puntos.map((p, i) => (
            <div key={i} style={{ position: "absolute", left: p.x - m.radio, top: p.y - m.radio, width: m.radio * 2, height: m.radio * 2, borderRadius: m.radio, background: color.get(p.zona ?? "") ?? "#555" }} />
          ))}
          {m.puntos.length === 0 && <span style={{ margin: "auto", fontSize: 30, fontWeight: 800, opacity: 0.7 }}>Entrada general</span>}
        </div>
        <div style={{ marginTop: s(16, 22, 34), display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, width: w - 100 }}>
          {zonas.map((z) => (
            <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderRadius: 999, background: "rgba(11,9,16,0.7)", border: `3px solid ${z.color}` }}>
              <div style={{ width: 24, height: 24, borderRadius: 12, background: z.color }} />
              <span style={{ fontSize: s(26, 30, 34), fontWeight: 900 }}>{z.nombre}{z.general ? " (general)" : ""}</span>
              {d.extra!.mostrarPrecios && z.precio != null && <span style={{ fontSize: s(26, 30, 34), fontWeight: 900, color: acento }}>{precioCorto(z.precio)}</span>}
            </div>
          ))}
        </div>
        <span style={{ marginTop: s(14, 20, 30), fontSize: s(24, 27, 32), fontWeight: 800 }}>Elige tu lugar en {d.liga}</span>
      </div>
    );
  } else if (d.diseno === "comprar" && d.pasos) {
    const dos = d.pasos.length > 1;
    cuerpo = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: w }}>
        {titulo("¿Cómo compro\nmis boletos?", s(58, 72, 86))}
        <div style={{ marginTop: s(18, 30, 44), display: "flex", flexDirection: "column", gap: s(14, 22, 32), width: w - 120 }}>
          {d.pasos.map((o, i) => (
            <div key={o.titulo} style={{ display: "flex", flexDirection: "column", padding: s(18, 26, 34), borderRadius: 26, background: "rgba(11,9,16,0.72)", border: `3px solid ${acento}` }}>
              <span style={{ fontSize: s(22, 26, 30), fontWeight: 900, letterSpacing: 5, color: acento }}>{dos ? `OPCIÓN ${i + 1} · ` : ""}{o.titulo.toUpperCase()}</span>
              {o.pasos.map((p, k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 16, marginTop: s(8, 12, 16) }}>
                  <div style={{ width: s(40, 46, 54), height: s(40, 46, 54), borderRadius: 999, background: acento, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: s(22, 26, 30), fontWeight: 900, color: "#0b0910" }}>{k + 1}</span>
                  </div>
                  <span style={{ fontSize: s(26, 31, 36), fontWeight: 800 }}>{p}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {pie}
      </div>
    );
  } else if (d.diseno === "calendario" && d.calendario) {
    cuerpo = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: w }}>
        {titulo("Funciones", s(70, 86, 100))}
        {d.lugar && <span style={{ marginTop: 6, fontSize: s(26, 30, 36), fontWeight: 800, opacity: 0.85 }}>{d.lugar}</span>}
        <div style={{ marginTop: s(16, 26, 40), display: "flex", flexDirection: "column", width: w - 140, borderRadius: 26, background: "rgba(11,9,16,0.72)", padding: `${s(6, 10, 16)}px ${s(24, 30, 36)}px` }}>
          {d.calendario.renglones.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${s(10, 14, 20)}px 0`, borderBottom: i < d.calendario!.renglones.length - 1 ? "2px solid rgba(255,255,255,0.15)" : "none" }}>
              <span style={{ fontSize: s(30, 34, 40), fontWeight: 900 }}>{r.fecha}</span>
              <span style={{ fontSize: s(30, 34, 40), fontWeight: 900, color: acento }}>{r.hora}</span>
            </div>
          ))}
          {d.calendario.renglones.length === 0 && <span style={{ padding: 20, fontSize: 34, fontWeight: 800 }}>Fechas por anunciar</span>}
        </div>
        {d.calendario.mas > 0 && <span style={{ marginTop: 12, fontSize: s(24, 28, 32), fontWeight: 800 }}>y {d.calendario.mas} {d.calendario.mas === 1 ? "fecha más" : "fechas más"}</span>}
        {pie}
      </div>
    );
  } else if (d.diseno === "incluye" && d.extra) {
    const zonas = d.extra.zonas.slice(0, s(3, 4, 6));
    cuerpo = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: w }}>
        {titulo("¿Qué incluye\ntu lugar?", s(56, 72, 86))}
        <div style={{ marginTop: s(16, 26, 40), display: "flex", flexDirection: "column", gap: s(12, 18, 24), width: w - 120 }}>
          {zonas.map((z) => (
            <div key={z.id} style={{ display: "flex", flexDirection: "column", padding: s(16, 22, 28), borderRadius: 24, background: "rgba(11,9,16,0.72)", borderLeft: `14px solid ${z.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: s(34, 40, 46), fontWeight: 900 }}>{z.nombre.toUpperCase()}</span>
                {d.extra!.mostrarPrecios && z.precio != null && <span style={{ fontSize: s(32, 38, 44), fontWeight: 900, color: acento }}>{precioCorto(z.precio)}</span>}
              </div>
              {z.beneficios.length
                ? z.beneficios.slice(0, 4).map((b) => (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: acento }} />
                    <span style={{ fontSize: s(24, 28, 32), fontWeight: 700 }}>{textoBeneficio(b)}</span>
                  </div>
                ))
                : <span style={{ marginTop: 6, fontSize: s(24, 28, 32), fontWeight: 700, opacity: 0.75 }}>Tu lugar en {z.nombre}</span>}
            </div>
          ))}
        </div>
        <span style={{ marginTop: s(14, 22, 34), fontSize: s(24, 27, 32), fontWeight: 800 }}>Elige tu lugar en {d.liga}</span>
      </div>
    );
  } else if (invitacion) {
    cuerpo = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: w, height: h, padding: `${s(150, 190, 260)}px 60px ${s(40, 60, 110)}px` }}>
        <span style={{ fontSize: s(30, 36, 44), fontWeight: 800, letterSpacing: 8, color: acento }}>DARF PRODUCTIONS</span>
        <span style={{ marginTop: 4, fontSize: s(44, 54, 64), fontWeight: 900 }}>TE INVITA A</span>
        {logoObra ? <img src={logoObra} style={{ marginTop: s(14, 24, 40), maxWidth: s(780, 860, 900), maxHeight: s(250, 340, 440), objectFit: "contain" }} alt="" />
          : <span style={{ marginTop: 24, fontSize: 110, fontWeight: 900 }}>{d.obra.toUpperCase()}</span>}
        <span style={{ marginTop: s(18, 28, 44), fontSize: s(40, 48, 56), fontWeight: 900, textAlign: "center" }}>{d.fecha}</span>
        {d.hora && <span style={{ fontSize: s(36, 42, 50), fontWeight: 900, color: acento }}>{d.hora}</span>}
        {d.lugar && <span style={{ marginTop: 6, fontSize: s(28, 32, 38), fontWeight: 800, opacity: 0.9, textAlign: "center" }}>{d.lugar}</span>}
        {pie}
      </div>
    );
  }

  const res = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", position: "relative", background: d.colores.fondo, color: "#ffffff", fontFamily: "Montserrat" }}>
        {fondo
          ? <img src={fondo} width={w} height={h} style={{ position: "absolute", left: 0, top: 0, width: w, height: h, objectFit: "cover" }} alt="" />
          : <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex", backgroundImage: `radial-gradient(circle at 50% 30%, ${acento}66 0%, ${d.colores.fondo} 70%)` }} />}
        <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex",
          backgroundImage: invitacion
            ? "linear-gradient(180deg, rgba(11,9,16,0.7) 0%, rgba(11,9,16,0.45) 30%, rgba(11,9,16,0.8) 70%, rgba(11,9,16,0.95) 100%)"
            : "linear-gradient(180deg, rgba(11,9,16,0.8) 0%, rgba(11,9,16,0.72) 30%, rgba(11,9,16,0.88) 100%)" }} />
        <div style={{ position: "absolute", left: 0, top: 0, width: w, display: "flex", alignItems: "center", justifyContent: invitacion ? "center" : "space-between", padding: `${arriba}px 60px 0` }}>
          {marca ? <img src={marca} style={{ width: s(260, 300, 330), objectFit: "contain" }} alt="" /> : <span style={{ fontSize: 40, fontWeight: 900 }}>DARF</span>}
          {!invitacion && (logoObra ? <img src={logoObra} style={{ maxWidth: s(320, 360, 400), maxHeight: s(130, 150, 190), objectFit: "contain" }} alt="" />
            : <span style={{ fontSize: 40, fontWeight: 900 }}>{d.obra.toUpperCase()}</span>)}
        </div>
        {/* El contenido se centra en el espacio bajo los logos (los diseños cortos no quedan pegados arriba). */}
        <div style={{ position: "absolute", left: 0, top: cuerpoTop, width: w, height: h - cuerpoTop - (invitacion ? 0 : s(30, 40, 70)), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{cuerpo}</div>
      </div>
    ),
    { width: w, height: h, fonts: await cargarFuentes() },
  );
  return Buffer.from(await res.arrayBuffer());
}
