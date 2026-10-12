import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FanZoneView } from "@/components/fanzone/FanZoneView";
import { requireSession } from "@/lib/auth";
import { getProduction } from "@/lib/productions";

export const metadata: Metadata = { title: "Fan Zone" };

// Fan Zone de una obra (0075): la misma zona del Club Fan, con la obra elegida.
export default async function FanZoneProductionPage({ params, searchParams }: PageProps<"/fan-zone/[slug]">) {
  const { slug } = await params;
  const session = await requireSession(`/fan-zone/${slug}`);
  const data = await getProduction(slug);
  if (!data) notFound();
  const sp = await searchParams;
  const nombre = session.profile?.nombre || session.email.split("@")[0];
  return <FanZoneView pid={data.production.id} cat={typeof sp.cat === "string" ? sp.cat : undefined} nombre={nombre} />;
}
