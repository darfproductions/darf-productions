// Encabezado común de las páginas internas.
export function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 pb-10 pt-6 md:px-16 md:pt-12">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-texto-3">{eyebrow}</p>
      <h1 className="titular text-4xl md:text-6xl">{title}</h1>
      {children && <div className="max-w-2xl text-lg leading-relaxed text-texto-2">{children}</div>}
    </div>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-t` : undefined} className="flex flex-col gap-4">
      <h2 id={id ? `${id}-t` : undefined} className="titular text-2xl">{title}</h2>
      {children}
    </section>
  );
}
