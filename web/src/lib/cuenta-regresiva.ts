// Cuenta regresiva: función pura (cuenta-regresiva.test.ts).

/** Días, horas y minutos que faltan; en cero si ya pasó. Redondea los minutos hacia arriba. */
export function partesRestantes(ms: number): { dias: number; horas: number; minutos: number } {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  return { dias: Math.floor(total / 1440), horas: Math.floor((total % 1440) / 60), minutos: total % 60 };
}

/** Fecha del estreno si todavía no llega: la primera función con fecha. */
export function fechaEstreno(funciones: { starts_at: string | null }[], ahora: Date = new Date()): string | null {
  const fechas = funciones.map((f) => f.starts_at).filter((x): x is string => !!x).sort();
  const primera = fechas[0];
  return primera && new Date(primera).getTime() > ahora.getTime() ? primera : null;
}
