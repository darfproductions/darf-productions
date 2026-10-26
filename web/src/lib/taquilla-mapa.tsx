import { ImageResponse } from "next/og";
import { cargarFuentes } from "@/lib/medalla";
import { precioCorto } from "@/lib/difusion-extra-rules";
import { textoQuedan, tintaSobre, type Plano } from "@/lib/taquilla-mapa-rules";

// Mapa de la taquilla en PNG (2026-10-26): para mandarlo por WhatsApp con lo que queda libre en este momento.
// Fondo liso para que se lean los números; los ocupados en gris con una raya.

export type DatosMapaTaquilla = {
  obra: string;
  funcion: string; // "Sábado 23 de enero, 7:00 p.m."
  lugar: string | null;
  al: string; // "10:42 a.m."
  plano: Plano;
  ocupados: Set<string>;
  zonas: { id: string; nombre: string; color: string; precio: number }[];
  generales: { nombre: string; libres: number; precio: number }[];
};

const FONDO = "#0e0c14";
const OCUPADO = "#2b2833";

export async function mapaTaquillaPng(d: DatosMapaTaquilla): Promise<Buffer> {
  const { plano } = d;
  const r = plano.radio;
  const colorDe = new Map(d.zonas.map((z) => [z.id, z.color]));
  const conZona = plano.puntos.filter((p) => p.zona && colorDe.has(p.zona));
  const libres = conZona.filter((p) => !d.ocupados.has(p.id)).length;
  const ancho = Math.max(1400, plano.ancho + 120);
  const cabeza = 230;
  const filasLeyenda = Math.ceil((d.zonas.length + 1) / 3) + (d.generales.length ? Math.ceil(d.generales.length / 2) : 0);
  const pie = 90 + filasLeyenda * 70;
  const alto = cabeza + plano.alto + pie;
  const ox = (ancho - plano.ancho) / 2, oy = cabeza;
  const tam = Math.round(r * 0.95);

  const res = new ImageResponse(
    (
      <div style={{ width: ancho, height: alto, display: "flex", flexDirection: "column", position: "relative", background: FONDO, color: "#ffffff", fontFamily: "Montserrat" }}>
        {/* Encabezado */}
        <div style={{ display: "flex", flexDirection: "column", padding: "48px 60px 0", height: cabeza }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 6, color: "#d7bb5f" }}>LUGARES DISPONIBLES · {d.obra.toUpperCase()}</span>
              <span style={{ marginTop: 10, fontSize: 52, fontWeight: 900 }}>{d.funcion}</span>
              {d.lugar && <span style={{ marginTop: 6, fontSize: 26, fontWeight: 800, opacity: 0.75 }}>{d.lugar}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: 40, fontWeight: 900, color: libres ? "#7ee2b8" : "#ff8fa3" }}>{textoQuedan(libres, conZona.length)}</span>
              <span style={{ marginTop: 6, fontSize: 22, fontWeight: 800, opacity: 0.7 }}>Actualizado a las {d.al}</span>
            </div>
          </div>
        </div>
        {/* Escenario */}
        {plano.escenarioArriba && (
          <div style={{ position: "absolute", left: ox + plano.ancho * 0.2, top: oy + 6, width: plano.ancho * 0.6, height: r * 2 + 16, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 16, background: "#d7bb5f", color: "#1a1030", fontSize: 26, fontWeight: 900, letterSpacing: 10 }}>ESCENARIO</div>
        )}
        {plano.formas.map((f, i) => (
          <div key={`f${i}`} style={{ position: "absolute", left: ox + f.x - f.ancho / 2, top: oy + f.y - f.alto / 2, width: f.ancho, height: f.alto, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 14, background: "rgba(215,187,95,0.18)", border: "3px solid #d7bb5f", color: "#d7bb5f", fontSize: 24, fontWeight: 900, transform: `rotate(${f.rot}deg)` }}>{f.etiqueta}</div>
        ))}
        {/* Letra de cada fila, a los dos lados */}
        {plano.filas.flatMap((f) => [
          <span key={`i${f.fila}`} style={{ position: "absolute", left: ox + f.izq - 44, top: oy + f.y - 18, width: 40, textAlign: "right", fontSize: 28, fontWeight: 900, color: "#d7bb5f" }}>{f.fila}</span>,
          <span key={`d${f.fila}`} style={{ position: "absolute", left: ox + f.der + 4, top: oy + f.y - 18, width: 40, fontSize: 28, fontWeight: 900, color: "#d7bb5f" }}>{f.fila}</span>,
        ])}
        {/* Asientos */}
        {plano.puntos.map((p) => {
          const color = p.zona ? colorDe.get(p.zona) : undefined;
          const ocupado = !color || d.ocupados.has(p.id);
          return (
            <div key={p.id} style={{ position: "absolute", left: ox + p.x - r, top: oy + p.y - r, width: r * 2, height: r * 2, borderRadius: r, display: "flex", alignItems: "center", justifyContent: "center",
              background: ocupado ? OCUPADO : color, color: ocupado ? "#5d5868" : tintaSobre(color!), fontSize: tam, fontWeight: 900 }}>
              {p.numero ?? ""}
              {ocupado && <div style={{ position: "absolute", left: r * 0.25, top: r - 2, width: r * 1.5, height: 4, borderRadius: 2, background: "#77727f", transform: "rotate(-45deg)" }} />}
            </div>
          );
        })}
        {/* Leyenda */}
        <div style={{ position: "absolute", left: 60, right: 60, top: cabeza + plano.alto + 30, display: "flex", flexWrap: "wrap", gap: 18 }}>
          {d.zonas.map((z) => (
            <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px", borderRadius: 40, background: "rgba(255,255,255,0.07)" }}>
              <div style={{ width: 30, height: 30, borderRadius: 15, background: z.color }} />
              <span style={{ fontSize: 28, fontWeight: 800 }}>{z.nombre}</span>
              {z.precio > 0 && <span style={{ fontSize: 28, fontWeight: 900, color: "#d7bb5f" }}>{precioCorto(z.precio)}</span>}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px", borderRadius: 40, background: "rgba(255,255,255,0.07)" }}>
            <div style={{ width: 30, height: 30, borderRadius: 15, background: OCUPADO, border: "2px solid #5d5868" }} />
            <span style={{ fontSize: 28, fontWeight: 800 }}>Ocupado</span>
          </div>
          {d.generales.map((g) => (
            <div key={g.nombre} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px", borderRadius: 40, background: "rgba(255,255,255,0.07)" }}>
              <span style={{ fontSize: 28, fontWeight: 800 }}>{g.nombre} (sin numerar):</span>
              <span style={{ fontSize: 28, fontWeight: 900, color: g.libres ? "#7ee2b8" : "#ff8fa3" }}>{g.libres ? `quedan ${g.libres}` : "agotado"}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: ancho, height: alto, fonts: await cargarFuentes() },
  );
  return Buffer.from(await res.arrayBuffer());
}
