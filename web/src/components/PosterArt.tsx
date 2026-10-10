import Image from "next/image";
import type { ProductionTheme } from "@/lib/productions";

// Piezas visuales de la plantilla de producción. Misma regla para todas las obras:
// imagen de ambiente de fondo y el logo dentro de una caja de tamaño fijo, para
// que todas las obras se vean del mismo tamaño sin importar la forma del logo.

/** Tarjeta: ambiente de fondo + logo centrado en caja fija. Rellena su contenedor. */
export function ArtFill({ theme, alt, sizes }: { theme: ProductionTheme; alt: string; sizes: string }) {
  return (
    <>
      <Image src={theme.ambiente} alt="" fill sizes={sizes} className="object-cover" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(0_0_0/0.15),rgb(0_0_0/0.55))]" />
      <div className="absolute inset-x-[14%] inset-y-[20%]">
        <Image src={theme.logo} alt={alt} fill sizes="25vw" className="object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]" />
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
        className="object-contain object-left-bottom drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
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
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--obra-fondo)_0%,color-mix(in_srgb,var(--obra-fondo)_80%,transparent)_38%,color-mix(in_srgb,var(--obra-fondo)_15%,transparent)_75%),linear-gradient(180deg,color-mix(in_srgb,var(--obra-fondo)_55%,transparent)_0%,transparent_30%,transparent_60%,var(--obra-fondo)_100%)]" />
    </div>
  );
}
