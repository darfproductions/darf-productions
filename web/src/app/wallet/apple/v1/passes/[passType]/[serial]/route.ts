import { crearPkpass } from "@/lib/apple-wallet";
import { configPara, SERIAL, tokenApple, vacio } from "@/lib/apple-servicio";
import { paseActualizado } from "@/lib/wallet-datos";
import { origenPublico } from "@/lib/wallet-env";

// PassKit: el pase al día (lo pide el iPhone después de un aviso o al jalar hacia abajo).
export async function GET(req: Request, ctx: RouteContext<"/wallet/apple/v1/passes/[passType]/[serial]">) {
  const { passType, serial } = await ctx.params;
  const c = configPara(passType);
  const token = tokenApple(req);
  if (!c || !SERIAL.test(serial)) return vacio(404);
  if (!token) return vacio(401);
  const p = await paseActualizado(serial, token);
  if (!p) return vacio(401);
  // Fechas HTTP van al segundo.
  const cambiado = new Date(Math.floor(p.cambiado.getTime() / 1000) * 1000);
  const desde = Date.parse(req.headers.get("if-modified-since") ?? "");
  if (!Number.isNaN(desde) && cambiado.getTime() <= desde) return vacio(304);
  const buf = await crearPkpass(c, p.pase, p.apple, { url: `${origenPublico()}/wallet/apple`, token });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Last-Modified": cambiado.toUTCString(),
      "Cache-Control": "no-store",
    },
  });
}
