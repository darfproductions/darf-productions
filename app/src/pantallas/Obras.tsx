import { Link } from "react-router";
import { agrupar, ETIQUETA_ESTADO, type EstadoPublico } from "@/lib/home-rules";
import { ArteObra } from "~/componentes/ArteObra";
import { Icono } from "~/componentes/Icono";
import { leerCartelera, type ObraPublica } from "~/lib/datos";
import { textoSobre } from "~/lib/tema";
import { useCarga } from "~/lib/usar";

const SECCIONES: { estado: EstadoPublico; titulo: string }[] = [
  { estado: "cartelera", titulo: "En cartelera" },
  { estado: "proximamente", titulo: "Próximamente" },
  { estado: "archivo", titulo: "Archivo" },
];

export function Obras() {
  const { datos, error, cargando } = useCarga(leerCartelera, []);
  const grupos = datos ? agrupar(datos.obras) : null;

  return (
    <main className="pantalla">
      <div className="contenido">
        <h1 className="titulo-grande" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>Obras</h1>
        <p className="suave" style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.6 }}>Cada producción es un capítulo en la historia de DARF.</p>

        {cargando && [0, 1, 2].map((i) => <div key={i} className="esqueleto" style={{ marginTop: 14, height: 180, borderRadius: 24 }} />)}
        {error && <p className="aviso error" style={{ marginTop: 16 }}>No pudimos cargar las obras. Revisa tu conexión e intenta de nuevo.</p>}

        {grupos && SECCIONES.filter((s) => grupos[s.estado].length).map((s) => (
          <section key={s.estado} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 className="etiqueta" style={{ margin: 0 }}>{s.titulo}</h2>
            {grupos[s.estado].map((o) => <TarjetaObra key={o.id} o={o} />)}
          </section>
        ))}
      </div>
    </main>
  );
}

// Como la tarjeta de la web (ObraHorizontal): arte arriba (fondo + logo en caja fija) y datos abajo.
function TarjetaObra({ o }: { o: ObraPublica }) {
  const acento = o.color_acento ?? "#333333";
  return (
    <Link to={`/obras/${o.id}`} className="tarjeta" style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 24 }}>
      <div style={{ position: "relative", aspectRatio: "16 / 10", background: o.color_fondo ?? "#0b0b0b" }}>
        <ArteObra obra={o} uso="destacada-celular" />
        <span className="pildora" style={{ position: "absolute", top: 12, left: 12, background: acento, color: textoSobre(acento) }}>{ETIQUETA_ESTADO[o.estadoPublico]}</span>
      </div>
      <div style={{ padding: "14px 16px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 900 }}>{o.nombre}</span>
          <span className="suave" style={{ fontSize: 13, fontWeight: 500 }}>{[o.temporada, o.venue].filter(Boolean).join(" · ") || "Detalles por anunciar"}</span>
        </div>
        <Icono nombre="derecha" tamano={20} color="var(--suave)" grosor={2} />
      </div>
    </Link>
  );
}
