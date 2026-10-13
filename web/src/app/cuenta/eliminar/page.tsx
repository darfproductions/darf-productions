import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";
import { EliminarForm } from "./EliminarForm";

export const metadata: Metadata = { title: "Eliminar mi cuenta" };

// Eliminar mi cuenta (0077): explica qué se borra y qué se queda, y pide confirmación escrita.
export default async function Eliminar() {
  await requireSession("/cuenta/eliminar");
  return (
    <main className="pb-24">
      <PageHeading eyebrow="Mi cuenta" title="Eliminar mi cuenta">
        Puedes borrar tu cuenta cuando quieras. Esto no se puede deshacer.
      </PageHeading>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5">
        <Link href="/cuenta" className="text-sm font-bold text-lila">← Mi cuenta</Link>
        <section className="tarjeta flex flex-col gap-3 p-6 text-[15px] leading-relaxed text-texto-2">
          <h2 className="text-lg font-bold text-texto">Qué pasa al eliminarla</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Se borran tu perfil, tu foto, tus avisos, tu lugar en el Club Fan y tus registros.</li>
            <li>Tus compras pasadas se quedan para la contabilidad de DARF, pero sin tu nombre ni tu teléfono.</li>
            <li>Ya no podrás ver tus boletos ni tu historial.</li>
          </ul>
          <h2 className="pt-2 text-lg font-bold text-texto">Cuándo no se puede (todavía)</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Si tienes una orden pendiente de pago o boletos para una función que aún no pasa.</li>
            <li>Si tienes expediente o un papel en una producción, o vendiste boletos con tu código: en ese caso <Link href="/contacto" className="font-bold text-lila">escríbenos</Link> y lo hacemos contigo.</li>
          </ul>
        </section>
        <EliminarForm />
      </div>
    </main>
  );
}
