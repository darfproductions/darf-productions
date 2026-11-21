import { useEffect, useRef } from "react";

// Captcha de Cloudflare Turnstile (la base lo pide para entrar). Igual que web/src/components/Turnstile.tsx,
// pero devuelve el token con `alResolver` porque aquí no hay servidor de por medio. Cada token sirve una vez:
// al cambiar `reinicio` se pide uno nuevo. Sin llave no muestra nada.

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

export function Turnstile({ siteKey, tema, reinicio, alResolver }: { siteKey: string; tema: "dark" | "light"; reinicio?: unknown; alResolver: (token: string | null) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let vivo = true;
    cargar().then(() => {
      if (!vivo || !caja.current || !window.turnstile) return;
      widget.current = window.turnstile.render(caja.current, {
        sitekey: siteKey, language: "es", theme: tema, size: "flexible",
        callback: (t: string) => alResolver(t),
        "expired-callback": () => alResolver(null),
        "error-callback": () => alResolver(null),
      });
    });
    return () => {
      vivo = false;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, tema]);

  useEffect(() => {
    if (widget.current && window.turnstile) { window.turnstile.reset(widget.current); alResolver(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reinicio]);

  if (!siteKey) return null;
  return <div ref={caja} style={{ minHeight: 65 }} aria-label="Verificación de seguridad" />;
}
