import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Imagen al compartir cualquier página que no tenga la suya (WhatsApp, redes): el logo de DARF y el lema
// "Jóvenes para jóvenes" sobre la sala oscura con la luz de la marca (Diego 2026-10-14).
export const alt = "DARF Productions · Jóvenes para jóvenes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const svg = async (archivo: string) =>
  `data:image/svg+xml;base64,${(await readFile(join(process.cwd(), "public/marca", archivo))).toString("base64")}`;

export default async function Image() {
  const [logo, lema] = await Promise.all([svg("darf-principal.svg"), svg("lema-blanco.svg")]);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 56,
          background: "radial-gradient(circle at 18% 12%, rgba(52,15,235,0.55), transparent 55%), radial-gradient(circle at 85% 95%, rgba(210,1,34,0.45), transparent 55%), #0b0910",
        }}
      >
        <img src={logo} width={560} height={201} alt="" />
        <div style={{ width: 520, height: 4, borderRadius: 2, background: "linear-gradient(90deg, #340feb, #830886 55%, #d20122)" }} />
        <img src={lema} width={760} height={54} alt="" />
      </div>
    ),
    size,
  );
}
