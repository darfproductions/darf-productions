import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Icono } from "~/componentes/Icono";
import { Turnstile } from "~/componentes/Turnstile";
import { useApariencia } from "~/lib/apariencia";
import { env } from "~/lib/env";
import { supabase } from "~/lib/supabase";
import { abrirWeb } from "~/lib/usar";

// Entrar con correo y contraseña (la misma cuenta de la web). Crear cuenta y recuperar contraseña siguen en la
// web por ahora. Pendiente: "Continuar con Apple / Google" con su inicio de sesión nativo (ver README).

function mensaje(error: string): string {
  const m = error.toLowerCase();
  if (m.includes("captcha")) return "No pudimos comprobar que eres una persona. Espera la palomita de verificación y vuelve a intentarlo.";
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "El correo o la contraseña no coinciden.";
  if (m.includes("email not confirmed")) return "Primero confirma tu correo con la liga que te enviamos.";
  if (m.includes("rate limit") || m.includes("too many")) return "Hiciste demasiados intentos seguidos. Espera unos minutos.";
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
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: contrasena, options: { captchaToken: captcha ?? undefined } });
    setEnviando(false);
    setIntento((n) => n + 1);
    if (error) return setError(mensaje(error.message));
    navegar("/", { replace: true });
  };

  return (
    <main className="pantalla sin-barra">
      <div className="brillo" />
      <div className="contenido" style={{ gap: 18, paddingTop: 40 }}>
        <img src="/marca/darf-monograma.svg" alt="DARF Productions" style={{ width: 72, height: 72 }} />
        <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.05, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase" }}>
          Tu lugar en el <span className="texto-degradado">escenario</span>
        </h1>
        <p className="suave" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>Entra con tu cuenta de DARF para ver tus boletos y enterarte primero de cada función.</p>

        <form onSubmit={entrar} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <label className="campo">Correo
            <input type="email" autoComplete="email" inputMode="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </label>
          <label className="campo">Contraseña
            <input type="password" autoComplete="current-password" required value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
          </label>
          <Turnstile siteKey={env.turnstileSiteKey} tema={modo === "dia" ? "light" : "dark"} reinicio={intento} alResolver={setCaptcha} />
          {error && <p className="aviso error" role="alert" style={{ margin: 0 }}>{error}</p>}
          <button className="boton principal" type="submit" disabled={enviando || (!!env.turnstileSiteKey && !captcha)}>
            <Icono nombre="correo" tamano={18} />{enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button className="boton texto" onClick={() => abrirWeb("/entrar")}>Crear cuenta</button>
          <button className="boton texto" onClick={() => abrirWeb("/entrar/recuperar")}>Olvidé mi contraseña</button>
          <Link to="/" className="boton texto">Explorar sin cuenta</Link>
        </div>
      </div>
    </main>
  );
}
