import type { Instrumentation } from "next";

// Monitoreo básico de errores del servidor (Bloque 2): una línea por error en los registros de Vercel
// (Logs), con el código "digest" que ve la persona en la pantalla de error para poder buscarlo.
// Sin datos personales: solo la ruta (sin ?parámetros, que pueden traer códigos o tokens).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  console.error(JSON.stringify({
    darf: "error-servidor",
    digest: e?.digest ?? null,
    mensaje: e instanceof Error ? e.message.slice(0, 500) : String(err).slice(0, 500),
    ruta: request.path.split("?")[0],
    metodo: request.method,
    tipo: context.routeType,
    plantilla: context.routePath,
  }));
};
