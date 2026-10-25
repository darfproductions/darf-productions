// Puerta sin internet (2026-10-25), reglas puras (con prueba en sin-conexion-rules.test.ts).
// Al abrir Puerta, el celular guarda la lista de boletos válidos de la función. Si la red no contesta, el boleto se
// revisa contra esa lista y la entrada queda en una fila que se sube sola al volver la señal. La base sigue siendo la
// que decide: al subir, cada entrada pasa por check_in_ticket igual que en línea.

export type BoletoLista = { t: string; lugar: string; nombre: string; entro: string | null };
export type ListaPuerta = { funcion: string; descargada: string; boletos: BoletoLista[] };
export type EntradaFila = { token: string; funcion: string; at: string };

export type ResultadoLocal =
  | { result: "ok"; lugar: string; nombre: string }
  | { result: "ya_usado"; lugar: string; nombre: string; entro: string }
  | { result: "no_en_lista" };

const limpio = (token: string) => token.trim().toLowerCase();

/** Revisa un boleto sin internet: está en la lista de esta función, y nadie entró con él (según la lista y este celular). */
export function validarLocal(lista: ListaPuerta, fila: EntradaFila[], token: string): ResultadoLocal {
  const t = limpio(token);
  const b = lista.boletos.find((x) => x.t === t);
  if (!b) return { result: "no_en_lista" };
  const local = fila.find((e) => e.token === t && e.funcion === lista.funcion);
  const entro = b.entro ?? local?.at ?? null;
  return entro ? { result: "ya_usado", lugar: b.lugar, nombre: b.nombre, entro } : { result: "ok", lugar: b.lugar, nombre: b.nombre };
}

/** Lo que el celular ya sabe que entró: marca el boleto en su lista (tras validar en línea o sin internet). */
export function marcarEntrada(lista: ListaPuerta, token: string, at: string): ListaPuerta {
  const t = limpio(token);
  return { ...lista, boletos: lista.boletos.map((b) => (b.t === t && !b.entro ? { ...b, entro: at } : b)) };
}

/** Lista nueva de la base sin perder lo que este celular dejó pasar y aún no sube. */
export function unirLista(nueva: ListaPuerta, fila: EntradaFila[]): ListaPuerta {
  const pend = new Map(fila.filter((e) => e.funcion === nueva.funcion).map((e) => [e.token, e.at]));
  return { ...nueva, boletos: nueva.boletos.map((b) => (b.entro || !pend.has(b.t) ? b : { ...b, entro: pend.get(b.t)! })) };
}

/** Entraron / vendidos con la lista guardada (sin internet). */
export function conteoLocal(lista: ListaPuerta, fila: EntradaFila[]): { vendidos: number; entraron: number } {
  const pend = new Set(fila.filter((e) => e.funcion === lista.funcion).map((e) => e.token));
  return { vendidos: lista.boletos.length, entraron: lista.boletos.filter((b) => b.entro || pend.has(b.t)).length };
}

export type Subida = "subida" | "doble" | "rechazada";

/** Qué pasó al subir una entrada hecha sin internet.
 *  - "subida": la base la registró ahora (o ya la tenía de este mismo celular: la validación en línea llegó tarde).
 *  - "doble": la base ya tenía una entrada ANTERIOR con ese boleto (otro celular sin señal lo dejó pasar).
 *  - "rechazada": la base dice que no valía (cancelado, sin aprobar, otra función). */
export function resultadoSubida(r: { result: string; checked_in_at?: string | null }, localAt: string): Subida {
  if (r.result === "ok") return "subida";
  if (r.result === "ya_usado") {
    const antes = r.checked_in_at ? Date.parse(r.checked_in_at) : NaN;
    return Number.isFinite(antes) && antes < Date.parse(localAt) - 5_000 ? "doble" : "subida";
  }
  return "rechazada";
}

/** ¿El error se debe a la red (y conviene validar sin internet)? */
export function esFallaDeRed(r: { result: string; message?: string } | null): boolean {
  return !r || (r.result === "error" && /conexi[oó]n|\bred\b|network|fetch|tiempo/i.test(r.message ?? ""));
}
