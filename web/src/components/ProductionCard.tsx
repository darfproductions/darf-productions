import Link from "next/link";
import { EstadoObra } from "@/components/EstadoObra";
import { ArtFill } from "@/components/PosterArt";
import { getTheme, posterUrl, type PublicProduction } from "@/lib/productions";

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" }).format(new Date(iso));

/** Línea de apoyo de la tarjeta: fecha (próxima o última función) o temporada, y sede. */
export function lineaObra(p: PublicProduction): string {
  const cuando = p.estadoPublico === "archivo" ? p.ultima : p.proxima;
  return [cuando ? fecha(cuando) : p.temporada ? `Temporada ${p.temporada}` : null, p.venue].filter(Boolean).join(" · ") || "Detalles por anunciar";
}

// Tarjeta de obra (guía): póster 16:9 con ambiente (o el póster oficial), tinte de la obra y logo; estado arriba;
// nombre, fecha y sede, y flecha en círculo. Al pasar el mouse sube y la imagen crece.
export function ProductionCard({ p, sizes = "(min-width: 768px) 45vw, 100vw", cta }: { p: PublicProduction; sizes?: string; /** Texto en lugar de la flecha (p. ej. "Galería y créditos"). */ cta?: string }) {
  const t = getTheme(p);
  // Póster oficial (0093): en celular la tarjeta es 3:4 con el póster limpio; en computadora, el 16:9.
  const movil = posterUrl(p, "tarjeta-celular");
  const ancha = posterUrl(p, "destacada");
  return (
    <Link href={`/producciones/${p.id}`} className="tarjeta tarjeta-hover group block">
      <div className={`relative overflow-hidden ${movil ? "aspect-[3/4] md:aspect-[16/9]" : "aspect-[16/9]"}`} style={{ background: t?.fondo ?? "var(--telon-2)" }}>
        <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transition-none">
          {t ? <ArtFill theme={t} alt={p.nombre} sizes={sizes} imagen={ancha?.url} imagenMovil={movil?.url} /> : <span className="titular absolute inset-x-6 bottom-6 text-3xl">{p.nombre}</span>}
        </div>
        <EstadoObra estado={p.estadoPublico} className="absolute left-4 top-4 md:left-5 md:top-5" />
      </div>
      <div className="flex items-center justify-between gap-4 px-5 py-4 md:px-6 md:py-5">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-lg font-extrabold md:text-xl">{p.nombre}</span>
          <span className="truncate text-[12.5px] text-texto-3">{lineaObra(p)}</span>
          {cta && <span className="pt-1 text-[12.5px] font-bold text-oro-claro">{cta} →</span>}
        </span>
        {!cta && (
          <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-linea-2 transition-colors group-hover:border-white/50">→</span>
        )}
      </div>
    </Link>
  );
}
