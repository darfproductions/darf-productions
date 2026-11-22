import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { PASSWORD_AYUDA, passwordOk } from "@/lib/account-rules";
import { Icono } from "~/componentes/Icono";
import { Turnstile } from "~/componentes/Turnstile";
import { useApariencia } from "~/lib/apariencia";
import { appleNativo, cancelado, completarRegreso, entrarConAppleNativo, entrarConPagina } from "~/lib/entrar-social";
import { env } from "~/lib/env";
import { supabase } from "~/lib/supabase";
import { abrirWeb } from "~/lib/usar";

// Entrar o crear cuenta: con Apple, con Google o con correo y contraseña. Es la misma cuenta de la web y las
// mismas reglas (contraseña: web/src/lib/account-rules.ts; registro: web/src/app/entrar/actions.ts).
// El enlace de confirmación del correo abre la web; después se entra aquí con el correo y la contraseña.
// Recuperar la contraseña sigue en la web.

const regresoCorreo = () => `${env.siteUrl}/auth/callback?next=${encodeURIComponent("/cuenta")}`;

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
  const [pestana, setPestana] = useState<"entrar" | "registro">("entrar");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sinConfirmar, setSinConfirmar] = useState(false);
  const [enviando, setEnviando] = useState<"correo" | "apple" | "google" | "reenvio" | null>(null);
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
    setAviso(null);
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: contrasena, options: { captchaToken: captcha ?? undefined } });
    setSinConfirmar(!!error && /confirm/i.test(error.message));
    if (error) return terminar(error);
    navegar("/", { replace: true });
  };

  const crearCuenta = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    setAviso(null);
    const email = correo.trim();
    if (!nombre.trim() || !email) return setError("Escribe tu nombre y tu correo.");
    if (!passwordOk(contrasena, email)) return setError(`Esa contraseña no sirve. ${PASSWORD_AYUDA}`);
    setEnviando("correo");
    const { data, error } = await supabase.auth.signUp({
      email, password: contrasena,
      options: { data: { nombre: nombre.trim() }, captchaToken: captcha ?? undefined, emailRedirectTo: regresoCorreo() },
    });
    if (error) return terminar(error);
    setEnviando(null);
    setIntento((n) => n + 1);
    if (data.session) return navegar("/", { replace: true });
    // Mismo mensaje si el correo ya tenía cuenta (como la web): así nadie averigua qué correos están registrados.
    setAviso(`Te enviamos un enlace a ${email} para confirmar tu cuenta. Después regresa aquí y entra con tu correo y contraseña. Si ese correo ya tenía cuenta, solo entra.`);
    setPestana("entrar");
    setContrasena("");
  };

  const reenviar = async () => {
    setEnviando("reenvio");
    setError(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: correo.trim(), options: { captchaToken: captcha ?? undefined, emailRedirectTo: regresoCorreo() } });
    setEnviando(null);
    setIntento((n) => n + 1);
    if (error && /captcha|rate limit|too many/i.test(error.message)) return setError(mensaje(error.message));
    setSinConfirmar(false);
    setAviso(`Si ${correo.trim()} tiene una cuenta sin confirmar, te mandamos de nuevo el enlace. Revisa también tu correo no deseado.`);
  };

  // iPhone: ventana nativa de Apple (pide captcha). Android y navegador: la página de Apple, como Google.
  const conApple = async () => {
    if (!appleNativo()) return conPagina("apple");
    setEnviando("apple");
    setError(null);
    try {
      await entrarConAppleNativo(captcha ?? undefined);
      navegar("/", { replace: true });
    } catch (e) { terminar(e); }
  };

  // Con la página del proveedor no se pide captcha. La sesión llega al regresar a la app (App.tsx).
  const conPagina = async (proveedor: "google" | "apple") => {
    setEnviando(proveedor);
    setError(null);
    try { await entrarConPagina(proveedor); } catch (e) { terminar(e); return; }
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
        {sinConfirmar && (
          <button className="boton contorno" onClick={reenviar} disabled={!!enviando || !correo.trim()}>
            {enviando === "reenvio" ? "Enviando…" : "Reenviar correo de confirmación"}
          </button>
        )}
        {aviso && <p className="aviso" role="status" style={{ margin: 0 }}>{aviso}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button className="boton" onClick={conApple} disabled={!!enviando || (appleNativo() && falta)}
            style={{ background: modo === "dia" ? "#0b0b0b" : "#ffffff", color: modo === "dia" ? "#ffffff" : "#0b0b0b", textTransform: "none", letterSpacing: 0, fontSize: 16, fontWeight: 700, borderRadius: 14 }}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8zM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" /></svg>
            {enviando === "apple" ? "Entrando…" : "Continuar con Apple"}
          </button>
          <button className="boton tarjeta" onClick={() => conPagina("google")} disabled={!!enviando} style={{ borderRadius: 14, fontSize: 16 }}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9c-.3 1.4-1 2.5-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.7 3.2-8z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8C3.9 20.6 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.8 14.2c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V7H2.1C1.4 8.5 1 10.2 1 12s.4 3.5 1.1 5l3.7-2.8z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.5 2.1 15 1 12 1 7.7 1 3.9 3.4 2.1 7l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" /></svg>
            {enviando === "google" ? "Abriendo Google…" : "Continuar con Google"}
          </button>
        </div>

        <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--suave)", fontSize: 12, fontWeight: 700 }}>
          <span style={{ flex: 1, height: 1, background: "var(--linea)" }} />o con tu correo<span style={{ flex: 1, height: 1, background: "var(--linea)" }} />
        </div>

        <div role="tablist" aria-label="Cuenta" className="segmentos">
          <button role="tab" aria-selected={pestana === "entrar"} onClick={() => { setPestana("entrar"); setError(null); }}>Entrar</button>
          <button role="tab" aria-selected={pestana === "registro"} onClick={() => { setPestana("registro"); setError(null); setSinConfirmar(false); }}>Crear cuenta</button>
        </div>

        <form onSubmit={pestana === "entrar" ? conCorreo : crearCuenta} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pestana === "registro" && (
            <label className="campo">Nombre
              <input autoComplete="name" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
          )}
          <label className="campo">Correo
            <input type="email" autoComplete="email" inputMode="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </label>
          <label className="campo">Contraseña
            <input type="password" autoComplete={pestana === "entrar" ? "current-password" : "new-password"} required minLength={pestana === "registro" ? 8 : undefined}
              aria-describedby={pestana === "registro" ? "ayuda-contrasena" : undefined} value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
            {pestana === "registro" && <span id="ayuda-contrasena" className="suave" style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>{PASSWORD_AYUDA}</span>}
          </label>
          <button className="boton principal" type="submit" disabled={!!enviando || falta}>
            <Icono nombre="correo" tamano={18} />
            {pestana === "entrar" ? (enviando === "correo" ? "Entrando…" : "Entrar") : (enviando === "correo" ? "Creando…" : "Crear cuenta")}
          </button>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {pestana === "entrar" && <button className="boton texto" onClick={() => abrirWeb("/entrar/recuperar")}>Olvidé mi contraseña</button>}
          <Link to="/" className="boton texto">Explorar sin cuenta</Link>
        </div>
        <p className="suave" style={{ margin: 0, textAlign: "center", fontSize: 12, lineHeight: 1.6 }}>
          Al continuar aceptas los <button className="liga" onClick={() => abrirWeb("/terminos")}>términos</button> y el <button className="liga" onClick={() => abrirWeb("/privacidad")}>aviso de privacidad</button> de DARF Productions.
        </p>
      </div>
    </main>
  );
}
