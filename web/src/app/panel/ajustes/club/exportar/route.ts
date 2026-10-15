import { NextResponse } from "next/server";
import { getSocios } from "@/lib/club-socios";
import { numeroSocio } from "@/lib/fanzone-rules";
import { casa } from "@/lib/panel-nav";
import { csv } from "@/lib/pago-rules";
import { requirePanel } from "@/lib/permissions";

// Base del Club Fan en CSV para Excel (0112). Solo casa.club; la base vuelve a revisar.
export async function GET() {
  const access = await requirePanel("/panel/ajustes/club");
  if (!casa(access, "casa.club")) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const socios = await getSocios();
  const cuerpo = csv([
    ["Número de socio", "Nombre", "Correo", "Teléfono", "Nacimiento", "Producciones", "Visitas", "Compras", "Boletos", "Total comprado", "Última compra", "Socio desde"],
    ...socios.map((s) => [numeroSocio(s.numero), s.nombre, s.email, s.telefono, s.fecha_nacimiento, s.producciones, s.visitas, s.compras, s.boletos,
      Number(s.gastado), s.ultima_compra?.slice(0, 10), s.desde.slice(0, 10)]),
  ]);
  return new Response(cuerpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="club-fan-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
