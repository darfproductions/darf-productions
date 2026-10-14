import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { walletAppleConfig, type WalletAppleConfig } from "@/lib/wallet-env";

// Web service de PassKit (0098): ayudas comunes de las rutas /wallet/apple/v1/… (las llama el iPhone,
// sin sesión). El pase se valida con su authenticationToken en la base (wallet_* RPCs).

/** "ApplePass <token>" → token (o null). */
export function tokenApple(req: Request): string | null {
  const m = /^ApplePass\s+([A-Za-z0-9]{32,128})$/.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

export const SERIAL = /^(boleto-[0-9a-f-]{36}|cred-[0-9a-f]{24})$/;
export const DISPOSITIVO = /^[A-Za-z0-9._-]{1,128}$/;

/** Config de Apple si el tipo de pase de la URL es el nuestro. */
export function configPara(passType: string): WalletAppleConfig | null {
  const c = walletAppleConfig();
  return c && c.passTypeId === passType ? c : null;
}

export const vacio = (status: number) => new NextResponse(null, { status });

export function mismoSecreto(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
