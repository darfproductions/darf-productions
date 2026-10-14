import { NextResponse } from "next/server";

/** Descarga de un .pkpass: Safari en iPhone lo abre directo en Wallet. */
export function respuestaPkpass(buf: Buffer, nombre: string): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${nombre.replace(/[^\w-]/g, "")}.pkpass"`,
      "Cache-Control": "private, no-store",
    },
  });
}
