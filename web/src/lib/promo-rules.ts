// Reglas puras de las promos automáticas (0118). La base cobra igual: precio − redondeo(precio × % / 100, 2).

export type PromoZona = { zona: string; percent: number; nombre: string; hasta: string | null };

/** Precio con la promo (mismo redondeo que la base). */
export function conPromo(precio: number, percent: number): number {
  if (!percent) return precio;
  return Math.round((precio - Math.round(precio * percent) / 100) * 100) / 100;
}

/** La promo más grande de una función (para la etiqueta "−20%"). */
export function mejorPromo(lista: PromoZona[] | undefined): PromoZona | null {
  if (!lista?.length) return null;
  return lista.reduce((a, b) => (b.percent > a.percent ? b : a));
}

/** % de la zona en esa función (0 si no tiene). */
export function pctZona(lista: PromoZona[] | undefined, zona: string): number {
  return lista?.find((p) => p.zona === zona)?.percent ?? 0;
}
