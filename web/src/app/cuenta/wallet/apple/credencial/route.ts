import { NextResponse } from "next/server";
import { crearPkpass } from "@/lib/apple-wallet";
import { credencialWallet, esFallo } from "@/lib/wallet-datos";
import { walletAppleConfig } from "@/lib/wallet-env";
import { respuestaPkpass } from "@/lib/wallet-respuestas";

// Mi credencial (gafete o Club Fan) en Apple Wallet.
export async function GET() {
  const c = walletAppleConfig();
  if (!c) return NextResponse.json({ error: "Apple Wallet todavía no está disponible." }, { status: 503 });
  const cr = await credencialWallet();
  if (esFallo(cr)) return NextResponse.json({ error: cr.error }, { status: cr.status });
  return respuestaPkpass(await crearPkpass(c, cr.pase, { logo: cr.logo, foto: cr.foto }), "DARF-credencial");
}
