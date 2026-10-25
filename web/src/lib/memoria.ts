// Memoria corta del servidor por clave (normalmente la persona). Cada instancia del servidor guarda la suya; nunca se
// comparte entre personas porque la clave es su id. Sirve para lo que se pide en cada página y casi no cambia
// (permisos, foto, pendientes): con mucha gente entrando a la vez, la base no recalcula lo mismo cada segundo.
// Los errores no se guardan (si el cálculo falla, la siguiente vez se vuelve a intentar).
export function memoriaCorta<T>(ms: number, max = 500) {
  const m = new Map<string, { at: number; v: Promise<T> }>();
  return {
    get(clave: string, calcular: () => Promise<T>): Promise<T> {
      const ahora = Date.now();
      const g = m.get(clave);
      if (g && ahora - g.at < ms) return g.v;
      // Se guarda la promesa: si llegan 10 a la vez, se calcula una sola vez.
      const v = calcular();
      m.set(clave, { at: ahora, v });
      v.catch(() => { if (m.get(clave)?.v === v) m.delete(clave); });
      if (m.size > max) for (const [k, x] of m) if (ahora - x.at >= ms) m.delete(k);
      return v;
    },
    olvidar(clave: string) { m.delete(clave); },
  };
}
