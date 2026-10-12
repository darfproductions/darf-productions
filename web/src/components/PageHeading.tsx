// Encabezado común de las páginas internas.
export function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden="true" className="haz absolute inset-0 opacity-60" />
      <div className="relative mx-auto flex max-w-[1440px] flex-col gap-5 px-5 pb-12 pt-12 md:px-16 md:pb-14 md:pt-20">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display text-[clamp(2.6rem,7vw,6rem)]">{title}</h1>
        {children && <div className="lead max-w-2xl">{children}</div>}
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
