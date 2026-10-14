"use client";

import { useSyncExternalStore } from "react";

// Botones "Agregar a Apple Wallet / Google Wallet" (2026-10-14). Solo aparecen los que tienen liga
// (la web los da cuando las llaves de cada Wallet están puestas). En iPhone va primero Apple y en
// Android primero Google; en computadora, los dos.

type Plataforma = "ios" | "android" | "otro";

const nada = () => () => {};
const plataforma = (): Plataforma => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "otro";
};

function Apple() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.37 12.6c-.02-2.27 1.86-3.36 1.94-3.41-1.06-1.55-2.7-1.76-3.28-1.78-1.4-.14-2.73.82-3.44.82-.71 0-1.8-.8-2.96-.78-1.52.02-2.93.89-3.71 2.25-1.58 2.75-.4 6.82 1.14 9.05.75 1.09 1.65 2.31 2.82 2.27 1.13-.05 1.56-.73 2.93-.73 1.37 0 1.75.73 2.95.71 1.22-.02 1.99-1.11 2.73-2.2.86-1.26 1.21-2.48 1.23-2.55-.03-.01-2.36-.9-2.38-3.58ZM14.12 5.94c.62-.76 1.04-1.8.93-2.84-.9.04-1.98.6-2.62 1.35-.58.66-1.08 1.73-.95 2.75 1 .08 2.03-.51 2.64-1.26Z" />
    </svg>
  );
}

function Google() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285f4" d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.4a4.62 4.62 0 0 1-2 3.03v2.5h3.24c1.9-1.75 2.96-4.33 2.96-7.34Z" />
      <path fill="#34a853" d="M12 22c2.7 0 4.98-.89 6.64-2.43l-3.24-2.5c-.9.6-2.05.95-3.4.95-2.61 0-4.82-1.76-5.61-4.13H3.04v2.58A10 10 0 0 0 12 22Z" />
      <path fill="#fbbc04" d="M6.39 13.89a6 6 0 0 1 0-3.78V7.53H3.04a10 10 0 0 0 0 8.94l3.35-2.58Z" />
      <path fill="#ea4335" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.53l3.35 2.58C7.18 7.74 9.39 5.98 12 5.98Z" />
    </svg>
  );
}

const estilo = "inline-flex min-h-[44px] items-center gap-2.5 rounded-xl border border-white/25 bg-black px-4 py-2 text-sm font-semibold text-white hover:border-white/50";

export function WalletBotones({ apple, google }: { apple?: string | null; google?: string | null }) {
  const p = useSyncExternalStore(nada, plataforma, () => "otro" as Plataforma);
  if (!apple && !google) return null;
  const a = apple && <a key="apple" href={apple} className={estilo}><Apple /> Agregar a Apple Wallet</a>;
  const g = google && <a key="google" href={google} className={estilo}><Google /> Agregar a Google Wallet</a>;
  return <div className="flex flex-wrap justify-center gap-2.5">{p === "android" ? [g, a] : [a, g]}</div>;
}
