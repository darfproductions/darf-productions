import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { nivelDe } from "@/lib/lealtad-rules";

// Medalla DARF Loyalty (0103), solo servidor: la piedra del nivel, el aro con "DARF LOYALTY · NIVEL"
// y al centro el número exacto de producciones en Montserrat (la letra del logo). Es un PNG porque el
// número cambia con cada obra; la misma imagen sirve para la web, el PDF y Wallet.

let fuentes: Promise<{ name: string; data: Buffer; weight: 800 | 900 }[]> | null = null;
function cargarFuentes() {
  fuentes ??= Promise.all([
    readFile(path.join(process.cwd(), "assets/fuentes/Montserrat-Black.ttf")).then((data) => ({ name: "Montserrat", data, weight: 900 as const })),
    readFile(path.join(process.cwd(), "assets/fuentes/Montserrat-ExtraBold.ttf")).then((data) => ({ name: "Montserrat", data, weight: 800 as const })),
  ]).catch((e) => { fuentes = null; throw e; });
  return fuentes;
}

/** Destellos del diamante negro (Hall of Fame): estrellas de cuatro puntas. */
const DESTELLOS = [{ x: 0.3, y: 0.3, s: 0.16 }, { x: 0.71, y: 0.36, s: 0.09 }, { x: 0.36, y: 0.74, s: 0.07 }, { x: 0.76, y: 0.7, s: 0.12 }];

/** PNG cuadrado de la medalla para `n` producciones (null antes del primer nivel). */
export async function medallaPng(n: number, lado = 512): Promise<Buffer | null> {
  const nivel = nivelDe(n);
  if (!nivel) return null;
  const [brillo, cuerpo, sombra] = nivel.colores;
  const hof = nivel.min === 50;
  const c = lado / 2;
  const rAro = lado * 0.43; // centro de las letras
  const rPiedra = lado * 0.345;
  const texto = `DARF LOYALTY · ${nivel.nombre.toUpperCase()} · `.repeat(2);
  const letras = [...texto];
  const tam = Math.min(lado * 0.066, (2 * Math.PI * rAro) / (letras.length * 0.8));
  const numero = String(n);
  const tamNum = lado * (numero.length >= 3 ? 0.27 : 0.36);
  const res = new ImageResponse(
    (
      <div style={{ width: lado, height: lado, display: "flex", position: "relative" }}>
        {/* Aro: metal oscuro del color del nivel, con filo claro. */}
        <div style={{ position: "absolute", left: 0, top: 0, width: lado, height: lado, borderRadius: lado, display: "flex",
          background: `radial-gradient(circle at 30% 25%, ${cuerpo}, ${nivel.aro} 70%)`, border: `${lado * 0.012}px solid ${brillo}` }} />
        {letras.map((l, i) => (
          <div key={i} style={{ position: "absolute", left: c - tam / 2, top: c - rAro - tam * 0.62, width: tam, height: 2 * rAro + tam * 1.24, display: "flex",
            justifyContent: "center", transform: `rotate(${(360 / letras.length) * i}deg)`, transformOrigin: "50% 50%" }}>
            <span style={{ fontFamily: "Montserrat", fontWeight: 800, fontSize: tam, lineHeight: 1, color: nivel.texto }}>{l}</span>
          </div>
        ))}
        {/* La piedra. */}
        <div style={{ position: "absolute", left: c - rPiedra, top: c - rPiedra, width: 2 * rPiedra, height: 2 * rPiedra, borderRadius: lado, display: "flex",
          background: `radial-gradient(circle at 32% 28%, ${brillo} 0%, ${cuerpo} 45%, ${sombra} 100%)`,
          border: `${lado * 0.014}px solid ${brillo}`, boxShadow: `0 0 ${lado * 0.03}px rgba(0,0,0,0.5)` }} />
        {/* Facetas: un brillo diagonal. */}
        <div style={{ position: "absolute", left: c - rPiedra * 0.78, top: c - rPiedra * 0.86, width: rPiedra * 0.9, height: rPiedra * 0.5, borderRadius: lado, display: "flex",
          background: "linear-gradient(160deg, rgba(255,255,255,0.55), rgba(255,255,255,0))", transform: "rotate(-28deg)" }} />
        {hof && DESTELLOS.map((d, i) => (
          <svg key={i} width={lado * d.s} height={lado * d.s} viewBox="0 0 100 100"
            style={{ position: "absolute", left: lado * d.x - (lado * d.s) / 2, top: lado * d.y - (lado * d.s) / 2 }}>
            <path d="M50 0 C54 40 60 46 100 50 C60 54 54 60 50 100 C46 60 40 54 0 50 C40 46 46 40 50 0 Z" fill="#ffffff" />
          </svg>
        ))}
        <div style={{ position: "absolute", left: 0, top: 0, width: lado, height: lado, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "Montserrat", fontWeight: 900, fontSize: tamNum, lineHeight: 1, letterSpacing: -tamNum * 0.04, color: nivel.texto,
            textShadow: `0 ${lado * 0.008}px ${lado * 0.02}px rgba(0,0,0,0.55)`, marginTop: -tamNum * 0.06 }}>{numero}</span>
        </div>
      </div>
    ),
    { width: lado, height: lado, fonts: await cargarFuentes() },
  );
  return Buffer.from(await res.arrayBuffer());
}
