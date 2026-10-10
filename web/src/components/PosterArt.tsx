import Image from "next/image";
import type { ProductionTheme } from "@/lib/productions";

// Piezas visuales del kit de producción. La regla es la misma para todas las
// obras: el cartel siempre completo (nunca estirado ni recortado), el logo como
// título y el fondo del hero con la imagen de ambiente (o el cartel desenfocado).

/** Cartel completo sobre una versión desenfocada de sí mismo. Rellena su contenedor (tarjetas). */
export function PosterFill({ theme, alt, sizes }: { theme: ProductionTheme; alt: string; sizes: string }) {
  return (
    <>
      <Image src={theme.cartel} alt="" fill sizes="10vw" className="scale-125 object-cover opacity-60 blur-2xl" />
      <Image src={theme.cartel} alt={alt} fill sizes={sizes} className="object-contain" />
    </>
  );
}

/** Cartel completo en su proporción natural, como pieza protagonista del hero. */
export function PosterFull({ theme, alt, priority }: { theme: ProductionTheme; alt: string; priority?: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-[0_30px_90px_-20px_var(--obra-acento)] ring-1 ring-black/10"
      style={{ aspectRatio: `${theme.cartel.width} / ${theme.cartel.height}` }}
    >
      <Image src={theme.cartel} alt={alt} fill priority={priority} sizes="(min-width: 1024px) 34vw, 80vw" className="object-cover" />
    </div>
  );
}

/** Logo de la obra como título del hero; el nombre en texto queda para buscadores y lectores de pantalla. */
export function ProductionLogo({ theme, nombre, priority }: { theme: ProductionTheme; nombre: string; priority?: boolean }) {
  return (
    <h1 className="w-full max-w-[560px]">
      <Image
        src={theme.logo}
        alt={nombre}
        priority={priority}
        sizes="560px"
        className="h-auto max-h-56 w-auto max-w-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      />
    </h1>
  );
}

/** Fondo ambiental del hero: imagen de ambiente (o cartel desenfocado) + color y luz de la obra. */
export function PosterBackdrop({ theme }: { theme: ProductionTheme }) {
  const img = theme.ambiente ?? theme.cartel;
  const claro = theme.modo === "claro";
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <Image
        src={img}
        alt=""
        fill
        sizes="100vw"
        className={theme.ambiente ? `object-cover ${claro ? "opacity-70" : "opacity-50"}` : "scale-125 object-cover opacity-45 blur-3xl"}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_75%_40%,color-mix(in_srgb,var(--obra-acento)_18%,transparent),transparent_70%)]" />
      {!claro && <div className="absolute -left-40 -top-40 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgb(68_14_213/0.35),transparent_65%)]" />}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--obra-fondo)_0%,color-mix(in_srgb,var(--obra-fondo)_75%,transparent)_45%,color-mix(in_srgb,var(--obra-fondo)_25%,transparent)_100%),linear-gradient(180deg,transparent_55%,var(--obra-fondo)_100%)]" />
    </div>
  );
}
