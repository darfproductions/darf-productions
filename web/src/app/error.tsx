"use client";

import Link from "next/link";

// Error inesperado en una página (la cabecera y el pie siguen visibles).
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-[1440px] flex-col justify-center gap-5 px-5 py-16 md:px-16">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-texto-3">Algo salió mal</p>
      <h1 className="titular text-4xl md:text-6xl">No pudimos cargar esta página</h1>
      <p className="max-w-xl text-lg text-texto-2">Puede ser un problema momentáneo de conexión. Intenta de nuevo; si sigue pasando, escríbenos.</p>
      {error.digest && <p className="text-xs text-texto-3">Si nos escribes, menciona este código: <span className="font-mono">{error.digest}</span></p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="boton-compra rounded-full px-6 py-3.5 text-sm font-bold uppercase tracking-[0.1em]">Intentar de nuevo</button>
        <Link href="/contacto" className="rounded-full border border-texto/50 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.1em]">Contacto</Link>
      </div>
    </main>
  );
}
