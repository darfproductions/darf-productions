// Lista antes del cierre de temporada (Bloque 4C): lo que conviene dejar resuelto antes de pasar la
// obra al archivo. Solo las órdenes por aprobar impiden cerrar (la base también lo revisa). Puro,
// con pruebas en cierre-lista.test.ts.

export type DatosCierre = {
  pid: string;
  ordenesPendientes: number;
  /** Funciones con fecha que aún no pasa (sin cancelar). */
  funcionesPorVenir: number;
  /** Órdenes aprobadas de funciones canceladas: dinero por devolver. */
  reembolsos: number;
  adeudos: number;
  ofertasSinResponder: number;
  documentosPorRevisar: number;
  fotosGaleria: number;
  creditos: number;
};

export type PuntoCierre = { clave: string; texto: string; ok: boolean; bloquea: boolean; detalle?: string; href: string };

const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

export function listaCierre(d: DatosCierre): { puntos: PuntoCierre[]; puedeCerrar: boolean; pendientes: number } {
  const base = `/panel/producciones/${d.pid}`;
  const puntos: PuntoCierre[] = [
    { clave: "ordenes", texto: "Sin órdenes de boletos por aprobar", ok: d.ordenesPendientes === 0, bloquea: true,
      detalle: d.ordenesPendientes ? `${n(d.ordenesPendientes, "orden espera", "órdenes esperan")} aprobación o rechazo. Sin esto no se puede cerrar.` : undefined,
      href: `${base}/boletos?estado=pendiente` },
    { clave: "funciones", texto: "Ya pasaron todas las funciones", ok: d.funcionesPorVenir === 0, bloquea: false,
      detalle: d.funcionesPorVenir ? `${n(d.funcionesPorVenir, "función aún no pasa", "funciones aún no pasan")}: al cerrar se quita su venta.` : undefined,
      href: `${base}/boletos/funciones` },
    { clave: "reembolsos", texto: "Reembolsos de funciones canceladas", ok: d.reembolsos === 0, bloquea: false,
      detalle: d.reembolsos ? `${n(d.reembolsos, "orden aprobada", "órdenes aprobadas")} de funciones canceladas: confirma que ya se devolvió el dinero.` : undefined,
      href: `${base}/boletos/funciones` },
    { clave: "adeudos", texto: "Mensualidades al corriente", ok: d.adeudos === 0, bloquea: false,
      detalle: d.adeudos ? `${n(d.adeudos, "persona con pagos vencidos", "personas con pagos vencidos")}.` : undefined,
      href: `${base}/expedientes/adeudos?ver=vencidos` },
    { clave: "ofertas", texto: "Ofertas de papel respondidas", ok: d.ofertasSinResponder === 0, bloquea: false,
      detalle: d.ofertasSinResponder ? `${n(d.ofertasSinResponder, "oferta sin respuesta", "ofertas sin respuesta")}.` : undefined,
      href: `${base}/elenco` },
    { clave: "documentos", texto: "Documentos revisados", ok: d.documentosPorRevisar === 0, bloquea: false,
      detalle: d.documentosPorRevisar ? `${n(d.documentosPorRevisar, "documento por revisar", "documentos por revisar")}.` : undefined,
      href: `${base}/expedientes?docs=subidos` },
    { clave: "creditos", texto: "Elenco y equipos en los créditos", ok: d.creditos > 0, bloquea: false,
      detalle: d.creditos ? undefined : "La página de archivo se verá sin elenco.", href: `${base}/elenco` },
    { clave: "galeria", texto: "Galería de fotos para el archivo", ok: d.fotosGaleria > 0, bloquea: false,
      detalle: d.fotosGaleria ? undefined : "La página de archivo se verá sin fotos de la obra.", href: `${base}/fanzone` },
  ];
  return { puntos, puedeCerrar: d.ordenesPendientes === 0, pendientes: puntos.filter((p) => !p.ok).length };
}
