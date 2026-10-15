import { NextResponse } from "next/server";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { assetUrl, perfilUrl } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { tarjetaPng, type FormatoTarjeta } from "@/lib/tarjeta-elenco";

// Tarjeta para redes de una persona del Reparto o Ensamble (0110): ?f=post (4:5) o ?f=historia (9:16).
// Solo para quien arma el elenco o edita la obra; se descarga como PNG.
export async function GET(req: Request, ctx: RouteContext<"/panel/producciones/[id]/elenco/tarjeta/[credito]">) {
  const { id, credito } = await ctx.params;
  const access = await requirePanel(`/panel/producciones/${id}/elenco`);
  if (!can(access, id, "elenco.gestionar") && !can(access, id, "obra.editar")) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const formato: FormatoTarjeta = new URL(req.url).searchParams.get("f") === "historia" ? "historia" : "post";
  const supabase = await createClient();
  const [{ data: c }, { data: p }, { data: pro }] = await Promise.all([
    supabase.from("production_credits").select("tipo, papel, foto_path, person_id, people(nombre)").eq("id", credito).eq("production_id", id).maybeSingle(),
    supabase.from("productions").select("nombre, color_fondo, color_superficie, color_texto, color_acento, logo_path").eq("id", id).maybeSingle(),
    supabase.rpc("production_pro_info", { pid: id }),
  ]);
  const credit = c as unknown as { tipo: string; papel: string | null; foto_path: string | null; person_id: string; people: { nombre: string } | null } | null;
  if (!credit?.people || !p) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  const retrato = ((pro ?? []) as { person_id: string; retrato_path: string | null }[]).find((x) => x.person_id === credit.person_id)?.retrato_path;
  const png = await tarjetaPng({
    formato,
    obra: p.nombre as string,
    nombre: credit.people.nombre,
    papel: credit.tipo === "reparto" && credit.papel ? credit.papel : "Ensamble",
    fotoUrl: credit.foto_path ? assetUrl(credit.foto_path) : retrato ? perfilUrl(retrato) : null,
    logoUrl: p.logo_path ? assetUrl(p.logo_path as string) : null,
    colores: {
      fondo: (p.color_fondo as string) ?? "#0b0a12", superficie: (p.color_superficie as string) ?? "#16141f",
      texto: (p.color_texto as string) ?? "#f4f1f8", acento: (p.color_acento as string) ?? "#a48bff",
    },
  });
  const archivo = `${credit.people.nombre}-${formato}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "-");
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${archivo}.png"`, "Cache-Control": "private, no-store" },
  });
}
