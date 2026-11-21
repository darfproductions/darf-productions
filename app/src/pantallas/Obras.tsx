import { Link } from "react-router";
import { agrupar, ETIQUETA_ESTADO, type EstadoPublico } from "@/lib/home-rules";
import { imagen, leerCartelera, type ObraPublica } from "~/lib/datos";
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

function TarjetaObra({ o }: { o: ObraPublica }) {
  const fondo = o.color_fondo ?? "#0b0b0b";
  const ambiente = imagen(o.poster_16x9_path ?? o.poster_4x3_path ?? o.ambiente_path);
  const logo = imagen(o.logo_path);
  return (
    <Link to={`/obras/${o.id}`} style={{ position: "relative", height: 180, borderRadius: 24, overflow: "hidden", display: "block", background: fondo, color: "#ffffff", boxShadow: "var(--sombra-tarjeta, none)" }}>
      {ambiente && <img src={ambiente} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      {logo && !o.poster_16x9_path && !o.poster_4x3_path && <img src={logo} alt="" style={{ position: "absolute", left: "50%", top: 18, transform: "translateX(-50%)", maxWidth: "62%", maxHeight: 92, objectFit: "contain" }} />}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(11,11,11,0) 40%, rgba(11,11,11,0.92) 100%)" }} />
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase" }}>{o.nombre}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#d6d6d6" }}>{[o.temporada, o.venue].filter(Boolean).join(" · ")}</span>
        </div>
        <span className="pildora" style={{ flexShrink: 0, background: o.color_acento ?? "#333333", color: textoSobre(o.color_acento ?? "#333333") }}>{ETIQUETA_ESTADO[o.estadoPublico]}</span>
      </div>
    </Link>
  );
}
