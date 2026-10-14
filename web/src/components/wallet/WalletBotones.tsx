"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

// Botones oficiales "Agregar a Apple Wallet / Google Wallet" (2026-10-14). Solo aparecen los que tienen liga
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

// Botones oficiales (Diego 2026-10-14): Apple "ESMX" y Google "es_419", sin modificar.
// Apple pide mínimo 30 pt de alto; los dos van a 44 px.
const estilo = "inline-flex rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function WalletBotones({ apple, google }: { apple?: string | null; google?: string | null }) {
  const p = useSyncExternalStore(nada, plataforma, () => "otro" as Plataforma);
  if (!apple && !google) return null;
  const a = apple && (
    <a key="apple" href={apple} className={estilo}>
      <Image src="/wallet/apple-wallet-es-mx.svg" alt="Agregar a Apple Wallet" width={139} height={44} unoptimized className="h-11 w-auto" />
    </a>
  );
  const g = google && (
    <a key="google" href={google} className={estilo}>
      <Image src="/wallet/google-wallet-es-419.svg" alt="Agregar a la Billetera de Google" width={191} height={44} unoptimized className="h-11 w-auto" />
    </a>
  );
  return <div className="flex flex-wrap items-center justify-center gap-2.5">{p === "android" ? [g, a] : [a, g]}</div>;
}
