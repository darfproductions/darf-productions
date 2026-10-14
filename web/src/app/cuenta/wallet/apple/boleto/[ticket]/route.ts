import { NextResponse } from "next/server";
import { crearPkpass } from "@/lib/apple-wallet";
import { boletoWallet, esFallo } from "@/lib/wallet-datos";
import { walletAppleConfig } from "@/lib/wallet-env";
import { respuestaPkpass } from "@/lib/wallet-respuestas";

// Boleto propio en Apple Wallet (.pkpass). Solo boletos aprobados y activos de funciones por venir.
export async function GET(_req: Request, ctx: RouteContext<"/cuenta/wallet/apple/boleto/[ticket]">) {
  const c = walletAppleConfig();
  if (!c) return NextResponse.json({ error: "Apple Wallet todavía no está disponible." }, { status: 503 });
  const b = await boletoWallet((await ctx.params).ticket);
  if (esFallo(b)) return NextResponse.json({ error: b.error }, { status: b.status });
  return respuestaPkpass(await crearPkpass(c, b.pase, { logo: b.logo, obra: b.imagenObra }), `DARF-${b.orden}`);
}
