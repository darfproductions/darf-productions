import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
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
    <main className="pb-10">
      <PageHeading eyebrow="Fan Zone" title="Detrás del telón">
        Hola, {nombre}. Videos, fotos, documentos y más de cada producción, solo para la comunidad DARF.
      </PageHeading>
      <ul className="mx-auto grid max-w-[1440px] gap-5 px-5 md:grid-cols-3 md:px-16">
        {productions.map((p) => {
          const t = getTheme(p);
          const n = counts.get(p.id) ?? 0;
          return (
            <li key={p.id}>
              <Link href={`/fan-zone/${p.id}`} className="block overflow-hidden rounded-2xl bg-telon">
                <div className="relative aspect-[16/9] overflow-hidden" style={{ background: t?.fondo }}>
                  {t && <ArtFill theme={t} alt="" sizes="(min-width: 768px) 30vw, 100vw" />}
                </div>
                <div className="flex items-center justify-between px-5 py-4">
                  <span className="text-lg font-bold">{p.nombre}</span>
                  <span className="text-sm text-texto-3">{n ? `${n} ${n === 1 ? "contenido" : "contenidos"}` : "Próximamente"}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
