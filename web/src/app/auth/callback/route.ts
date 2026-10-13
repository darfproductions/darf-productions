import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { RECOVERY_COOKIE, RECOVERY_PATH, safeNext } from "@/lib/auth";
import { esRecuperacion, metodosDeSesion } from "@/lib/recovery-rules";
import { createClient } from "@/lib/supabase/server";

// Destino del enlace de confirmación de correo. Acepta los dos formatos de
// Supabase: ?code= (PKCE) y ?token_hash=&type=.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let r: Awaited<ReturnType<typeof supabase.auth.verifyOtp>> | null = null;
  if (code) r = await supabase.auth.exchangeCodeForSession(code);
  else if (tokenHash && type) r = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  const ok = !!r && !r.error && !!r.data.session;

  const res = NextResponse.redirect(new URL(ok ? next : "/entrar?error=enlace", url.origin));
  // Enlace de "olvidé mi contraseña": deja poner una nueva sin la actual, por 15 minutos y solo a esa
  // cuenta. Solo si de verdad vino de la recuperación (no de entrar con Google o confirmar el correo).
  const s = r?.data.session;
  if (ok && s && next === RECOVERY_PATH
      && esRecuperacion({ type, metodos: metodosDeSesion(s.access_token), recoverySentAt: s.user.recovery_sent_at })) {
    res.cookies.set(RECOVERY_COOKIE, s.user.id, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: RECOVERY_PATH, maxAge: 900 });
  }
  return res;
}
