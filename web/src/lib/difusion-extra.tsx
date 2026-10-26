/* eslint-disable @next/next/no-img-element -- dentro de ImageResponse (satori), no es una página */
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { textoBeneficio } from "@/lib/beneficios-rules";
import { TAMANO_PREVENTA, type FormatoPreventa } from "@/lib/difusion-preventa-rules";
import { esInvitacion, precioZona, puntosMapa, zonasIncluye, type DisenoExtra, type OpcionCompra } from "@/lib/difusion-extra-rules";
import type { DatosExtra } from "@/lib/difusion-extra-datos";
import { cargarFuentes } from "@/lib/medalla";
import { comoPng } from "@/lib/tarjeta-elenco";

// Más diseños de Difusión, con el mismo marco que los de preventa: póster de fondo oscurecido y tres franjas que
// ocupan todo el alto: logos arriba, título + contenido al centro (toma el espacio que sobra y se centra) y el pie
// abajo con margen fijo. Así hay aire entre las partes sin huecos grandes.

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
  /** Invitaciones: todas las funciones agrupadas por día. */
  dias?: { dias: { fecha: string; horas: string }[]; mas: number };
  /** 0127: "Prepárate para tu función" (el QR lleva a Google Maps). */
  preparate?: { horas: { etiqueta: string; hora: string }[]; recordatorios: string[]; direccion: string | null; maps: string | null };
};

