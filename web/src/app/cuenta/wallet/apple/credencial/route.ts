import { NextResponse } from "next/server";
import { crearPkpass } from "@/lib/apple-wallet";
import { credencialWallet, esFallo, servicioApple } from "@/lib/wallet-datos";
import { walletAppleConfig } from "@/lib/wallet-env";
import { respuestaPkpass } from "@/lib/wallet-respuestas";

// Mi credencial (gafete o Club Fan) en Apple Wallet. Se actualiza sola (0098).
export async function GET() {
  const c = walletAppleConfig();
  if (!c) return NextResponse.json({ error: "Apple Wallet todavía no está disponible." }, { status: 503 });
  const cr = await credencialWallet();
  if (esFallo(cr)) return NextResponse.json({ error: cr.error }, { status: cr.status });
  const servicio = await servicioApple(cr.pase.serial, null);
  return respuestaPkpass(await crearPkpass(c, cr.pase, cr.apple, servicio), "DARF-credencial");
}
