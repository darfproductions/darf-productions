import { NextResponse } from "next/server";
import { ligaGuardar, upsert } from "@/lib/google-wallet";
import { claseCredencial, objetoCredencial } from "@/lib/google-wallet-pases";
import { origenSitio } from "@/lib/site-origin";
import { credencialWallet, esFallo } from "@/lib/wallet-datos";
import { origenPublico, walletGoogleConfig } from "@/lib/wallet-env";

// Mi credencial en Google Wallet. El objeto es uno por cuenta: si se regeneró el código, al volver a
// tocar el botón se actualiza el QR del pase que ya estaba guardado.
export async function GET() {
  const c = walletGoogleConfig();
  if (!c) return NextResponse.json({ error: "Google Wallet todavía no está disponible." }, { status: 503 });
  const cr = await credencialWallet();
  if (esFallo(cr)) return NextResponse.json({ error: cr.error }, { status: cr.status });
  const origen = await origenSitio();
  const img = `${origenPublico()}/wallet/img`;
  const objeto = objetoCredencial(c.issuerId, cr.pase, { logo: `${img}/${cr.fan ? "fan" : "darf"}`, hero: `${img}/banda-${cr.banda}` });
  try {
    await upsert(c, "genericClass", claseCredencial(c.issuerId));
    await upsert(c, "genericObject", objeto);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Google Wallet no respondió. Intenta de nuevo en un momento." }, { status: 502 });
  }
  return NextResponse.redirect(ligaGuardar(c.cuenta, origen, { genericObjects: [objeto.id] }), 303);
}
