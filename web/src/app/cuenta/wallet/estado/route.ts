import { NextResponse } from "next/server";
import { walletAppleConfig, walletGoogleConfig } from "@/lib/wallet-env";

// Revisión rápida de Wallet: dice qué llaves de Vercel faltan o no tienen el formato esperado (sin mostrar ninguna).
// Si una sale en false, el botón de esa Wallet no aparece en la web ni funciona en la app.
const pem = (v: string | undefined) => {
  const t = (v ?? "").trim();
  if (!t) return false;
  return (t.includes("-----BEGIN") ? t : Buffer.from(t, "base64").toString("utf8")).includes("-----BEGIN");
};

export function GET() {
  const e = process.env;
  return NextResponse.json({
    apple: {
      listo: walletAppleConfig() !== null,
      APPLE_PASS_TYPE_ID: /^pass\.[\w.-]+$/.test((e.APPLE_PASS_TYPE_ID ?? "").trim()),
      APPLE_TEAM_ID: /^[A-Z0-9]{10}$/.test((e.APPLE_TEAM_ID ?? "").trim()),
      APPLE_PASS_CERT: pem(e.APPLE_PASS_CERT),
      APPLE_PASS_KEY: pem(e.APPLE_PASS_KEY),
      APPLE_WWDR_CERT: pem(e.APPLE_WWDR_CERT),
    },
    google: {
      listo: walletGoogleConfig() !== null,
      GOOGLE_WALLET_ISSUER_ID: /^\d{6,}$/.test((e.GOOGLE_WALLET_ISSUER_ID ?? "").trim()),
      GOOGLE_WALLET_CREDENTIALS: (() => { try { const c = JSON.parse(e.GOOGLE_WALLET_CREDENTIALS ?? ""); return !!c.client_email && String(c.private_key ?? "").includes("PRIVATE KEY"); } catch { return false; } })(),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
