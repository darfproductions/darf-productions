// Búsqueda de órdenes por código de venta (2026-10-29). Todas empiezan con "DARF-": en el panel solo se escribe el
// resto (como viene en el WhatsApp). Puro, con pruebas en codigo-orden.test.ts.

export const PREFIJO_ORDEN = "DARF-";

/** Lo que escribió la persona → código completo ("a1b2c3", "DARF-A1B2C3", " darf a1b2 c3 " → "DARF-A1B2C3").
 *  Vacío o con caracteres raros → "". */
export function codigoOrden(entrada: string): string {
  const limpio = entrada.toUpperCase().replace(/[\s-]+/g, "").replace(/^DARF/, "");
  return /^[A-Z0-9]{1,12}$/.test(limpio) ? `${PREFIJO_ORDEN}${limpio}` : "";
}

/** Solo la parte después de "DARF-" (para volver a mostrarla en la casilla). */
export function restoCodigo(codigo: string): string {
  return codigo.startsWith(PREFIJO_ORDEN) ? codigo.slice(PREFIJO_ORDEN.length) : codigo;
}
