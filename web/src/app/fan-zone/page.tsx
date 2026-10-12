import type { Metadata } from "next";
import Link from "next/link";
import { FanZoneHeading } from "@/components/FanZoneHeading";
import { ArtFill } from "@/components/PosterArt";
import { requireSession } from "@/lib/auth";
import { fanzoneCounts } from "@/lib/fanzone";
import { getHomeData, getTheme } from "@/lib/productions";

export const metadata: Metadata = { title: "Fan Zone" };

export default async function FanZonePage() {
  const session = await requireSession("/fan-zone");
  const [{ productions }, counts] = await Promise.all([getHomeData(), fanzoneCounts()]);
  const nombre = session.profile?.nombre || session.email;

  return (
    <main className="pb-24">
      <FanZoneHeading title={<>Detrás del <span className="txt-oro">telón</span></>}>
        Hola, {nombre}. Videos, fotos, documentos y más de cada producción, solo para la comunidad DARF.
      </FanZoneHeading>
      <ul className="mx-auto grid max-w-[1440px] gap-6 px-5 pt-12 sm:grid-cols-2 md:px-16 md:pt-16 lg:grid-cols-3">
        {productions.map((p) => {
          const t = getTheme(p);
          const n = counts.get(p.id) ?? 0;
          return (
            <li key={p.id}>
              <Link href={`/fan-zone/${p.id}`} className="tarjeta tarjeta-hover group block border-oro/25 hover:border-oro/60">
                <div className="relative aspect-[16/9] overflow-hidden" style={{ background: t?.fondo }}>
                  <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transition-none">
                    {t && <ArtFill theme={t} alt="" sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" />}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 px-5 py-4 md:px-6 md:py-5">
                  <span className="min-w-0 truncate text-lg font-extrabold">{p.nombre}</span>
                  <span className={`chip shrink-0 ${n ? "chip-oro" : "text-texto-3"}`}>{n ? `${n} ${n === 1 ? "contenido" : "contenidos"}` : "Próximamente"}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
