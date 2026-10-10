import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { ArtFill } from "@/components/PosterArt";
import { PRODUCTION_CONTENT } from "@/content/producciones";
import { requireSession } from "@/lib/auth";
import { getHomeData, getTheme } from "@/lib/productions";

export const metadata: Metadata = { title: "Fan Zone" };

export default async function FanZonePage() {
  const session = await requireSession("/fan-zone");
  const { productions } = await getHomeData();
  const nombre = session.profile?.nombre || session.email;

  return (
    <main className="pb-10">
      <PageHeading eyebrow="Fan Zone" title="Detrás del telón">
        Hola, {nombre}. Ensayos, videos y galerías de cada producción, solo para la comunidad DARF.
      </PageHeading>
      <ul className="mx-auto grid max-w-[1440px] gap-5 px-5 md:grid-cols-3 md:px-16">
        {productions.map((p) => {
          const t = getTheme(p.id);
          const n = PRODUCTION_CONTENT[p.id]?.ensayos.length ?? 0;
          return (
            <li key={p.id}>
              <Link href={`/fan-zone/${p.id}`} className="block overflow-hidden rounded-2xl bg-telon">
                <div className="relative aspect-[16/9] overflow-hidden" style={{ background: t?.fondo }}>
                  {t && <ArtFill theme={t} alt="" sizes="(min-width: 768px) 30vw, 100vw" />}
                </div>
                <div className="flex items-center justify-between px-5 py-4">
                  <span className="text-lg font-bold">{p.nombre}</span>
                  <span className="text-sm text-texto-3">{n ? `${n} ensayos` : "Próximamente"}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
