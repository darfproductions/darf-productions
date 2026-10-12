// Cierre de temporada y reporte general (0053). Puro, con pruebas en season-rules.test.ts.

export type SeasonSummary = {
  obra: string;
  generado_at: string;
  asientos: number;
  funciones: { starts_at: string | null; boletos: number; asistieron: number; ingresos: number }[];
  ventas: { ordenes: number; pendientes: number; ingresos: number; descuentos: number; ordenes_taquilla: number; boletos: number; asistieron: number };
  vendedores: { nombre: string; codigo: string; ordenes: number; monto: number }[];
  taller: { cobrado: number; integrantes: number; activos: number };
  ensayos: { programados: number; presentes: number; faltas: number };
  elenco: Record<string, number>;
  audiciones: { convocatorias: number; solicitudes: number };
};

export type OverviewRow = {
  production_id: string; nombre: string; estado: string; funciones: number; funciones_futuras: number; asientos: number;
  boletos: number; asistieron: number; ingresos: number; pendientes: number; cobrado_taller: number;
  integrantes_activos: number; solicitudes: number; cerrado_at: string | null;
};

/** Porcentaje entero o null si no hay base. */
export function pct(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}

/** Ocupación de la temporada: boletos sobre (asientos × funciones). */
export function ocupacionTemporada(boletos: number, asientos: number, funciones: number): number | null {
  return pct(boletos, asientos * funciones);
}

/** Suma de las filas del reporte general. */
export function totales(rows: OverviewRow[]) {
  return rows.reduce(
    (t, r) => ({
      funciones: t.funciones + r.funciones,
      boletos: t.boletos + r.boletos,
      asistieron: t.asistieron + r.asistieron,
      ingresos: t.ingresos + Number(r.ingresos),
      cobrado_taller: t.cobrado_taller + Number(r.cobrado_taller),
      integrantes_activos: t.integrantes_activos + r.integrantes_activos,
      solicitudes: t.solicitudes + r.solicitudes,
      pendientes: t.pendientes + r.pendientes,
    }),
    { funciones: 0, boletos: 0, asistieron: 0, ingresos: 0, cobrado_taller: 0, integrantes_activos: 0, solicitudes: 0, pendientes: 0 },
  );
}

