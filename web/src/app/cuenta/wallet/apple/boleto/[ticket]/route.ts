import { NextResponse } from "next/server";
import { crearPkpass } from "@/lib/apple-wallet";
import { boletoWallet, esFallo, servicioApple } from "@/lib/wallet-datos";
import { walletAppleConfig } from "@/lib/wallet-env";
import { respuestaPkpass } from "@/lib/wallet-respuestas";

// Boleto propio en Apple Wallet (.pkpass). Solo boletos aprobados y activos de funciones por venir.
// Lleva el web service (0098) para que se actualice solo si cambia.
export async function GET(_req: Request, ctx: RouteContext<"/cuenta/wallet/apple/boleto/[ticket]">) {
  const c = walletAppleConfig();
  if (!c) return NextResponse.json({ error: "Apple Wallet todavía no está disponible." }, { status: 503 });
  const ticket = (await ctx.params).ticket;
  const b = await boletoWallet(ticket);
  if (esFallo(b)) return NextResponse.json({ error: b.error }, { status: b.status });
  const servicio = await servicioApple(b.pase.serial, ticket);
  return respuestaPkpass(await crearPkpass(c, b.pase, b.apple, servicio), `DARF-${b.orden}`);
}
