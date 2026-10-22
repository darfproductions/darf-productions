import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { Icono } from "@/components/Icono";
import { getSession } from "@/lib/auth";
import { precioTexto } from "@/lib/showcase-rules";
import { getShowcases } from "@/lib/showcases";
import { ContratarForm } from "./ContratarForm";

export const metadata: Metadata = { title: "Contratar showcase", robots: { index: false } };

export default async function ContratarPage({ params }: PageProps<"/showcases/contratar/[plan]">) {
  const { plan } = await params;
  const [{ ajustes, planes, editor }, session] = await Promise.all([getShowcases(), getSession()]);
  const p = planes.find((x) => x.id === plan && x.activo);
  if (!p || !ajustes || (!ajustes.publicado && !editor)) notFound();
  return (
    <main className="pb-24">
      <PageHeading eyebrow="Contratar showcase" title={p.nombre}>
        {precioTexto(p.precio)}{p.precio != null && " MXN"}{p.resumen && ` · ${p.resumen}`}
      </PageHeading>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-5 md:px-16">
        <ContratarForm planId={p.id} planNombre={p.nombre} nombre={session?.profile?.nombre ?? ""} telefono={session?.profile?.telefono ?? ""} correo={session?.email ?? ""} />
        <Link href={`/showcases#plan-${p.id}`} className="text-sm font-bold text-texto-3 hover:text-texto"><Icono nombre="flecha-izq" /> Volver a los planes</Link>
      </div>
    </main>
  );
}
