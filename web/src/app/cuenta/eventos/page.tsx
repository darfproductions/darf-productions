import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { ArtFill } from "@/components/PosterArt";
import { requireSession } from "@/lib/auth";
import { getEventosAsistidos, getTheme } from "@/lib/historial";
import { formatPerformanceDate } from "@/lib/productions";

export const metadata: Metadata = { title: "Eventos asistidos" };

// Eventos asistidos (bloque 5): funciones a las que entraste con tus boletos.
export default async function Eventos() {
  const session = await requireSession("/cuenta/eventos");
  const eventos = await getEventosAsistidos(session.userId);
  return (
    <main className="pb-24">
      <PageHeading eyebrow="Mi cuenta" title="Eventos asistidos">
        Las funciones a las que ya fuiste. Cada boleto cuenta cuando se valida en la entrada.
      </PageHeading>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 md:px-16">
        <Link href="/cuenta" className="text-sm font-bold text-lila">← Mi cuenta</Link>
        {eventos.length === 0 ? (
          <p className="tarjeta p-6 text-texto-2">Aquí aparecerán las funciones a las que vayas. <Link href="/cartelera" className="font-bold text-lila">Ver cartelera →</Link></p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {eventos.map((e) => {
              const t = getTheme(e.obra);
              return (
                <li key={e.performanceId}>
                  <Link href={`/producciones/${e.obra.id}`} className="tarjeta tarjeta-hover block">
                    <div className="relative aspect-[16/9] overflow-hidden" style={{ background: t?.fondo ?? "var(--telon-2)" }}>
                      {t ? <ArtFill theme={t} alt={e.obra.nombre} sizes="(min-width: 1024px) 30vw, 100vw" /> : <span className="titular absolute inset-x-5 bottom-5 text-2xl">{e.obra.nombre}</span>}
                      <span className="chip chip-oro absolute left-4 top-4 bg-sala/70 backdrop-blur">✓ Asististe</span>
                    </div>
                    <div className="flex flex-col gap-1 px-5 py-4">
                      <strong className="text-lg">{e.obra.nombre}</strong>
                      <span className="text-[12.5px] capitalize text-texto-3">{formatPerformanceDate(e.funcion)} · {e.boletos} {e.boletos === 1 ? "boleto" : "boletos"}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
