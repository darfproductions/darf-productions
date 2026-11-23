import { Link } from "react-router";
import { ETIQUETA_ESTADO } from "@/lib/home-rules";
import { ArteObra } from "~/componentes/ArteObra";
import { Icono, type NombreIcono } from "~/componentes/Icono";
import { useApariencia } from "~/lib/apariencia";
import { leerCartelera, poster } from "~/lib/datos";
import { saludo } from "~/lib/formato";
import { textoSobre } from "~/lib/tema";
import { nombreDe, useSesion } from "~/lib/sesion";
import { abrirWeb, useCarga } from "~/lib/usar";

const ACCESOS: { texto: string; icono: NombreIcono; fondo: string; ir: { app: string } | { web: string } }[] = [
  { texto: "Mis boletos", icono: "boletos", fondo: "var(--degradado)", ir: { app: "/boletos" } },
  { texto: "Audiciones", icono: "microfono", fondo: "#7b2fbe", ir: { web: "/audiciones" } },
  { texto: "Zona Fans", icono: "estrella", fondo: "#a8892f", ir: { web: "/fan-zone" } },
];

export function Inicio() {
  const { modo, alternar } = useApariencia();
  const { sesion } = useSesion();
  const { datos, error, cargando } = useCarga(leerCartelera, []);
  const destacada = datos?.destacada?.production ?? null;
  const otras = (datos?.obras ?? []).filter((o) => o.id !== destacada?.id);
  const nombre = nombreDe(sesion);

  return (
    <main className="pantalla">
      <div className="brillo" />
      <div className="contenido">
        <header style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 52 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <span className="suave" style={{ fontSize: 13, fontWeight: 600 }}>{saludo()}</span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" }}>{nombre ? `Hola, ${nombre}` : "Hola"}</h1>
          </div>
          <button className="circulo" onClick={alternar} aria-label={modo === "dia" ? "Cambiar a modo noche" : "Cambiar a modo día"}>
            <Icono nombre={modo === "dia" ? "luna" : "sol"} tamano={20} />
          </button>
        </header>

        {new URLSearchParams(window.location.search).get("cuenta") === "eliminada" && (
          <p className="aviso" role="status" style={{ marginTop: 16 }}>Tu cuenta se eliminó. Gracias por haber sido parte de DARF.</p>
        )}
        {cargando && <div className="esqueleto" style={{ marginTop: 16, height: 280, borderRadius: 24 }} />}
        {error && <p className="aviso error" style={{ marginTop: 16 }}>No pudimos cargar la cartelera. Revisa tu conexión e intenta de nuevo.</p>}

        {destacada && (
          <Link to={`/obras/${destacada.id}`} style={{ marginTop: 16, position: "relative", height: 280, borderRadius: 24, overflow: "hidden", display: "block", color: "#ffffff", background: destacada.color_fondo ?? "#0c1830" }}>
            {poster(destacada, "destacada-celular") && <img src={poster(destacada, "destacada-celular")!} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 35%, ${destacada.color_fondo ?? "#000000"} 100%)` }} />
            <span className="pildora" style={{ position: "absolute", top: 14, left: 14, background: destacada.color_acento ?? "#d7a312", color: textoSobre(destacada.color_acento ?? "#d7a312") }}>{ETIQUETA_ESTADO[destacada.estadoPublico]}</span>
            <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, display: "flex", alignItems: "flex-end", gap: 12 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, color: destacada.color_texto ?? "#ffffff" }}>
                <span style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase" }}>{destacada.nombre}</span>
                <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.85 }}>{[destacada.temporada, destacada.venue].filter(Boolean).join(" · ")}</span>
              </div>
              <span className="boton principal" style={{ minHeight: 44, padding: "0 18px", fontSize: 12 }}>Ver obra</span>
            </div>
          </Link>
        )}

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {ACCESOS.map((a) => {
            const contenido = (
              <>
                <span style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: a.fondo }}><Icono nombre={a.icono} tamano={18} color="#ffffff" grosor={1.9} /></span>
                <span style={{ fontSize: 12, fontWeight: 800 }}>{a.texto}</span>
              </>
            );
            const estilo = { height: 84, borderRadius: 18, display: "flex", flexDirection: "column" as const, alignItems: "flex-start", justifyContent: "space-between", padding: 12, cursor: "pointer" };
            return "app" in a.ir
              ? <Link key={a.texto} to={a.ir.app} className="tarjeta" style={estilo}>{contenido}</Link>
              : <button key={a.texto} className="tarjeta" style={{ ...estilo, textAlign: "left" }} onClick={() => abrirWeb((a.ir as { web: string }).web)}>{contenido}</button>;
          })}
        </div>

        {otras.length > 0 && (
          <>
            <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 className="titulo-seccion">Más obras</h2>
              <Link to="/obras" style={{ fontSize: 13, fontWeight: 700, color: "var(--acento)", padding: "12px 0" }}>Ver todas</Link>
            </div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", margin: "0 -20px", padding: "0 20px", scrollSnapType: "x mandatory" }}>
              {otras.map((o) => (
                <Link key={o.id} to={`/obras/${o.id}`} style={{ width: 150, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, scrollSnapAlign: "start" }}>
                  <div style={{ position: "relative", width: 150, height: 190, borderRadius: 18, overflow: "hidden", background: o.color_fondo ?? "var(--tarjeta)" }}>
                    <ArteObra obra={o} uso="tarjeta-celular" />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{o.nombre}</span>
                  <span className="suave" style={{ fontSize: 12, marginTop: -6 }}>{ETIQUETA_ESTADO[o.estadoPublico]}{o.temporada ? ` · ${o.temporada}` : ""}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
