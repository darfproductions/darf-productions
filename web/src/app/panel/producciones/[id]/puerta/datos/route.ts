import { NextResponse } from "next/server";
import { conteoPuerta, listaPuerta } from "../actions";

// Puerta: el contador «Entraron X de Y» y la lista para trabajar sin internet, por GET. Antes eran acciones del
// servidor, y esas se atienden de una en una en el celular: mientras bajaba la lista, el escaneo esperaba atrás
// (y a los 3 s se iba a «sin conexión»). Así el escaneo nunca espera. Los permisos los revisa la base.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const funcion = sp.get("funcion") ?? "";
  if (!funcion) return NextResponse.json(null, { status: 400 });
  const datos = sp.get("que") === "lista" ? await listaPuerta(funcion) : await conteoPuerta(funcion);
  return NextResponse.json(datos, { headers: { "Cache-Control": "private, no-store" } });
}
