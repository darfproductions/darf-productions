/* eslint-disable @next/next/no-img-element -- dentro de ImageResponse (satori), no es una página */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { nivelDe, PROGRAMA, type NivelLealtad, type Programa } from "@/lib/lealtad-rules";

// Medalla DARF Loyalty (0103), solo servidor, con el trazo de los sellos del Club y de Casa DARF: el aro con
// "DARF LOYALTY · NIVEL" (equipo) o "DARF FAN ZONE · NIVEL" (fans, 0104) y al centro el número exacto de producciones en Montserrat (la letra del logo), en el
// color de la piedra del nivel. Es un
// PNG porque el número cambia con cada obra; la misma imagen sirve para la web, el PDF y Wallet.

let fuentes: Promise<{ name: string; data: Buffer; weight: 800 | 900 }[]> | null = null;
function cargarFuentes() {
  fuentes ??= Promise.all([
    readFile(path.join(process.cwd(), "assets/fuentes/Montserrat-Black.ttf")).then((data) => ({ name: "Montserrat", data, weight: 900 as const })),
    readFile(path.join(process.cwd(), "assets/fuentes/Montserrat-ExtraBold.ttf")).then((data) => ({ name: "Montserrat", data, weight: 800 as const })),
  ]).catch((e) => { fuentes = null; throw e; });
  return fuentes;
}

/** Destello de cuatro puntas (Hall of Fame). */
const ESTRELLA = "M50 0 C53 38 62 47 100 50 C62 53 53 62 50 100 C47 62 38 53 0 50 C38 47 47 38 50 0 Z";

function letrasDelAro(aro: string, nivel: NivelLealtad, lado: number, rAro: number, color: string) {
  const frase = `${aro} · ${nivel.nombre.toUpperCase()} · `;
  const letras = [...frase.repeat(frase.length > 30 ? 1 : 2)];
  const tam = Math.min(lado * 0.056, (2 * Math.PI * rAro) / (letras.length * 0.86));
  const c = lado / 2;
  return letras.map((l, i) => (
    <div key={i} style={{ position: "absolute", left: c - tam / 2, top: c - rAro - tam * 0.55, width: tam, height: 2 * rAro + tam * 1.1, display: "flex",
      justifyContent: "center", transform: `rotate(${(360 / letras.length) * i}deg)` }}>
      <span style={{ fontFamily: "Montserrat", fontWeight: 800, fontSize: tam, lineHeight: 1, color }}>{l}</span>
    </div>
  ));
}

/** PNG cuadrado de la medalla para `n` producciones (null antes del primer nivel). */
export async function medallaPng(n: number, lado = 512, prog: Programa = "equipo"): Promise<Buffer | null> {
  const nivel = nivelDe(n, prog);
  if (!nivel) return null;
  const hof = nivel.min === 50;
  const c = lado / 2;
  const [claro, medio] = nivel.linea;
  const numero = String(n);
  const tamNum = lado * (numero.length >= 3 ? 0.2 : 0.26);
  const degr = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${claro}"/><stop offset="1" stop-color="${medio}"/></linearGradient>`;
  const destellos = hof ? [{ x: 0.66, y: 0.33, s: 0.07 }, { x: 0.35, y: 0.66, s: 0.045 }] : [];
  const svg = (contenido: string) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}"><defs>${degr}</defs>${contenido}</svg>`).toString("base64")}`;

  // Como los sellos del Club y de Casa DARF: dos círculos finos y el texto en el color de la piedra.
  const fondo = svg(`<circle cx="${c}" cy="${c}" r="${lado * 0.475}" fill="none" stroke="url(#g)" stroke-width="${lado * 0.007}"/>`
    + `<circle cx="${c}" cy="${c}" r="${lado * 0.335}" fill="none" stroke="url(#g)" stroke-width="${lado * 0.0045}"/>`);

  const res = new ImageResponse(
    (
      <div style={{ width: lado, height: lado, display: "flex", position: "relative" }}>
        <img src={fondo} width={lado} height={lado} style={{ position: "absolute", left: 0, top: 0 }} alt="" />
        {letrasDelAro(PROGRAMA[prog].aro, nivel, lado, lado * 0.405, medio)}
        {destellos.map((d, i) => (
          <svg key={i} width={lado * d.s} height={lado * d.s} viewBox="0 0 100 100"
            style={{ position: "absolute", left: lado * d.x - (lado * d.s) / 2, top: lado * d.y - (lado * d.s) / 2 }}>
            <path d={ESTRELLA} fill="#ffffff" />
          </svg>
        ))}
        <div style={{ position: "absolute", left: 0, top: 0, width: lado, height: lado, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "Montserrat", fontWeight: 900, fontSize: tamNum, lineHeight: 1, letterSpacing: -tamNum * 0.03, marginTop: -tamNum * 0.06,
            backgroundImage: `linear-gradient(135deg, ${claro}, ${medio})`, backgroundClip: "text", color: "transparent" }}>{numero}</span>
        </div>
      </div>
    ),
    { width: lado, height: lado, fonts: await cargarFuentes() },
  );
  return Buffer.from(await res.arrayBuffer());
}
