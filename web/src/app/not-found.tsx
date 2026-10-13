import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada" };

// 404 de la web pública (y de cualquier notFound() fuera del panel).
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-[1440px] flex-col justify-center gap-5 px-5 py-16 md:px-16">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-texto-3">Error 404</p>
      <h1 className="titular text-4xl md:text-6xl">Esta página no existe</h1>
      <p className="max-w-xl text-lg text-texto-2">Puede que la liga esté mal escrita o que la página ya no esté disponible.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/producciones" className="boton-compra rounded-full px-6 py-3.5 text-sm font-bold uppercase tracking-[0.1em]">Ver producciones</Link>
        <Link href="/" className="rounded-full border border-texto/50 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.1em]">Ir al inicio</Link>
      </div>
    </main>
  );
}
