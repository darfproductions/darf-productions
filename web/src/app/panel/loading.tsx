// Mientras carga una página del panel: un aviso discreto en lugar de la pantalla quieta.
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[50dvh] max-w-[1440px] items-center justify-center px-5" aria-busy="true">
      <p role="status" className="flex items-center gap-3 text-sm font-semibold text-texto-3">
        <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-texto-3 border-t-transparent" />
        Cargando…
      </p>
    </main>
  );
}
