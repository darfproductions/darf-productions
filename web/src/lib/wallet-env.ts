// Apple y Google Wallet (Diego 2026-10-12/14): configuración secreta de la web. Solo se lee en el
// servidor (rutas y componentes de servidor); nunca lleva NEXT_PUBLIC_ y nunca va al navegador.
// Sin estas variables, los botones de cada Wallet no aparecen.
//   GOOGLE_WALLET_ISSUER_ID     número del emisor (Google Pay & Wallet Console)
//   GOOGLE_WALLET_CREDENTIALS   el JSON completo de la clave de la cuenta de servicio
//   GOOGLE_WALLET_API_BASE      solo para pruebas locales con un servidor falso
//   APPLE_PASS_TYPE_ID          p. ej. pass.com.darfproductions.wallet
//   APPLE_TEAM_ID               Team ID de la cuenta de Apple Developer
//   APPLE_PASS_CERT / APPLE_PASS_KEY / APPLE_WWDR_CERT   PEM (tal cual o en base64)
//   APPLE_PASS_KEY_PASSPHRASE   contraseña de la llave (si tiene)

export type CuentaServicio = { client_email: string; private_key: string; token_uri?: string };
export type WalletGoogleConfig = { issuerId: string; cuenta: CuentaServicio; apiBase: string; tokenUri: string };

export function walletGoogleConfig(): WalletGoogleConfig | null {
  const issuerId = (process.env.GOOGLE_WALLET_ISSUER_ID ?? "").trim();
  const raw = process.env.GOOGLE_WALLET_CREDENTIALS ?? "";
  if (!/^\d{6,}$/.test(issuerId) || !raw) return null;
  try {
    const cuenta = JSON.parse(raw) as CuentaServicio;
    if (!cuenta.client_email || !cuenta.private_key?.includes("PRIVATE KEY")) return null;
    const apiBase = (process.env.GOOGLE_WALLET_API_BASE ?? "").replace(/\/$/, "");
    return {
      issuerId, cuenta,
      apiBase: apiBase ? `${apiBase}/walletobjects/v1` : "https://walletobjects.googleapis.com/walletobjects/v1",
      tokenUri: apiBase ? `${apiBase}/token` : cuenta.token_uri || "https://oauth2.googleapis.com/token",
    };
  } catch {
    return null;
  }
}

export const walletGoogleActivo = (): boolean => walletGoogleConfig() !== null;

export type WalletAppleConfig = { passTypeId: string; teamId: string; cert: string; key: string; passphrase?: string; wwdr: string };

/** Acepta el PEM tal cual o codificado en base64 (más fácil de pegar en Vercel). */
function pem(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const texto = t.includes("-----BEGIN") ? t : Buffer.from(t, "base64").toString("utf8");
  return texto.includes("-----BEGIN") ? texto : null;
}

export function walletAppleConfig(): WalletAppleConfig | null {
  const passTypeId = (process.env.APPLE_PASS_TYPE_ID ?? "").trim();
  const teamId = (process.env.APPLE_TEAM_ID ?? "").trim();
  const cert = pem(process.env.APPLE_PASS_CERT);
  const key = pem(process.env.APPLE_PASS_KEY);
  const wwdr = pem(process.env.APPLE_WWDR_CERT);
  if (!/^pass\.[\w.-]+$/.test(passTypeId) || !/^[A-Z0-9]{10}$/.test(teamId) || !cert || !key || !wwdr) return null;
  const passphrase = process.env.APPLE_PASS_KEY_PASSPHRASE || undefined;
  return { passTypeId, teamId, cert, key, passphrase, wwdr };
}

export const walletAppleActivo = (): boolean => walletAppleConfig() !== null;
