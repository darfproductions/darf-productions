import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { RECOVERY_COOKIE, RECOVERY_PATH, safeNext } from "@/lib/auth";
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

  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;

  const res = NextResponse.redirect(new URL(ok ? next : "/entrar?error=enlace", url.origin));
  // Enlace de "olvidé mi contraseña": deja poner una nueva sin la actual, por 15 minutos.
  if (ok && next === RECOVERY_PATH) {
    res.cookies.set(RECOVERY_COOKIE, "1", { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: RECOVERY_PATH, maxAge: 900 });
  }
  return res;
}
