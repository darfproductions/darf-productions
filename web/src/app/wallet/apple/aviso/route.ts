import { NextResponse } from "next/server";
import { avisarApple } from "@/lib/apns";
import { mismoSecreto, vacio } from "@/lib/apple-servicio";
import { createClient } from "@/lib/supabase/server";
import { walletAppleConfig, walletHookSecret } from "@/lib/wallet-env";

// Aviso de la base (0098, wallet_marcar vía pg_net): manda a Apple un aviso por cada iPhone con un
// pase que cambió. Los teléfonos que Apple ya no reconoce se dan de baja.
export async function POST(req: Request) {
  const secreto = walletHookSecret();
  const c = walletAppleConfig();
  if (!secreto || !c) return vacio(503);
  if (!mismoSecreto(req.headers.get("x-wallet-secret") ?? "", secreto)) return vacio(401);
  const body = (await req.json().catch(() => null)) as { tokens?: unknown } | null;
  const tokens = Array.isArray(body?.tokens) ? body.tokens.filter((t): t is string => typeof t === "string").slice(0, 2000) : [];
  const r = await avisarApple(c, tokens);
  if (r.invalidos.length) {
    const supabase = await createClient();
    await supabase.rpc("wallet_push_baja", { p_secret: secreto, p_tokens: r.invalidos });
  }
  return NextResponse.json({ enviados: r.enviados, bajas: r.invalidos.length, errores: r.errores });
}
