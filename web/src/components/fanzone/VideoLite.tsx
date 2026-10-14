"use client";

/* eslint-disable @next/next/no-img-element -- miniatura de YouTube */
import { useState } from "react";
import { Icono } from "@/components/Icono";

// Video de YouTube que carga solo al tocarlo (la Fan Zone puede tener muchos).
export function VideoLite({ id, title }: { id: string; title: string }) {
  const [play, setPlay] = useState(false);
  if (play) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
        title={title}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    );
  }
  return (
    <button type="button" onClick={() => setPlay(true)} aria-label={`Reproducir ${title}`} className="group absolute inset-0">
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,transparent_50%,rgb(8_7_12/0.7))]" />
      <span aria-hidden="true" className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-sala/80 text-lg text-texto ring-1 ring-white/30 backdrop-blur"><Icono nombre="play" /></span>
    </button>
  );
}
