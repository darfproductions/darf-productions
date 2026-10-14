import { configPara, DISPOSITIVO, SERIAL, tokenApple, vacio } from "@/lib/apple-servicio";
import { createClient } from "@/lib/supabase/server";

// PassKit: el iPhone se registra (POST) o se da de baja (DELETE) para recibir cambios de un pase.
type Ctx = RouteContext<"/wallet/apple/v1/devices/[device]/registrations/[passType]/[serial]">;

export async function POST(req: Request, ctx: Ctx) {
  const { device, passType, serial } = await ctx.params;
  const token = tokenApple(req);
  if (!configPara(passType) || !SERIAL.test(serial) || !DISPOSITIVO.test(device)) return vacio(404);
  if (!token) return vacio(401);
  const body = (await req.json().catch(() => null)) as { pushToken?: unknown } | null;
  const push = typeof body?.pushToken === "string" ? body.pushToken : "";
  if (!/^[A-Za-z0-9]{1,200}$/.test(push)) return vacio(400);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("wallet_dispositivo_alta", { p_device: device, p_serial: serial, p_token: token, p_push: push });
  if (error) return vacio(500);
  return vacio(data === "nuevo" ? 201 : data === "existente" ? 200 : 401);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { device, passType, serial } = await ctx.params;
  const token = tokenApple(req);
  if (!configPara(passType) || !SERIAL.test(serial) || !DISPOSITIVO.test(device)) return vacio(404);
  if (!token) return vacio(401);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("wallet_dispositivo_baja", { p_device: device, p_serial: serial, p_token: token });
  if (error) return vacio(500);
  return vacio(data === true ? 200 : 401);
}
