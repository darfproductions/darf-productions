import type { Metadata } from "next";
import { FanZoneView } from "@/components/fanzone/FanZoneView";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Fan Zone" };

// Fan Zone (0075): zona del Club Fan con todas las producciones.
export default async function FanZonePage({ searchParams }: PageProps<"/fan-zone">) {
  const session = await requireSession("/fan-zone");
  const sp = await searchParams;
  const nombre = session.profile?.nombre || session.email.split("@")[0];
  return <FanZoneView pid={null} cat={typeof sp.cat === "string" ? sp.cat : undefined} nombre={nombre} />;
}
