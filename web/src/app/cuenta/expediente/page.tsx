import type { Metadata } from "next";
import Link from "next/link";
import { ExpedienteForm } from "@/components/ExpedienteForm";
import { ExpedienteAviso } from "@/components/ExpedienteAviso";
import { Icono } from "@/components/Icono";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";
import { getMiExpedienteFalta } from "@/lib/expediente-aviso";
import { edad, type PersonFile } from "@/lib/member-rules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi expediente" };

// 0160: mi expediente personal (el mismo en todas mis obras), para llenarlo sin entrar a una obra.
export default async function MiExpediente() {
  const session = await requireSession("/cuenta/expediente");
  const supabase = await createClient();
  const [{ data }, faltan] = await Promise.all([supabase.rpc("mi_expediente"), getMiExpedienteFalta()]);
  const d = data as (PersonFile & { fecha_nacimiento_cuenta?: string | null }) | null;
  const f: PersonFile | null = d ? { ...d, fecha_nacimiento: d.fecha_nacimiento ?? d.fecha_nacimiento_cuenta ?? null } : null;
  const e = edad(f?.fecha_nacimiento ?? null);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-16 md:px-8">
      <PageHeading eyebrow="Mi cuenta" title="Mi expediente">
        Tus datos personales, de salud y de emergencia. Es uno solo y se usa en todas tus producciones; solo lo ve la producción.
      </PageHeading>
      <Link href="/cuenta" className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Mi cuenta</Link>
      <ExpedienteAviso faltan={faltan} />
      {faltan && faltan.length === 0 && <p className="rounded-2xl bg-telon px-4 py-3 text-sm font-bold text-exito"><Icono nombre="check" /> Tu expediente está completo.</p>}
      <section className="rounded-2xl bg-telon p-6">
        <ExpedienteForm pid="" uid={session.userId} f={f} esMenor={e !== null && e < 18} propio />
      </section>
    </main>
  );
}
