import { ImageResponse } from "next/og";

// Imagen al compartir cualquier página que no tenga la suya: la luz de DARF.
export const alt = "DARF Productions · Teatro musical";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, gap: 24, color: "#f4f1f8", background: "linear-gradient(120deg, #340feb 0%, #830886 55%, #d20122 100%)" }}>
        <span style={{ fontSize: 120, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>DARF</span>
        <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: 12 }}>PRODUCTIONS</span>
        <span style={{ fontSize: 32, marginTop: 24 }}>Teatro musical en Querétaro · Funciones, audiciones y Club Fan</span>
      </div>
    ),
    size,
  );
}