export async function extraPng(d: DatosImagenExtra): Promise<Buffer> {
  const { w, h } = TAMANO_PREVENTA[d.formato];
  const cuadrado = d.formato === "cuadrado", historia = d.formato === "historia";
  /** Valor según el formato: cuadrado, post 3:4, historia 9:16. */
  const s = (c: number, p: number, hi: number) => (cuadrado ? c : historia ? hi : p);
  const acento = d.colores.acento;
  const invitacion = esInvitacion(d.diseno);
  const conQr = invitacion || d.diseno === "comprar" || d.diseno === "calendario" || (d.diseno === "preparate" && !!d.preparate?.maps);
  const [fondo, logoObra, marca, qr] = await Promise.all([
    comoPng(d.fondoUrl, w),
    comoPng(d.logoUrl, invitacion ? 960 : 520),
    comoPng("/marca/darf-horizontal-blanco.svg", 520),
    conQr ? QRCode.toDataURL(d.diseno === "preparate" ? d.preparate!.maps! : d.url, { margin: 1, width: 360, color: { dark: "#0b0910", light: "#ffffff" } }) : Promise.resolve(null),
  ]);

  // Medidas comunes.
  const lado = 60;
  const margenArriba = s(40, 52, 84);
  const margenAbajo = s(44, 60, 96);
  const separacion = s(26, 36, 50);
  const altoLogos = s(130, 150, 190);

  const titulo = (t: string, tam: number) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {t.split("\n").map((r) => <span key={r} style={{ fontSize: tam, fontWeight: 900, lineHeight: 1.02, textAlign: "center" }}>{r.toUpperCase()}</span>)}
    </div>
  );
  const subtitulo = (t: string) => <span style={{ marginTop: s(8, 12, 16), fontSize: s(26, 31, 38), fontWeight: 800, opacity: 0.88, textAlign: "center" }}>{t}</span>;
  const qrLado = s(150, 184, 230);
  const pieInfo = (
    <div style={{ display: "flex", alignItems: "center", gap: s(22, 28, 34) }}>
      {qr && <img src={qr} width={qrLado} height={qrLado} style={{ width: qrLado, height: qrLado, borderRadius: 14 }} alt="" />}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: s(21, 24, 29), fontWeight: 800, letterSpacing: 4, color: acento }}>MÁS INFORMACIÓN</span>
        {d.whatsapp && <span style={{ marginTop: s(6, 8, 10), fontSize: s(30, 34, 42), fontWeight: 900 }}>WhatsApp {d.whatsapp}</span>}
        <span style={{ marginTop: 2, fontSize: s(23, 26, 31), fontWeight: 800 }}>{d.liga}</span>
      </div>
    </div>
  );
  const pieLiga = <span style={{ fontSize: s(25, 29, 34), fontWeight: 800, textAlign: "center" }}>Elige tu lugar en {d.liga}</span>;

  let centro: React.ReactNode = null;
  let pie: React.ReactNode = null;

  if (d.diseno === "mapa" && d.extra) {
    // El mapa crece para llenar el centro: alto disponible menos título, subtítulo y píldoras.
    const zonas = d.extra.zonas.filter((z) => z.general || d.extra!.asientos.some((a) => a.zona === z.id));
    const filasPildoras = Math.ceil(zonas.length / (cuadrado ? 3 : 2));
    const disponible = h - margenArriba - altoLogos - margenAbajo - s(40, 46, 52) - separacion * 3 - s(70, 84, 100) - s(40, 46, 56) - filasPildoras * s(62, 70, 80);
    const mw = w - lado * 2, mh = Math.max(260, disponible);
    const m = puntosMapa(d.extra.asientos, d.extra.formas, mw, mh);
    // La caja mide lo que mide el mapa (sin espacio vacío abajo).
    const alto = m.puntos.length ? Math.min(mh, Math.max(...m.puntos.map((p) => p.y)) + m.radio + 28) : Math.round(mh * 0.4);
    const color = new Map(d.extra.zonas.map((z) => [z.id, z.color]));
    centro = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: separacion, width: w }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {titulo("Zonas y precios", s(60, 72, 88))}
          {subtitulo(`${d.fecha}${d.hora ? ` · ${d.hora}` : ""}`)}
        </div>
        <div style={{ position: "relative", width: mw, height: alto, display: "flex", borderRadius: 26, background: "rgba(11,9,16,0.55)" }}>
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
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: s(12, 14, 18), width: w - lado * 2 }}>
          {zonas.map((z) => (
            <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: `${s(9, 11, 14)}px ${s(18, 22, 26)}px`, borderRadius: 999, background: "rgba(11,9,16,0.75)", border: `3px solid ${z.color}` }}>
              <div style={{ width: s(22, 24, 28), height: s(22, 24, 28), borderRadius: 999, background: z.color }} />
              <span style={{ fontSize: s(25, 29, 35), fontWeight: 900 }}>{z.nombre}{z.general ? " (general)" : ""}</span>
              {d.extra!.mostrarPrecios && z.precio != null && <span style={{ fontSize: s(25, 29, 35), fontWeight: 900, color: acento }}>{precioZona(z)}</span>}
            </div>
          ))}
        </div>
      </div>
    );
    pie = pieLiga;
  } else if (d.diseno === "comprar" && d.pasos) {
    const dos = d.pasos.length > 1;
    centro = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: separacion, width: w }}>
        {titulo("¿Cómo aseguro\nmi lugar?", s(62, 76, 92))}
        <div style={{ display: "flex", flexDirection: "column", gap: s(16, 24, 34), width: w - lado * 2 }}>
          {d.pasos.map((o, i) => (
            <div key={o.titulo} style={{ display: "flex", flexDirection: "column", padding: `${s(20, 28, 38)}px ${s(24, 30, 36)}px`, borderRadius: 28, background: "rgba(11,9,16,0.75)", border: `3px solid ${acento}` }}>
              <span style={{ fontSize: s(22, 26, 31), fontWeight: 900, letterSpacing: 5, color: acento }}>{dos ? `OPCIÓN ${i + 1} · ` : ""}{o.titulo.toUpperCase()}</span>
              {o.pasos.map((p, k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: s(14, 18, 22), marginTop: s(10, 16, 22) }}>
                  <div style={{ width: s(40, 48, 58), height: s(40, 48, 58), borderRadius: 999, background: acento, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: s(22, 27, 32), fontWeight: 900, color: "#0b0910" }}>{k + 1}</span>
                  </div>
                  <span style={{ fontSize: s(26, 31, 38), fontWeight: 800 }}>{p}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
    pie = pieInfo;
  } else if (d.diseno === "calendario" && d.calendario) {
    centro = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: separacion, width: w }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {titulo("Funciones", s(76, 92, 110))}
          {d.lugar && subtitulo(d.lugar)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: w - lado * 2 - 20, borderRadius: 28, background: "rgba(11,9,16,0.75)", padding: `${s(8, 14, 20)}px ${s(28, 34, 40)}px` }}>
          {d.calendario.renglones.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${s(12, 20, 28)}px 0`, borderBottom: i < d.calendario!.renglones.length - 1 ? "2px solid rgba(255,255,255,0.15)" : "none" }}>
              <span style={{ fontSize: s(31, 37, 44), fontWeight: 900 }}>{r.fecha}</span>
              <span style={{ fontSize: s(31, 37, 44), fontWeight: 900, color: acento }}>{r.hora}</span>
            </div>
          ))}
          {d.calendario.renglones.length === 0 && <span style={{ padding: 24, fontSize: 36, fontWeight: 800 }}>Fechas por anunciar</span>}
        </div>
        {d.calendario.mas > 0 && <span style={{ fontSize: s(24, 28, 34), fontWeight: 800 }}>y {d.calendario.mas} {d.calendario.mas === 1 ? "fecha más" : "fechas más"}</span>}
      </div>
    );
    pie = pieInfo;
  } else if (d.diseno === "preparate" && d.preparate) {
    // Título y fecha; las tres horas (la función resaltada); el lugar con QR a Google Maps; tres recordatorios.
    const ancho = w - lado * 2;
    const gap = s(14, 18, 22);
    const tile = (ancho - gap * 2) / 3;
    const qrMapa = s(210, 240, 270);
    centro = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: s(22, 32, 46), width: w }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {titulo("Prepárate para\ntu función", s(58, 70, 86))}
          {subtitulo(d.fecha)}
        </div>
        <div style={{ display: "flex", gap, width: ancho }}>
          {d.preparate.horas.map((x, i) => (
            <div key={x.etiqueta} style={{ width: tile, display: "flex", flexDirection: "column", alignItems: "center", padding: `${s(16, 22, 30)}px 0`, borderRadius: 26,
              background: i === 1 ? acento : "rgba(11,9,16,0.75)", color: i === 1 ? "#0b0910" : "#ffffff", border: i === 1 ? "none" : "2px solid rgba(255,255,255,0.18)" }}>
              <span style={{ fontSize: s(20, 23, 28), fontWeight: 900, letterSpacing: 4, color: i === 1 ? "#0b0910" : acento }}>{x.etiqueta.toUpperCase()}</span>
              <span style={{ marginTop: s(4, 8, 10), fontSize: s(40, 46, 50), fontWeight: 900 }}>{x.hora}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: s(20, 26, 32), width: ancho, padding: `${s(18, 24, 32)}px ${s(24, 30, 36)}px`, borderRadius: 28, background: "rgba(11,9,16,0.75)" }}>
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexShrink: 1 }}>
            <span style={{ fontSize: s(20, 23, 28), fontWeight: 900, letterSpacing: 4, color: acento }}>LUGAR</span>
            <span style={{ marginTop: s(4, 8, 10), fontSize: s(34, 40, 48), fontWeight: 900 }}>{d.lugar ?? "Por anunciar"}</span>
            {d.preparate.direccion && <span style={{ marginTop: s(4, 6, 8), fontSize: s(23, 27, 32), fontWeight: 700, opacity: 0.85 }}>{d.preparate.direccion}</span>}
          </div>
          {qr && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <img src={qr} width={qrMapa} height={qrMapa} style={{ width: qrMapa, height: qrMapa, borderRadius: 14 }} alt="" />
              <span style={{ marginTop: 8, fontSize: s(17, 19, 23), fontWeight: 900, letterSpacing: 3 }}>CÓMO LLEGAR</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: s(10, 14, 20), width: ancho }}>
          {d.preparate.recordatorios.map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: s(14, 16, 20) }}>
              <div style={{ width: s(14, 16, 20), height: s(14, 16, 20), borderRadius: 999, background: acento, flexShrink: 0 }} />
              <span style={{ fontSize: s(24, 28, 34), fontWeight: 800 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    );
    pie = <span style={{ fontSize: s(24, 28, 34), fontWeight: 800, textAlign: "center" }}>{d.whatsapp ? `¿Dudas? WhatsApp ${d.whatsapp}` : `Tus boletos en ${d.liga}`}</span>;
  } else if (d.diseno === "incluye" && d.extra) {
    // Primero las zonas con beneficios (VIP arriba) con todos sus beneficios; las demás juntas en un renglón.
    const { conBeneficios, resto } = zonasIncluye(d.extra.zonas, s(3, 4, 5));
    const precios = d.extra.mostrarPrecios;
    const renglones = conBeneficios.reduce((n, z) => n + 1 + z.beneficios.length, 0) + (resto.length ? 2 : 0);
    // Con muchos renglones la letra baja un poco para que todo quepa.
    const k = renglones > s(9, 12, 16) ? 0.82 : renglones > s(7, 9, 12) ? 0.9 : 1;
    centro = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: separacion, width: w }}>
        {titulo(precios ? "Precios y lo que\nincluye tu lugar" : "¿Qué incluye\ntu lugar?", s(56, 68, 84))}
        <div style={{ display: "flex", flexDirection: "column", gap: s(14, 20, 26), width: w - lado * 2 }}>
          {conBeneficios.map((z) => (
            <div key={z.id} style={{ display: "flex", flexDirection: "column", padding: `${s(16, 22, 30)}px ${s(24, 30, 36)}px`, borderRadius: 26, background: "rgba(11,9,16,0.75)", borderLeft: `14px solid ${z.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: s(36, 42, 50) * k, fontWeight: 900 }}>{z.nombre.toUpperCase()}</span>
                {precios && z.precio != null && <span style={{ fontSize: s(34, 40, 48) * k, fontWeight: 900, color: acento }}>{precioZona(z)}</span>}
              </div>
              {z.beneficios.map((b) => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 14, marginTop: s(6, 9, 12) * k }}>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: acento, flexShrink: 0 }} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: s(25, 29, 35) * k, fontWeight: 700 }}>{textoBeneficio(b)}</span>
                    {/* Nota del beneficio ("uno por compra, no por boleto"). */}
                    {b.detalle && <span style={{ fontSize: s(19, 22, 26) * k, fontWeight: 600, fontStyle: "italic", opacity: 0.8 }}>{b.detalle}</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {resto.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", padding: `${s(14, 20, 26)}px ${s(24, 30, 36)}px`, borderRadius: 26, background: "rgba(11,9,16,0.6)" }}>
              <span style={{ fontSize: s(20, 23, 28), fontWeight: 900, letterSpacing: 4, color: acento }}>{conBeneficios.length ? "TAMBIÉN" : "ZONAS"}</span>
              <div style={{ display: "flex", flexWrap: "wrap", columnGap: s(22, 26, 30), rowGap: s(4, 6, 8), marginTop: s(6, 8, 10) }}>
                {resto.map((z) => (
                  <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: s(16, 18, 22), height: s(16, 18, 22), borderRadius: 999, background: z.color }} />
                    <span style={{ fontSize: s(25, 29, 35) * k, fontWeight: 800 }}>{z.nombre}</span>
                    {precios && z.precio != null && <span style={{ fontSize: s(25, 29, 35) * k, fontWeight: 900, color: acento }}>{precioZona(z)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.extra.zonas.length === 0 && <span style={{ fontSize: 34, fontWeight: 800, textAlign: "center" }}>Zonas por anunciar</span>}
        </div>
      </div>
    );
    pie = pieLiga;
  }

  // Invitación: tres bloques repartidos en todo el alto (invita / logo / funciones), el pie con QR hasta abajo.
  const funcionesInv = invitacion ? (d.dias?.dias ?? []).map((x) => ({ fecha: x.fecha, hora: x.horas })) : [];
  const masInv = invitacion ? d.dias?.mas ?? 0 : 0;
  const invitacionCuerpo = invitacion && (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "space-between", padding: `${margenArriba + s(104, 132, 160)}px ${lado}px ${margenAbajo}px` }}>
      {/* El logo de DARF ya está arriba: aquí solo "te invita a" (sin logo, el nombre en texto). */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {!marca && <span style={{ fontSize: s(30, 36, 44), fontWeight: 800, letterSpacing: 10, color: acento }}>DARF PRODUCTIONS</span>}
        <span style={{ marginTop: marca ? 0 : s(6, 10, 14), fontSize: s(48, 58, 70), fontWeight: 900 }}>TE INVITA A</span>
      </div>
      {logoObra ? <img src={logoObra} style={{ maxWidth: s(860, 940, 960), maxHeight: funcionesInv.length > 1 ? s(290, 400, 440) : s(360, 470, 500), objectFit: "contain" }} alt="" />
        : <span style={{ fontSize: 110, fontWeight: 900 }}>{d.obra.toUpperCase()}</span>}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {funcionesInv.length > 1 ? (
          // Todas las funciones: una por renglón, la fecha en blanco y la hora en el color de la obra.
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: s(4, 8, 12) }}>
            {funcionesInv.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: s(12, 14, 16) }}>
                <span style={{ fontSize: s(32, 38, 46), fontWeight: 900 }}>{r.fecha}</span>
                <span style={{ fontSize: s(30, 36, 44), fontWeight: 900, color: acento }}>{r.hora}</span>
              </div>
            ))}
            {masInv > 0 && <span style={{ fontSize: s(24, 28, 34), fontWeight: 800, opacity: 0.85 }}>y {masInv} {masInv === 1 ? "fecha más" : "fechas más"}</span>}
          </div>
        ) : funcionesInv.length === 1 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: s(42, 52, 62), fontWeight: 900, textAlign: "center" }}>{funcionesInv[0].fecha}</span>
            <span style={{ marginTop: s(4, 8, 12), fontSize: s(38, 46, 56), fontWeight: 900, color: acento }}>{funcionesInv[0].hora}</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: s(42, 52, 62), fontWeight: 900, textAlign: "center" }}>{d.fecha}</span>
            {d.hora && <span style={{ marginTop: s(4, 8, 12), fontSize: s(38, 46, 56), fontWeight: 900, color: acento }}>{d.hora}</span>}
          </div>
        )}
        {d.lugar && <span style={{ marginTop: s(10, 14, 20), fontSize: s(28, 34, 40), fontWeight: 800, opacity: 0.9, textAlign: "center" }}>{d.lugar}</span>}
      </div>
      {pieInfo}
    </div>
  );

  const res = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", position: "relative", background: d.colores.fondo, color: "#ffffff", fontFamily: "Montserrat" }}>
        {fondo
          ? <img src={fondo} width={w} height={h} style={{ position: "absolute", left: 0, top: 0, width: w, height: h, objectFit: "cover" }} alt="" />
          : <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex", backgroundImage: `radial-gradient(circle at 50% 30%, ${acento}66 0%, ${d.colores.fondo} 70%)` }} />}
        <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex",
          backgroundImage: d.diseno === "invitacion-ambiente"
            // El ambiente suele ser más claro y con más detalle que el póster alterno: un poco más oscuro.
            ? "linear-gradient(180deg, rgba(11,9,16,0.78) 0%, rgba(11,9,16,0.58) 30%, rgba(11,9,16,0.85) 68%, rgba(11,9,16,0.96) 100%)"
            : invitacion
            ? "linear-gradient(180deg, rgba(11,9,16,0.7) 0%, rgba(11,9,16,0.45) 30%, rgba(11,9,16,0.8) 70%, rgba(11,9,16,0.95) 100%)"
            : "linear-gradient(180deg, rgba(11,9,16,0.8) 0%, rgba(11,9,16,0.72) 30%, rgba(11,9,16,0.88) 100%)" }} />
        {/* Franja de arriba: logos. */}
        <div style={{ position: "absolute", left: 0, top: margenArriba, width: w, height: altoLogos, display: "flex", alignItems: "center", justifyContent: invitacion ? "center" : "space-between", padding: `0 ${lado}px` }}>
          {marca ? <img src={marca} style={{ width: s(260, 300, 340), objectFit: "contain" }} alt="" /> : <span style={{ fontSize: 40, fontWeight: 900 }}>DARF</span>}
          {!invitacion && (logoObra ? <img src={logoObra} style={{ maxWidth: s(320, 360, 400), maxHeight: altoLogos, objectFit: "contain" }} alt="" />
            : <span style={{ fontSize: 40, fontWeight: 900 }}>{d.obra.toUpperCase()}</span>)}
        </div>
        {invitacion ? invitacionCuerpo : (
          // Franjas del centro (toma el espacio que sobra y se centra) y de abajo (pie con margen fijo).
          <div style={{ position: "absolute", left: 0, top: margenArriba + altoLogos, width: w, height: h - margenArriba - altoLogos, display: "flex", flexDirection: "column", alignItems: "center", padding: `${separacion}px 0 ${margenAbajo}px` }}>
            <div style={{ flexGrow: 1, width: w, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{centro}</div>
            {pie && <div style={{ marginTop: separacion, display: "flex", justifyContent: "center" }}>{pie}</div>}
          </div>
        )}
      </div>
    ),
    { width: w, height: h, fonts: await cargarFuentes() },
  );
  return Buffer.from(await res.arrayBuffer());
}
