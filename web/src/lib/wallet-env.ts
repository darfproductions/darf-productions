// Google Wallet (Diego 2026-10-12): la ÚNICA configuración secreta de la web. Solo se lee en el
// servidor (rutas y componentes de servidor); nunca lleva NEXT_PUBLIC_ y nunca va al navegador.
// Sin estas variables, los botones "Agregar a Google Wallet" no aparecen.
//   GOOGLE_WALLET_ISSUER_ID     número del emisor (Google Pay & Wallet Console)
//   GOOGLE_WALLET_CREDENTIALS   el JSON completo de la clave de la cuenta de servicio
//   GOOGLE_WALLET_API_BASE      solo para pruebas locales con un servidor falso

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
