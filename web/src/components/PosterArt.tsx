import Image from "next/image";
import { isLight, type ProductionTheme } from "@/lib/themes";

// Piezas visuales de la plantilla de producción. Misma regla para todas las obras:
// imagen de ambiente de fondo y el logo dentro de una caja de tamaño fijo, para
// que todas las obras se vean del mismo tamaño sin importar la forma del logo.

/** Tarjeta: ambiente de fondo + logo centrado en caja fija. Rellena su contenedor. */
export function ArtFill({ theme, alt, sizes }: { theme: ProductionTheme; alt: string; sizes: string }) {
  return (
    <>
      <Image src={theme.ambiente} alt="" fill sizes={sizes} className="object-cover" />
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
  return (
    <h1 className="relative h-32 w-full max-w-[520px] md:h-48">
      <Image
        src={theme.logo}
        alt={nombre}
        fill
        priority={priority}
        sizes="520px"
        className="object-contain object-left-bottom drop-shadow-[0_8px_24px_var(--obra-sombra)]"
      />
    </h1>
  );
}

/** Fondo del hero: imagen de ambiente + degradados con el color de la obra y la luz DARF. */
export function HeroBackdrop({ theme }: { theme: ProductionTheme }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <Image src={theme.ambiente} alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute -left-40 -top-40 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgb(68_14_213/0.3),transparent_65%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--obra-fondo)_0%,color-mix(in_srgb,var(--obra-fondo)_80%,transparent)_38%,color-mix(in_srgb,var(--obra-fondo)_15%,transparent)_75%),linear-gradient(180deg,transparent_60%,var(--obra-fondo)_100%)]" />
    </div>
  );
}
