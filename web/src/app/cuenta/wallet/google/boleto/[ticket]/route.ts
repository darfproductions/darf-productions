import { NextResponse } from "next/server";
import { ligaGuardar, upsert } from "@/lib/google-wallet";
import { claseBoleto, objetoBoleto } from "@/lib/google-wallet-pases";
import { origenSitio } from "@/lib/site-origin";
import { boletoWallet, esFallo } from "@/lib/wallet-datos";
import { origenPublico, walletGoogleConfig } from "@/lib/wallet-env";

// Boleto propio en Google Wallet: crea/actualiza la clase de la función y el objeto del boleto y
// manda a la persona a la liga de "Guardar en Google Wallet".
export async function GET(_req: Request, ctx: RouteContext<"/cuenta/wallet/google/boleto/[ticket]">) {
  const c = walletGoogleConfig();
  if (!c) return NextResponse.json({ error: "Google Wallet todavía no está disponible." }, { status: 503 });
  const b = await boletoWallet((await ctx.params).ticket);
  if (esFallo(b)) return NextResponse.json({ error: b.error }, { status: b.status });
  const origen = await origenSitio();
  const img = `${origenPublico()}/wallet/img`;
  const clase = claseBoleto(c.issuerId, b.funcionId, b.pase, b.obra, b.lugar, {
    logo: `${img}/darf`,
    hero: b.obraPublica && b.productionId ? `${img}/obra-${b.productionId}` : null,
  });
  const objeto = objetoBoleto(c.issuerId, clase.id, b.pase, { asiento: b.asiento, comprador: b.comprador, orden: b.orden });
  try {
    await upsert(c, "eventTicketClass", clase);
    await upsert(c, "eventTicketObject", objeto);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Google Wallet no respondió. Intenta de nuevo en un momento." }, { status: 502 });
  }
  return NextResponse.redirect(ligaGuardar(c.cuenta, origen, { eventTicketObjects: [objeto.id] }), 303);
}
