import { createSign } from "node:crypto";
import { walletGoogleConfig, type CuentaServicio, type WalletGoogleConfig } from "@/lib/wallet-env";

// Google Wallet por su API REST, sin librerías: JWT RS256 con crypto de Node.
// Flujo: crear/actualizar la clase y los objetos por API y luego mandar a la persona a la liga
// de guardar con un JWT corto que solo lleva los IDs (así se pueden actualizar después).

export type TipoRecurso = "eventTicketClass" | "eventTicketObject" | "genericClass" | "genericObject";

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

export function firmarJwt(payload: Record<string, unknown>, llavePem: string): string {
  const cuerpo = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  const firma = createSign("RSA-SHA256").update(cuerpo).sign(llavePem);
  return `${cuerpo}.${b64url(firma)}`;
}

let cache: { token: string; vence: number; email: string } | null = null;

async function tokenDeAcceso(c: WalletGoogleConfig): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  if (cache && cache.email === c.cuenta.client_email && cache.vence > ahora + 60) return cache.token;
  const assertion = firmarJwt({
    iss: c.cuenta.client_email, scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: c.tokenUri, iat: ahora, exp: ahora + 3600,
  }, c.cuenta.private_key);
  const r = await fetch(c.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`Google Wallet: no se pudo autenticar (${r.status}).`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  cache = { token: j.access_token, vence: ahora + Math.min(j.expires_in ?? 3600, 3000), email: c.cuenta.client_email };
  return j.access_token;
}

/** Crea el recurso o lo reemplaza si ya existía. */
export async function upsert(c: WalletGoogleConfig, tipo: TipoRecurso, recurso: { id: string } & Record<string, unknown>): Promise<void> {
  const token = await tokenDeAcceso(c);
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const url = `${c.apiBase}/${tipo}`;
  const existe = await fetch(`${url}/${encodeURIComponent(recurso.id)}`, { headers: h });
  if (existe.status !== 200 && existe.status !== 404) throw new Error(`Google Wallet: ${tipo} (${existe.status}).`);
  const r = existe.status === 404
    ? await fetch(url, { method: "POST", headers: h, body: JSON.stringify(recurso) })
    : await fetch(`${url}/${encodeURIComponent(recurso.id)}`, { method: "PUT", headers: h, body: JSON.stringify(recurso) });
  if (!r.ok) throw new Error(`Google Wallet: no se pudo guardar ${tipo} (${r.status}): ${(await r.text()).slice(0, 300)}`);
}

/** Liga "Agregar a Google Wallet" para objetos ya creados. */
export function ligaGuardar(cuenta: CuentaServicio, origen: string, objetos: { eventTicketObjects?: string[]; genericObjects?: string[] }): string {
  const payload: Record<string, { id: string }[]> = {};
  if (objetos.eventTicketObjects?.length) payload.eventTicketObjects = objetos.eventTicketObjects.map((id) => ({ id }));
  if (objetos.genericObjects?.length) payload.genericObjects = objetos.genericObjects.map((id) => ({ id }));
  const jwt = firmarJwt({ iss: cuenta.client_email, aud: "google", typ: "savetowallet", iat: Math.floor(Date.now() / 1000), origins: [origen], payload }, cuenta.private_key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

export { walletGoogleConfig };
