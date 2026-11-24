import { useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { Icono } from "~/componentes/Icono";
import { abrir } from "~/lib/usar";

// Video de YouTube: miniatura con botón de reproducir. En iPhone, YouTube no deja reproducir sus videos dentro de la
// vista de la app (error 153: la app no tiene dirección web propia), así que se abre en YouTube dentro de la app (hoja
// de Safari, con su reproductor completo). En Android y en la computadora se reproduce aquí mismo.
export function VideoYoutube({ id, titulo, encima }: { id: string; titulo: string; encima?: ReactNode }) {
  const [play, setPlay] = useState(false);
  const enIphone = Capacitor.getPlatform() === "ios";
  const tocar = () => (enIphone ? void abrir(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`) : setPlay(true));
  return (
    <div style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden", background: "#000000" }}>
      {encima}
      {play ? (
        <iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0`} title={titulo}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
      ) : (
        <button aria-label={`Reproducir ${titulo}`} onClick={tocar} style={{ position: "absolute", inset: 0, padding: 0, border: "none", background: "none", cursor: "pointer" }}>
          <img src={`https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 45%, rgba(8,7,12,0.55))" }} />
          <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 60, height: 60, borderRadius: 30,
            background: "rgba(8,7,12,0.72)", border: "1px solid rgba(255,255,255,0.35)", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
            <Icono nombre="play" tamano={26} grosor={2} />
          </span>
        </button>
      )}
    </div>
  );
}
