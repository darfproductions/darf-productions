import Image from "next/image";
import Link from "next/link";
import { getTheme, type Production } from "@/lib/productions";

export function ProductionCard({ p }: { p: Production }) {
  const t = getTheme(p.id);
  return (
    <Link href={`/producciones/${p.id}`} className="block overflow-hidden rounded-2xl bg-telon transition-transform hover:-translate-y-1">
      <div className="relative aspect-[16/9]" style={{ background: t?.fondo }}>
        {t && <Image src={t.hero} alt="" fill sizes="(min-width: 768px) 30vw, 100vw" className="object-cover" />}
        {t?.titulo && <Image src={t.titulo} alt="" className="absolute inset-x-[15%] top-1/2 w-[70%] -translate-y-1/2" sizes="25vw" />}
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
