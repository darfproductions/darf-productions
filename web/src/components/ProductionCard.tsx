import Link from "next/link";
import { PosterFill } from "@/components/PosterArt";
import { getTheme, type Production } from "@/lib/productions";

export function ProductionCard({ p }: { p: Production }) {
  const t = getTheme(p.id);
  return (
    <Link href={`/producciones/${p.id}`} className="block overflow-hidden rounded-2xl bg-telon transition-transform hover:-translate-y-1">
      <div className="relative aspect-[16/9] overflow-hidden" style={{ background: t?.fondo }}>
        {t && <PosterFill theme={t} alt="" sizes="(min-width: 768px) 30vw, 100vw" />}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="text-lg font-bold">{p.nombre}</span>
        <span className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: p.concluded ? "var(--texto-3)" : t?.acento }}>
          {p.concluded ? "Archivo" : "En cartelera"}
        </span>
      </div>
    </Link>
  );
}
