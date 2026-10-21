import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductionView } from "@/components/ProductionView";
import { getProduction } from "@/lib/productions";
import { cleanSellerCode } from "@/lib/seller-rules";
import { getSession } from "@/lib/auth";
import { getCapa } from "@/lib/obra-capa";

// Página de obra: una sola plantilla para todas las producciones (ver ProductionView).

export async function generateMetadata({ params }: PageProps<"/producciones/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProduction(slug);
  if (!data) return { title: "Producción" };
  const p = data.production;
  const description = p.frase?.trim() || `Funciones, boletos, elenco y canciones de ${p.nombre}, una producción de DARF Productions.`;
  return {
    title: p.nombre,
    description,
    alternates: { canonical: `/producciones/${p.id}` },
    openGraph: { title: `${p.nombre} · DARF Productions`, description, url: `/producciones/${p.id}` },
  };
}

export default async function ProductionPage({ params, searchParams }: PageProps<"/producciones/[slug]">) {
  const { slug } = await params;
  // ?v=CODIGO: link de un vendedor; el código pasa a "Elegir asientos" (0050).
  const vendedor = cleanSellerCode((await searchParams).v);
  const data = await getProduction(slug);
  if (!data) notFound();
  // 0119: los socios del Club Fan ven los cambios publicados solo para fans.
  const capa = (await getSession()) ? await getCapa(data.production.id, "fans") : {};
  return <ProductionView data={data} vendedor={vendedor} capa={capa} />;
}
