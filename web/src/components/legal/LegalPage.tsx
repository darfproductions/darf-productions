import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import type { LegalDoc } from "@/content/legal";

const OTROS = [
  { href: "/privacidad", label: "Aviso de privacidad" },
  { href: "/terminos", label: "Términos de uso y compra" },
  { href: "/reembolsos", label: "Cambios y reembolsos" },
];

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Legal" title={doc.titulo}>{doc.resumen}</PageHeading>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-5 md:px-16">
        <article className="flex max-w-3xl flex-col gap-8">
          {doc.secciones.map((s) => (
            <section key={s.titulo} className="flex flex-col gap-3">
              <h2 className="titular text-xl">{s.titulo}</h2>
              {s.parrafos.map((p, i) => <p key={i} className="leading-relaxed text-texto-2">{p}</p>)}
            </section>
          ))}
        </article>
        <nav aria-label="Documentos legales" className="flex flex-wrap gap-3 text-sm">
          {OTROS.filter((o) => o.href !== `/${doc.slug}`).map((o) => (
            <Link key={o.href} href={o.href} className="rounded-full border border-white/20 px-4 py-2 font-semibold hover:border-white/50">{o.label} →</Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
