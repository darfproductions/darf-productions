import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import { Icono } from "~/componentes/Icono";
import { useApariencia } from "~/lib/apariencia";
import { funcionPasada, imagen, leerObra, poster, type Funcion } from "~/lib/datos";
import { env } from "~/lib/env";
import { dinero, fechaLarga, hora } from "~/lib/formato";
import { paletaObra, variables } from "~/lib/tema";
import { abrir, abrirWeb, useCarga } from "~/lib/usar";

// Página de una obra con SUS colores: el kit de la obra en su modo y la versión aclarada u oscurecida en el otro.

export function Obra() {
  const { id = "" } = useParams();
  const { modo } = useApariencia();
  const { datos, error, cargando } = useCarga(() => leerObra(id), [id]);
  const paleta = useMemo(() => (datos ? paletaObra(datos.obra, modo) : null), [datos, modo]);
  const vendibles = useMemo(() => (datos?.funciones ?? []).filter((f) => f.on_sale && f.starts_at && !funcionPasada(f.starts_at)), [datos]);
  const [elegida, setElegida] = useState<string | null>(null);
  useEffect(() => setElegida(vendibles[0]?.id ?? null), [vendibles]);

  // El fondo de toda la pantalla (también detrás de la barra del sistema) toma el color de la obra.
  useEffect(() => {
    if (!paleta) return;
    const antes = document.body.style.background;
    document.body.style.background = paleta.fondo;
    return () => { document.body.style.background = antes; };
  }, [paleta]);

  if (cargando) return <main className="pantalla"><div className="esqueleto" style={{ height: 300, margin: "0 -20px", borderRadius: 0 }} /></main>;
  if (error || !datos) {
    return (
      <main className="pantalla">
        <Link to="/obras" className="circulo" aria-label="Volver"><Icono nombre="atras" /></Link>
        <p className="aviso error" style={{ marginTop: 16 }}>{error ? "No pudimos cargar la obra. Revisa tu conexión." : "Esta obra no está disponible."}</p>
      </main>
    );
  }

  const { obra, zonas } = datos;
  const hero = poster(obra, "destacada-celular");
  const logo = imagen(obra.logo_path);
  const funcion = vendibles.find((f) => f.id === elegida) ?? null;
  const desde = zonas.length ? Math.min(...zonas.map((z) => z.price)) : 0;
  const lugar = funcion?.venue ?? obra.venue;
  const mostrarPrecios = obra.mostrar_precios !== false && zonas.length > 0;

  const compartir = async () => {
    const url = `${env.siteUrl}/producciones/${obra.id}`;
    if (Capacitor.isNativePlatform() || (await Share.canShare()).value) await Share.share({ title: obra.nombre, text: obra.frase ?? obra.nombre, url }).catch(() => {});
    else await navigator.clipboard?.writeText(url);
  };
  const comoLlegar = () => lugar && abrir(`https://maps.google.com/?q=${encodeURIComponent(lugar + ", Querétaro")}`);
  const comprar = () => {
    if (obra.modo_venta === "whatsapp" && env.whatsapp) {
      const texto = `Hola, quiero boletos para ${obra.nombre}${funcion?.starts_at ? ` (${fechaLarga(funcion.starts_at)})` : ""}.`;
      return abrir(`https://wa.me/${env.whatsapp}?text=${encodeURIComponent(texto)}`);
    }
    return abrirWeb(`/comprar/${funcion?.id ?? ""}`);
  };

  return (
    <main className="pantalla completa sin-barra" style={paleta ? (variables(paleta) as React.CSSProperties) : undefined}>
      <div style={{ position: "relative", height: "calc(300px + var(--arriba))", overflow: "hidden", background: obra.color_fondo ?? "#0b0b0b" }}>
        {hero && <img src={hero} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,0.25) 0%, transparent 40%, var(--fondo) 100%)` }} />
        {logo && <img src={logo} alt={obra.nombre} style={{ position: "absolute", left: "50%", bottom: 26, transform: "translateX(-50%)", maxWidth: "72%", maxHeight: 120, objectFit: "contain" }} />}
        <div style={{ position: "absolute", top: "calc(var(--arriba) + 12px)", left: 16, right: 16, display: "flex", justifyContent: "space-between" }}>
          <Link to="/obras" className="circulo vidrio" aria-label="Volver"><Icono nombre="atras" /></Link>
          <button className="circulo vidrio" onClick={compartir} aria-label="Compartir"><Icono nombre="compartir" tamano={20} /></button>
        </div>
      </div>

      <div className="contenido" style={{ padding: "0 20px" }}>
        <h1 className={logo ? "oculto" : "titulo-grande"}>{obra.nombre}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {obra.temporada && <span className="pildora" style={{ background: "var(--boton)", color: "var(--sobre-boton)" }}>Temporada {obra.temporada}</span>}
          {lugar && <span className="suave" style={{ fontSize: 13, fontWeight: 600 }}>{lugar}</span>}
        </div>
        {obra.frase && <p style={{ margin: "14px 0 0", fontSize: 16, lineHeight: 1.6 }}>{obra.frase}</p>}

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <button className="boton tarjeta" onClick={comoLlegar} disabled={!lugar} style={{ minHeight: 56, fontSize: 13 }}><Icono nombre="mapa" tamano={20} color="var(--acento)" />Cómo llegar</button>
          <button className="boton tarjeta" onClick={compartir} style={{ minHeight: 56, fontSize: 13 }}><Icono nombre="compartir" tamano={20} color="var(--acento)" />Compartir</button>
        </div>

        {vendibles.length > 0 && (
          <>
            <h2 className="etiqueta" style={{ margin: "22px 0 0" }}>Elige tu función</h2>
            <div role="radiogroup" aria-label="Funciones" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {vendibles.map((f) => <ChipFuncion key={f.id} f={f} elegida={f.id === elegida} elegir={() => setElegida(f.id)} />)}
            </div>
          </>
        )}

        {mostrarPrecios && (
          <>
            <h2 className="etiqueta" style={{ margin: "22px 0 0" }}>Zonas y precios</h2>
            <div style={{ marginTop: 6 }}>
              {zonas.map((z) => (
                <div key={z.nombre} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44, borderBottom: "1px solid var(--linea)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: z.color ?? "var(--acento)" }} />{z.nombre}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{dinero(z.price)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="pie" style={{ ["--pie-fondo" as string]: "var(--superficie)" }}>
        {obra.concluded ? (
          <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700 }}>Esta obra ya concluyó. Gracias por ser parte de su historia.</p>
        ) : funcion ? (
          <>
            {mostrarPrecios && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span className="suave" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Desde</span>
                <span style={{ fontSize: 22, fontWeight: 900 }}>{dinero(desde)}</span>
              </div>
            )}
            <button className="boton acento" style={{ flex: 1 }} onClick={comprar}>
              {obra.modo_venta === "whatsapp" ? "Pedir por WhatsApp" : "Elegir asientos"}<Icono nombre="flecha" tamano={18} grosor={2.2} />
            </button>
          </>
        ) : (
          <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700 }}>Muy pronto anunciaremos fechas. Activa los avisos en Cuenta para enterarte primero.</p>
        )}
      </div>
    </main>
  );
}

function ChipFuncion({ f, elegida, elegir }: { f: Funcion; elegida: boolean; elegir: () => void }) {
  return (
    <button role="radio" aria-checked={elegida} onClick={elegir} style={{
      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "12px 14px", borderRadius: 16, cursor: "pointer", textAlign: "left",
      background: elegida ? "color-mix(in srgb, var(--acento) 16%, var(--superficie))" : "var(--superficie)",
      border: `1.5px solid ${elegida ? "var(--acento)" : "var(--linea)"}`,
    }}>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{f.starts_at ? fechaLarga(f.starts_at) : "Fecha por anunciar"}</span>
      {f.starts_at && <span className="suave" style={{ fontSize: 12, fontWeight: 600 }}>{hora(f.starts_at)}</span>}
    </button>
  );
}
