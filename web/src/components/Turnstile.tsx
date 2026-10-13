"use client";

import { useEffect, useRef } from "react";

// Captcha de Cloudflare Turnstile (Bloque 2). Pone el campo oculto "cf-turnstile-response" dentro
// del formulario; el servidor lo pasa a Supabase como captchaToken. Cada token sirve una vez:
// al cambiar `reinicio` (después de cada intento) se pide uno nuevo.
// Sin llave (copia local y pruebas) no muestra nada y el formulario funciona igual.

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi; onTurnstileLoad?: () => void }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
let cargando: Promise<void> | null = null;

function cargar(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  cargando ??= new Promise<void>((ok) => {
    window.onTurnstileLoad = () => ok();
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    document.head.appendChild(s);
  });
  return cargando;
}

export function Turnstile({ siteKey, reinicio }: { siteKey: string; reinicio?: unknown }) {
  const caja = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let vivo = true;
    cargar().then(() => {
      if (!vivo || !caja.current || !window.turnstile) return;
      widget.current = window.turnstile.render(caja.current, { sitekey: siteKey, language: "es", theme: "dark", size: "flexible" });
    });
    return () => {
      vivo = false;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, [reinicio]);

  if (!siteKey) return null;
  return <div ref={caja} className="min-h-[65px]" aria-label="Verificación de seguridad" />;
}
