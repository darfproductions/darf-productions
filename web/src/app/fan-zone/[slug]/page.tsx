import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { YouTube } from "@/components/YouTube";
import { requireSession } from "@/lib/auth";
import { getRehearsals } from "@/lib/production-content";
import { getProduction, getTheme, themeStyle } from "@/lib/productions";

export const metadata: Metadata = { title: "Fan Zone" };

export default async function FanZoneProductionPage({ params }: PageProps<"/fan-zone/[slug]">) {
  const { slug } = await params;
  await requireSession(`/fan-zone/${slug}`);
  const data = await getProduction(slug);
  if (!data) notFound();
  const p = data.production;
  const ensayos = await getRehearsals(p.id);

  return (
    <main style={themeStyle(getTheme(p))} className="pb-10">
      <PageHeading eyebrow="Fan Zone" title={p.nombre}>
        Videos de ensayo y material exclusivo de la producción.
      </PageHeading>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 md:px-16">
        {ensayos.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ensayos.map((v) => <YouTube key={v.youtube + v.titulo} id={v.youtube} title={v.titulo} />)}
          </div>
        ) : (
          <p className="rounded-2xl bg-telon p-8 text-lg">Los videos de esta producción se publicarán pronto.</p>
        )}
        <Link href="/fan-zone" className="font-bold text-violeta-claro">← Volver a la Fan Zone</Link>
      </div>
    </main>
  );
}
