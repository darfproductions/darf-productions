import Link from "next/link";
import { ArtFill } from "@/components/PosterArt";
import { ETIQUETA_ESTADO } from "@/lib/home-rules";
import { getTheme, type PublicProduction } from "@/lib/productions";

export function ProductionCard({ p }: { p: PublicProduction }) {
  const t = getTheme(p);
  return (
    <Link href={`/producciones/${p.id}`} className="block overflow-hidden rounded-2xl bg-telon transition-transform hover:-translate-y-1">
      <div className="relative aspect-[16/9] overflow-hidden" style={{ background: t?.fondo }}>
        {t && <ArtFill theme={t} alt="" sizes="(min-width: 768px) 30vw, 100vw" />}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="text-lg font-bold">{p.nombre}</span>
        <span className="shrink-0 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: p.estadoPublico === "archivo" ? "var(--texto-3)" : t?.acento }}>
          {ETIQUETA_ESTADO[p.estadoPublico]}
        </span>
      </div>
    </Link>
  );
}
