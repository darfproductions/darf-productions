import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Icono } from "~/componentes/Icono";
import { Turnstile } from "~/componentes/Turnstile";
import { useApariencia } from "~/lib/apariencia";
import { appleDisponible, cancelado, completarRegreso, entrarConApple, entrarConGoogle } from "~/lib/entrar-social";
import { env } from "~/lib/env";
import { supabase } from "~/lib/supabase";
import { abrirWeb } from "~/lib/usar";

// Entrar: con Apple (iPhone), con Google o con correo y contraseña. Es la misma cuenta de la web.
// Crear cuenta con correo y recuperar contraseña siguen en la web por ahora.

function mensaje(error: string): string {
  const m = error.toLowerCase();
  if (m.includes("captcha")) return "No pudimos comprobar que eres una persona. Espera la palomita de verificación y vuelve a intentarlo.";
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "El correo o la contraseña no coinciden.";
  if (m.includes("email not confirmed")) return "Primero confirma tu correo con la liga que te enviamos.";
  if (m.includes("rate limit") || m.includes("too many")) return "Hiciste demasiados intentos seguidos. Espera unos minutos.";
  if (m.includes("not enabled") || m.includes("not allowed") || m.includes("unsupported provider")) return "Esta forma de entrar todavía no está activada. Usa otra por ahora.";
  return "No pudimos entrar. Revisa tu conexión e inténtalo de nuevo.";
}

export function Acceso() {
  const navegar = useNavigate();
  const { modo } = useApariencia();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"correo" | "apple" | "google" | null>(null);
  const falta = !!env.turnstileSiteKey && !captcha;

  // En el navegador (pruebas en computadora) Google regresa a /acceso?code=…
  useEffect(() => {
    if (!window.location.search.includes("code=") && !window.location.search.includes("error")) return;
    completarRegreso(window.location.href)
      .then((ok) => ok && navegar("/", { replace: true }))
      .catch((e: Error) => setError(mensaje(e.message)));
  }, [navegar]);

  const terminar = (e: unknown) => {
    setEnviando(null);
    setIntento((n) => n + 1);
    if (e && !cancelado(e)) setError(mensaje(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e)));
  };

  const conCorreo = async (ev: FormEvent) => {
    ev.preventDefault();
    setEnviando("correo");
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: contrasena, options: { captchaToken: captcha ?? undefined } });
    if (error) return terminar(error);
    navegar("/", { replace: true });
  };

  const conApple = async () => {
    setEnviando("apple");
    setError(null);
    try {
      await entrarConApple(captcha ?? undefined);
      navegar("/", { replace: true });
    } catch (e) { terminar(e); }
  };

  // Google no pide captcha (lo valida Google). La sesión llega al regresar a la app (App.tsx).
  const conGoogle = async () => {
    setEnviando("google");
    setError(null);
    try { await entrarConGoogle(); } catch (e) { terminar(e); return; }
    setEnviando(null);
  };

  return (
    <main className="pantalla sin-barra">
      <div className="brillo" />
      <div className="contenido" style={{ gap: 18, paddingTop: 32 }}>
        <img src="/marca/darf-monograma.svg" alt="DARF Productions" style={{ width: 64, height: 64 }} />
        <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.05, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase" }}>
          Tu lugar en el <span className="texto-degradado">escenario</span>
        </h1>
        <p className="suave" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>Entra con tu cuenta de DARF para ver tus boletos y enterarte primero de cada función.</p>

        <Turnstile siteKey={env.turnstileSiteKey} tema={modo === "dia" ? "light" : "dark"} reinicio={intento} alResolver={setCaptcha} />
        {error && <p className="aviso error" role="alert" style={{ margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {appleDisponible() && (
            <button className="boton" onClick={conApple} disabled={!!enviando || falta}
              style={{ background: modo === "dia" ? "#0b0b0b" : "#ffffff", color: modo === "dia" ? "#ffffff" : "#0b0b0b", textTransform: "none", letterSpacing: 0, fontSize: 16, fontWeight: 700, borderRadius: 14 }}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8zM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" /></svg>
              {enviando === "apple" ? "Entrando…" : "Continuar con Apple"}
            </button>
          )}
          <button className="boton tarjeta" onClick={conGoogle} disabled={!!enviando} style={{ borderRadius: 14, fontSize: 16 }}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9c-.3 1.4-1 2.5-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.7 3.2-8z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8C3.9 20.6 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.8 14.2c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V7H2.1C1.4 8.5 1 10.2 1 12s.4 3.5 1.1 5l3.7-2.8z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.5 2.1 15 1 12 1 7.7 1 3.9 3.4 2.1 7l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" /></svg>
            {enviando === "google" ? "Abriendo Google…" : "Continuar con Google"}
          </button>
        </div>

        <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--suave)", fontSize: 12, fontWeight: 700 }}>
          <span style={{ flex: 1, height: 1, background: "var(--linea)" }} />o con tu correo<span style={{ flex: 1, height: 1, background: "var(--linea)" }} />
        </div>

        <form onSubmit={conCorreo} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="campo">Correo
            <input type="email" autoComplete="email" inputMode="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </label>
          <label className="campo">Contraseña
            <input type="password" autoComplete="current-password" required value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
          </label>
          <button className="boton principal" type="submit" disabled={!!enviando || falta}>
            <Icono nombre="correo" tamano={18} />{enviando === "correo" ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button className="boton texto" onClick={() => abrirWeb("/entrar")}>Crear cuenta con correo</button>
          <button className="boton texto" onClick={() => abrirWeb("/entrar/recuperar")}>Olvidé mi contraseña</button>
          <Link to="/" className="boton texto">Explorar sin cuenta</Link>
        </div>
        <p className="suave" style={{ margin: 0, textAlign: "center", fontSize: 12, lineHeight: 1.5 }}>Al continuar aceptas el Aviso de privacidad de DARF Productions.</p>
      </div>
    </main>
  );
}
