import Image from "next/image";
import type { ProductionTheme } from "@/lib/productions";

// Arte de una producción sin deformar ni recortar mal el cartel:
// - Si la obra tiene título aparte (Showman, HSM): fondo del cartel + título encima.
// - Si el título ya viene dentro del cartel (Mamma Mia): cartel completo sobre
//   una versión desenfocada de sí mismo.

/** Rellena su contenedor (el contenedor define la proporción). Para tarjetas. */
export function PosterFill({ theme, alt, sizes }: { theme: ProductionTheme; alt: string; sizes: string }) {
  if (theme.titulo) {
    return (
      <>
        <Image src={theme.hero} alt="" fill sizes={sizes} className="object-cover" />
        <div className="absolute inset-0 bg-black/25" />
        <Image src={theme.titulo} alt={alt} className="absolute left-1/2 top-1/2 w-[72%] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]" sizes={sizes} />
      </>
    );
  }
  return (
    <>
      <Image src={theme.hero} alt="" fill sizes="10vw" className="scale-125 object-cover opacity-60 blur-2xl" />
      <Image src={theme.hero} alt={alt} fill sizes={sizes} className="object-contain" />
    </>
  );
}

/** Cartel completo en su proporción natural, como pieza protagonista del hero. */
export function PosterFull({ theme, alt, priority }: { theme: ProductionTheme; alt: string; priority?: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-[0_30px_90px_-20px_var(--obra-acento)] ring-1 ring-white/15"
      style={{ aspectRatio: `${theme.hero.width} / ${theme.hero.height}` }}
    >
      <Image src={theme.hero} alt={theme.titulo ? "" : alt} fill priority={priority} sizes="(min-width: 1024px) 34vw, 80vw" className="object-cover" />
      {theme.titulo && (
        <Image src={theme.titulo} alt={alt} className="absolute left-1/2 top-[38%] w-[80%] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_8px_24px_rgba(0,0,0,0.65)]" sizes="30vw" priority={priority} />
      )}
    </div>
  );
}

/** Fondo ambiental del hero: el cartel muy desenfocado + color y luz de la obra. */
export function PosterBackdrop({ theme }: { theme: ProductionTheme }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <Image src={theme.hero} alt="" fill sizes="20vw" className="scale-125 object-cover opacity-45 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_75%_40%,color-mix(in_srgb,var(--obra-acento)_22%,transparent),transparent_70%)]" />
      <div className="absolute -left-40 -top-40 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgb(68_14_213/0.35),transparent_65%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--obra-fondo)_0%,color-mix(in_srgb,var(--obra-fondo)_70%,transparent)_45%,color-mix(in_srgb,var(--obra-fondo)_35%,transparent)_100%),linear-gradient(180deg,transparent_55%,var(--obra-fondo)_100%)]" />
    </div>
  );
}
