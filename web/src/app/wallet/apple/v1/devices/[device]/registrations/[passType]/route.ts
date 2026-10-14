import { NextResponse } from "next/server";
import { configPara, DISPOSITIVO, vacio } from "@/lib/apple-servicio";
import { createClient } from "@/lib/supabase/server";

// PassKit: qué pases de este iPhone cambiaron desde la última vez (passesUpdatedSince).
export async function GET(req: Request, ctx: RouteContext<"/wallet/apple/v1/devices/[device]/registrations/[passType]">) {
  const { device, passType } = await ctx.params;
  if (!configPara(passType) || !DISPOSITIVO.test(device)) return vacio(404);
  const desde = new URL(req.url).searchParams.get("passesUpdatedSince");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("wallet_series_cambiadas", {
    p_device: device, p_desde: desde && /^\d{1,19}$/.test(desde) ? desde : null,
  });
  if (error) return vacio(500);
  const r = data as { serials: string[]; ultimo: string | null } | null;
  if (!r?.serials.length) return vacio(204);
  return NextResponse.json({ serialNumbers: r.serials, lastUpdated: r.ultimo ?? "0" });
}
