import type { Uso } from "@/lib/poster";
import { esClaro } from "~/lib/tema";
import { imagen, poster, type Obra } from "~/lib/datos";

// Arte de una obra para tarjetas. Misma regla que la web (web/src/components/PosterArt.tsx → ArtFill): imagen de fondo
// (póster oficial limpio o ambiente), un velo con el color de fondo de la obra y el logo dentro de una caja de tamaño
// fijo, para que todas las obras se vean del mismo peso sin importar la forma del logo. Rellena su contenedor.

export function ArteObra({ obra, uso }: { obra: Obra; uso: Uso }) {
  const fondo = obra.color_fondo ?? "#0b0b0b";
  const foto = poster(obra, uso);
  const logo = imagen(obra.logo_path);
  return (
    <>
      {foto && <img src={foto} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at center, color-mix(in srgb, ${fondo} 30%, transparent), color-mix(in srgb, ${fondo} 65%, transparent))` }} />
      {logo ? (
        <img src={logo} alt={obra.nombre} loading="lazy" style={{
          position: "absolute", left: "14%", right: "14%", top: "20%", bottom: "20%", width: "72%", height: "60%", objectFit: "contain",
          filter: esClaro(fondo) ? undefined : "drop-shadow(0 6px 18px rgb(0 0 0 / 0.6))",
        }} />
      ) : (
        <span style={{ position: "absolute", left: 16, right: 16, bottom: 16, fontSize: 22, fontWeight: 900, textTransform: "uppercase", color: obra.color_texto ?? "#ffffff" }}>{obra.nombre}</span>
      )}
    </>
  );
}
