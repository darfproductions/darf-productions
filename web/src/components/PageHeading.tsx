// Encabezado común de las páginas internas.
// `aside` va abajo a la derecha en computadora (por ejemplo, los filtros de la cartelera).
export function PageHeading({ eyebrow, title, children, aside }: { eyebrow: string; title: string; children?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden="true" className="haz absolute inset-0 opacity-60" />
      <div className="relative mx-auto flex max-w-[1440px] flex-col gap-8 px-5 pb-12 pt-12 md:px-16 md:pb-14 md:pt-20 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-5">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display text-[clamp(2.6rem,7vw,6rem)]">{title}</h1>
          {children && <div className="lead max-w-2xl">{children}</div>}
        </div>
        {aside}
      </div>
    </div>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-t` : undefined} className="flex flex-col gap-4">
      <h2 id={id ? `${id}-t` : undefined} className="h3-seccion">{title}</h2>
      {children}
    </section>
  );
}
