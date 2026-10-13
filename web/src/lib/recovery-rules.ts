// "Olvidé mi contraseña" (revisión de seguridad): cuándo el regreso a /auth/callback viene de verdad
// de un enlace de recuperación. Puro, con pruebas en recovery-rules.test.ts.

/** Métodos con los que se abrió la sesión (claim "amr" del token de Supabase). */
export function metodosDeSesion(accessToken: string | null | undefined): string[] {
  try {
    const payload = accessToken?.split(".")[1];
    if (!payload) return [];
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { amr?: { method?: string }[] };
    return (json.amr ?? []).map((a) => a.method ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

/** Solo un enlace de recuperación deja poner contraseña sin la actual:
 *  - formato token_hash: type=recovery;
 *  - formato ?code= (PKCE): la sesión dice que vino de "recovery", o se pidió recuperación hace poco. */
export function esRecuperacion(i: { type: string | null; metodos: string[]; recoverySentAt: string | null | undefined; ahora?: Date }): boolean {
  if (i.type === "recovery") return true;
  if (i.type) return false;
  if (i.metodos.includes("recovery")) return true;
  if (!i.recoverySentAt) return false;
  const t = new Date(i.recoverySentAt).getTime();
  const ahora = (i.ahora ?? new Date()).getTime();
  return Number.isFinite(t) && t <= ahora && ahora - t < 2 * 3600 * 1000;
}
