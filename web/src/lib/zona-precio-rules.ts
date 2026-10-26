// Precio de una zona (0117/0118): cuántas funciones que vienen tienen otro precio que el que se va a guardar.
// Con prueba en zona-precio-rules.test.ts.

/** Funciones (que aún no pasan) cuyo precio en esta zona es distinto de `precio`, y esos precios sin repetir. */
export function preciosDistintos(precio: number, actuales: number[]): { n: number; precios: number[] } {
  const otras = actuales.filter((p) => Number(p) !== precio);
  return { n: otras.length, precios: [...new Set(otras.map(Number))].sort((a, b) => a - b) };
}
