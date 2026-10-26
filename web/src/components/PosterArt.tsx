import Image from "next/image";
import { isLight, type ProductionTheme } from "@/lib/themes";

// Piezas visuales de la plantilla de producción. Misma regla para todas las obras:
// imagen de ambiente de fondo y el logo dentro de una caja de tamaño fijo, para
// que todas las obras se vean del mismo tamaño sin importar la forma del logo.

/** Tarjeta: ambiente de fondo + logo centrado en caja fija. Rellena su contenedor. */
/** Con póster oficial (0093), la versión limpia reemplaza al ambiente; `imagenMovil` se usa en celular. */
export function ArtFill({ theme, alt, sizes, imagen, imagenMovil }: { theme: ProductionTheme; alt: string; sizes: string; imagen?: string | null; imagenMovil?: string | null }) {
  const fondo = imagen ?? theme.ambiente;
  return (
    <>
      {imagenMovil && imagenMovil !== fondo ? (
        <>
          <Image src={imagenMovil} alt="" fill sizes={sizes} className="object-cover md:hidden" />
          <Image src={fondo} alt="" fill sizes={sizes} className="hidden object-cover md:block" />
        </>
      ) : (
        <Image src={fondo} alt="" fill sizes={sizes} className="object-cover" />
      )}
      {/* Velo con el color de fondo de la obra (claro u oscuro) para que el logo resalte. */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, color-mix(in srgb, ${theme.fondo} 30%, transparent), color-mix(in srgb, ${theme.fondo} 65%, transparent))` }} />
      <div className="absolute inset-x-[14%] inset-y-[20%]">
        <Image src={theme.logo} alt={alt} fill sizes="25vw" className="object-contain" style={{ filter: isLight(theme.fondo) ? undefined : "drop-shadow(0 6px 18px rgb(0 0 0 / 0.6))" }} />
      </div>
    </>
  );
}

/** Logo como título del hero, en caja fija (mismo tamaño visual en todas las obras). */
export function ProductionLogo({ theme, nombre, priority }: { theme: ProductionTheme; nombre: string; priority?: boolean }) {
  // El logo usa su propia forma: uno ancho llena el ancho; uno cuadrado o vertical crece en
  // alto (hasta su tope) para que se vea del mismo peso que los anchos.
  return (
    <h1 className="flex">
      <Image
        src={theme.logo}
        alt={nombre}
        width={1400}
        height={1400}
        priority={priority}
        sizes="(min-width: 768px) 560px, 90vw"
        style={{ width: "auto", height: "auto" }}
        className="max-h-[170px] max-w-full object-contain object-left-bottom drop-shadow-[0_8px_24px_var(--obra-sombra)] md:max-h-[260px] md:max-w-[560px]"
      />
    </h1>
  );
}

/** Fondo del hero: imagen de ambiente + degradados con el color de la obra y la luz DARF. */
export function HeroBackdrop({ theme, alterno }: { theme: ProductionTheme; alterno?: { ancho: string; alto: string } | null }) {
  if (alterno) {
    // Póster alterno sin textos (Diego, 2026-10-26): en computadora va recorrido a la derecha (su centro junto al
    // logo y los textos, no debajo) y el degradado tapa el resto; en celular, a lo alto y con el velo abajo.
    return (
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <Image src={alterno.alto} alt="" fill priority sizes="100vw" className="object-cover object-top md:hidden" />
        <div className="absolute inset-y-0 left-[40%] right-0 hidden md:block">
          <Image src={alterno.ancho} alt="" fill priority sizes="60vw" className="object-cover object-[50%_30%]" />
        </div>
        <div className="absolute -left-40 -top-40 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgb(52_15_235/0.32),transparent_65%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--obra-fondo)_25%,color-mix(in_srgb,var(--obra-fondo)_55%,transparent)_55%,transparent_80%)] md:bg-[linear-gradient(90deg,var(--obra-fondo)_0%,var(--obra-fondo)_40%,color-mix(in_srgb,var(--obra-fondo)_65%,transparent)_50%,color-mix(in_srgb,var(--obra-fondo)_5%,transparent)_78%),linear-gradient(180deg,transparent_60%,var(--obra-fondo)_100%)]" />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <Image src={theme.ambiente} alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute -left-40 -top-40 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgb(52_15_235/0.32),transparent_65%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--obra-fondo)_0%,color-mix(in_srgb,var(--obra-fondo)_80%,transparent)_38%,color-mix(in_srgb,var(--obra-fondo)_15%,transparent)_75%),linear-gradient(180deg,transparent_60%,var(--obra-fondo)_100%)]" />
    </div>
  );
}
