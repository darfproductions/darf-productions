// Ficha completa de una persona (0141): qué pestañas se ven según los permisos que la base reporta por obra.
// Puro, con pruebas en persona-rules.test.ts.

export type FichaObra = {
  production_id: string; obra: string; rol: string; integrante: boolean; ingreso: string | null; baja_at: string | null; baja_motivo: string | null;
  documentos: boolean; pagos: boolean; asistencia: boolean; incidencias: boolean;
};
export type FichaDoc = { production_id: string; obra: string; nombre: string; obligatorio: boolean; archivo_path: string | null; subido_at: string | null; entregado_at: string | null };
export type FichaPago = { id: string; production_id: string; obra: string; folio: string; concepto: string; periodo: string | null; monto: number; metodo: string; registrado_at: string; anulado_at: string | null };
export type FichaAsistencia = { production_id: string; obra: string; citados: number; presentes: number; retardos: number; faltas: number; justificadas: number };
export type FichaUltimo = { production_id: string; obra: string; titulo: string; inicia: string; estado: string; minutos_tarde: number | null };
export type FichaIncidencia = { id: string; production_id: string; obra: string; tipo: string; nivel: string; descripcion: string; fecha: string; anulada_at: string | null };
export type PersonaFicha = { obras: FichaObra[]; documentos: FichaDoc[]; pagos: FichaPago[]; asistencia: FichaAsistencia[]; ultimos: FichaUltimo[]; incidencias: FichaIncidencia[] };

export type PestanaFicha = "obras" | "documentos" | "pagos" | "asistencia" | "incidencias";
export const PESTANAS_FICHA: { id: PestanaFicha; label: string }[] = [
  { id: "obras", label: "Obras" }, { id: "documentos", label: "Documentos" }, { id: "pagos", label: "Pagos" }, { id: "asistencia", label: "Asistencia" }, { id: "incidencias", label: "Incidencias" },
];

/** Obras siempre; las demás solo si en alguna obra tengo ese permiso. */
export function pestanasFicha(f: PersonaFicha | null): { id: PestanaFicha; label: string }[] {
  if (!f) return PESTANAS_FICHA.filter((p) => p.id === "obras");
  const puede = (k: "documentos" | "pagos" | "asistencia" | "incidencias") => f.obras.some((o) => o[k]);
  return PESTANAS_FICHA.filter((p) => p.id === "obras" || puede(p.id));
}

export function pestanaValida(t: unknown, disponibles: { id: PestanaFicha }[]): PestanaFicha {
  return disponibles.some((p) => p.id === t) ? (t as PestanaFicha) : "obras";
}

/** "Recibido el 3 de octubre" / "Subido, sin revisar" / "Pendiente". */
export function estadoDoc(d: Pick<FichaDoc, "archivo_path" | "entregado_at">): { label: string; ok: boolean } {
  if (d.entregado_at) return { label: `Recibido el ${new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(new Date(d.entregado_at))}`, ok: true };
  if (d.archivo_path) return { label: "Subido, sin revisar", ok: false };
  return { label: "Pendiente", ok: false };
}

/** Agrupa cualquier lista por obra, en el orden en que aparecen. */
export function porObra<T extends { production_id: string; obra: string }>(items: T[]): { production_id: string; obra: string; items: T[] }[] {
  const out: { production_id: string; obra: string; items: T[] }[] = [];
  for (const it of items) {
    let g = out.find((x) => x.production_id === it.production_id);
    if (!g) { g = { production_id: it.production_id, obra: it.obra, items: [] }; out.push(g); }
    g.items.push(it);
  }
  return out;
}
