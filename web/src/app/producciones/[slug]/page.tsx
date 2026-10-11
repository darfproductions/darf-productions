import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductionView } from "@/components/ProductionView";
import { getProduction } from "@/lib/productions";

// Página de obra: una sola plantilla para todas las producciones (ver ProductionView).

export async function generateMetadata({ params }: PageProps<"/producciones/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProduction(slug);
  return { title: data?.production.nombre ?? "Producción" };
}

export default async function ProductionPage({ params }: PageProps<"/producciones/[slug]">) {
  const { slug } = await params;
  const data = await getProduction(slug);
  if (!data) notFound();
  return <ProductionView data={data} />;
}
