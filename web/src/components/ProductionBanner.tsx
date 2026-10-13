"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { textoSobre, type Banner, type BannerItem } from "@/lib/banner-rules";

// Franja de avisos abajo del Hero (0069). "corre": marquesina que se mueve; "fija": un aviso
// a la vez que se turna cada 6 s. Se puede pausar (y con "reducir movimiento" no se mueve sola).

const ROTA_MS = 6000;

function Liga({ item, children, className, oculto }: { item: BannerItem; children: React.ReactNode; className?: string; oculto?: boolean }) {
  if (!item.enlace) return <>{children}</>;
  const extra = oculto ? { tabIndex: -1 } : {};
  return item.enlace.startsWith("/") ? (
    <Link href={item.enlace} className={className} {...extra}>{children}</Link>
  ) : (
    <a href={item.enlace} target="_blank" rel="noopener noreferrer" className={className} {...extra}>{children}</a>
  );
}

function Pausa({ pausado, onClick }: { pausado: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={pausado ? "Reanudar avisos" : "Pausar avisos"}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-current/40 text-xs font-bold">
      {pausado ? "▶" : "❚❚"}
    </button>
  );
}

function Corre({ items, pausado }: { items: BannerItem[]; pausado: boolean }) {
  // Cada copia se repite hasta ser más ancha que la pantalla; dos copias = vuelta sin saltos.
  const largo = items.reduce((n, i) => n + i.texto.length + (i.boton?.length ?? 0) + 6, 0);
  const veces = Math.max(1, Math.ceil(140 / Math.max(largo, 1)));
  const copia = Array.from({ length: veces }, () => items).flat();
  const segundos = Math.max(18, Math.round(largo * veces * 0.22));
  // Solo el primer juego se lee y recibe foco; las repeticiones son decorado (aria-hidden).
  const mitad = (segunda: boolean) => (
    <ul aria-hidden={segunda || undefined} className="flex shrink-0 items-center">
      {copia.map((it, i) => {
        const oculto = segunda || i >= items.length;
        return (
          <li key={i} aria-hidden={(!segunda && oculto) || undefined} className="flex items-center gap-3 whitespace-nowrap px-5 py-3">
            <span aria-hidden="true" className="opacity-70">✦</span>
            <Liga item={it} oculto={oculto} className="underline-offset-4 hover:underline">
              <span className="font-bold uppercase tracking-[0.08em]">{it.texto}</span>
              {it.enlace && <span className="ml-2 font-semibold opacity-85">{it.boton || "Ver más"} →</span>}
            </Liga>
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className="min-w-0 flex-1 overflow-hidden">
      <div className="franja-corre flex w-max" style={{ animationDuration: `${segundos}s`, animationPlayState: pausado ? "paused" : undefined }}>
        {mitad(false)}
        {mitad(true)}
      </div>
    </div>
  );
}

function Fija({ items, pausado }: { items: BannerItem[]; pausado: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (pausado || items.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), ROTA_MS);
    return () => clearInterval(t);
  }, [pausado, items.length]);
  const it = items[i % items.length];
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-4 gap-y-2 py-3 text-center">
      <p className="min-w-0 font-bold wrap-anywhere">{it.texto}</p>
      {it.enlace && (
        <Liga item={it} className="shrink-0 rounded-full border-2 border-current px-4 py-1.5 text-sm font-bold uppercase tracking-[0.08em] hover:opacity-80">
          {it.boton || "Ver más"} →
        </Liga>
      )}
      {items.length > 1 && (
        <span className="flex w-full justify-center gap-1.5 sm:w-auto">
          {items.map((_, j) => (
            <button key={j} type="button" onClick={() => setI(j)} aria-label={`Aviso ${j + 1} de ${items.length}`} aria-current={j === i % items.length || undefined}
              className={`h-2.5 w-2.5 rounded-full border border-current ${j === i % items.length ? "bg-current" : ""}`} />
          ))}
        </span>
      )}
    </div>
  );
}

export function ProductionBanner({ banner, acento }: { banner: Banner; acento: string }) {
  const [pausado, setPausado] = useState(false);
  const [quieto, setQuieto] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setQuieto(m.matches);
    set();
    m.addEventListener("change", set);
    return () => m.removeEventListener("change", set);
  }, []);
  const fondo = banner.color ?? acento;
  const parado = pausado || quieto;
  const mueve = banner.estilo === "fija" ? banner.items.length > 1 : !quieto;
  return (
    <aside aria-label="Avisos" className="franja" style={{ background: fondo, color: textoSobre(fondo) }}>
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-3 md:px-12">
        {banner.estilo === "corre" && !quieto ? <Corre items={banner.items} pausado={parado} /> : <Fija items={banner.items} pausado={parado} />}
        {mueve && !quieto && <Pausa pausado={pausado} onClick={() => setPausado(!pausado)} />}
      </div>
    </aside>
  );
}
