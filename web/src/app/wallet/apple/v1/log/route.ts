import { vacio } from "@/lib/apple-servicio";

// PassKit: el iPhone reporta errores del web service (solo se anotan en el registro de Vercel).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { logs?: unknown } | null;
  const logs = Array.isArray(body?.logs) ? body.logs.slice(0, 20) : [];
  for (const l of logs) console.warn("wallet apple log:", String(l).slice(0, 500));
  return vacio(200);
}
