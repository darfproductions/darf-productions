"use client";

/* eslint-disable @next/next/no-img-element -- imagen del anuncio desde Storage */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { CuentaRegresiva } from "@/components/CuentaRegresiva";
import { avisame } from "@/lib/anuncio-actions";
import { TIPOS_ANUNCIO } from "@/lib/anuncio-rules";
import type { AnuncioVista } from "@/lib/anuncios";
import { Icono } from "@/components/Icono";

export type TonoAnuncio = "sitio" | "obra" | "fanzone";

const CAJA: Record<TonoAnuncio, string> = {
  sitio: "border-linea bg-telon text-texto",
  obra: "border-current/12 bg-obra-superficie",
  fanzone: "border-oro/30 bg-[#120f17] text-texto",
};
const ETIQUETA: Record<TonoAnuncio, string> = { sitio: "text-oro", obra: "text-obra-acento", fanzone: "text-oro" };

// Un anuncio: antes de revelarse, adelanto + cuenta regresiva + "Avísame"; después, el contenido.
// "Solo Club Fan": a quien no es socio se le invita a unirse.
export function AnuncioCard({ a, tono, conCuenta }: { a: AnuncioVista; tono: TonoAnuncio; conCuenta: boolean }) {
  const path = usePathname() ?? "/";
  const [apuntado, setApuntado] = useState(a.apuntado);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const esperando = !a.revelado && !!a.revela_at;
  const delClub = a.revelado && a.bloqueado && a.solo_club;

  const toggle = () =>
    start(async () => {
      const r = await avisame(a.id, !apuntado);
      if (r.ok) {
        setApuntado(!apuntado);
        setMsg(r.message);
      } else setMsg(r.message === "login" ? "" : r.message);
    });

  return (
    <article className={`flex h-full flex-col gap-4 overflow-hidden rounded-[22px] border p-6 md:p-7 ${CAJA[tono]}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[10.5px] font-bold uppercase tracking-[0.24em] ${ETIQUETA[tono]}`}>{TIPOS_ANUNCIO[a.tipo]}</span>
        {a.solo_club && <span className="chip chip-oro min-h-[24px] px-2.5 text-[10px] uppercase tracking-[0.14em]">Solo Club Fan</span>}
      </div>
      <h3 className="text-xl font-extrabold leading-tight tracking-[-0.01em] md:text-2xl">{a.titulo}</h3>
      {a.adelanto && <p className="text-[15px] leading-relaxed opacity-85">{a.adelanto}</p>}

      {esperando && a.revela_at && (
        <div className="flex flex-col gap-3 rounded-[18px] border border-current/12 p-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.32em] opacity-75">Se revela en</span>
          <CuentaRegresiva hasta={a.revela_at} />
        </div>
      )}

      {!a.bloqueado && (
        <>
          {a.imagen_url && <img src={a.imagen_url} alt="" loading="lazy" className="aspect-[16/9] w-full rounded-[16px] object-cover" />}
          {a.contenido && <p className="whitespace-pre-line text-[15px] leading-relaxed">{a.contenido}</p>}
        </>
      )}

      {delClub && (
        <p className="rounded-[16px] border border-oro/30 p-4 text-sm">
          <Icono nombre="candado" /> Esto es solo para el Club Fan. <Link href="/fan-zone" className="font-bold text-oro-claro underline">Únete gratis a la Fan Zone</Link>
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
        {!a.bloqueado && a.enlace && (
          a.enlace.startsWith("/") ? (
            <Link href={a.enlace} className={`fb fb-sm ${tono === "fanzone" ? "fb-fz" : "fb-luz"}`}>{a.boton || "Ver más"}</Link>
          ) : (
            <a href={a.enlace} target="_blank" rel="noopener noreferrer" className={`fb fb-sm ${tono === "fanzone" ? "fb-fz" : "fb-luz"}`}>{a.boton || "Ver más"} <Icono nombre="externo" /></a>
          )
        )}
        {esperando && a.registro && (
          conCuenta ? (
            <button type="button" onClick={toggle} disabled={pending} aria-pressed={apuntado} className={`fb fb-sm ${apuntado ? (tono === "obra" ? "fb-obra" : "fb-o") : tono === "fanzone" ? "fb-fz" : "fb-luz"}`}>
              {pending ? "…" : apuntado ? <><Icono nombre="check" /> Te avisaremos</> : "Avísame"}
            </button>
          ) : (
            <Link href={`/entrar?next=${encodeURIComponent(path)}`} className={`fb fb-sm ${tono === "fanzone" ? "fb-fz" : "fb-luz"}`}>Entra para que te avisemos</Link>
          )
        )}
      </div>
      {msg && <p role="status" className="text-xs opacity-80">{msg}</p>}
    </article>
  );
}
