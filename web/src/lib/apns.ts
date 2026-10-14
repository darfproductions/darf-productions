import { readFileSync } from "node:fs";
import http2 from "node:http2";
import type { WalletAppleConfig } from "@/lib/wallet-env";

// Avisos de Apple (APNs) para los pases de Wallet (0098): un aviso vacío con el certificado del
// Pass Type ID; el iPhone entonces pide el pase nuevo a /wallet/apple/v1/passes/….
// APNS_HOST y APNS_CA solo existen para las pruebas locales (servidor falso).

export type ResultadoApns = { enviados: number; invalidos: string[]; errores: number };

const TOKEN = /^[A-Za-z0-9]{1,200}$/;

/** Respuestas de Apple que significan "este teléfono ya no tiene el pase": se da de baja. */
export function tokenInvalido(status: number, razon: string | null): boolean {
  return status === 410 || (status === 400 && (razon === "BadDeviceToken" || razon === "DeviceTokenNotForTopic"));
}

export async function avisarApple(c: WalletAppleConfig, tokens: string[]): Promise<ResultadoApns> {
  const lista = [...new Set(tokens)].filter((t) => TOKEN.test(t));
  const r: ResultadoApns = { enviados: 0, invalidos: [], errores: 0 };
  if (!lista.length) return r;
  const host = process.env.APNS_HOST || "https://api.push.apple.com";
  const ca = process.env.APNS_CA ? readFileSync(process.env.APNS_CA, "utf8") : undefined;
  const sesion = http2.connect(host, { cert: c.cert, key: c.key, passphrase: c.passphrase, ...(ca ? { ca } : {}) });
  sesion.on("error", () => {});
  try {
    await Promise.all(lista.map((t) => new Promise<void>((listo) => {
      const req = sesion.request({
        ":method": "POST", ":path": `/3/device/${t}`,
        "apns-topic": c.passTypeId, "content-type": "application/json",
      });
      let status = 0, cuerpo = "";
      req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.on("response", (h) => { status = Number(h[":status"]); });
      req.setEncoding("utf8");
      req.on("data", (x: string) => { cuerpo += x; });
      req.on("close", () => {
        if (status === 200) r.enviados++;
        else {
          let razon: string | null = null;
          try { razon = (JSON.parse(cuerpo) as { reason?: string }).reason ?? null; } catch {}
          if (tokenInvalido(status, razon)) r.invalidos.push(t);
          else { r.errores++; console.error("apns", status || "sin respuesta", razon ?? ""); }
        }
        listo();
      });
      req.on("error", () => {});
      req.end("{}");
    })));
  } finally {
    sesion.close();
  }
  return r;
}
