// Tipos de producción (0139, fase 4 del panel): un campo que enciende y apaga pestañas y textos de la obra.
// Funciones puras: tipo-obra-rules.test.ts. Nada se borra: lo que no aplica se ve en "Más", marcado.

export type TipoObra = "profesional" | "showcase" | "taller" | "escuela";
export const TIPOS_OBRA: { id: TipoObra; label: string; que: string }[] = [
  { id: "profesional", label: "Profesional", que: "Boletería completa, audiciones con callback, contratos y comisiones." },
  { id: "showcase", label: "Showcase", que: "Una muestra corta: página pública y boletería ligera, sin ensayos largos ni expedientes." },
  { id: "taller", label: "Taller", que: "Cuotas y adeudos, asistencia, evaluaciones y audiciones; boletería sin comisiones." },
  { id: "escuela", label: "Escuela", que: "Evaluaciones y boletas, asistencia, materiales y avisos. Los boletos los puede vender DARF o repartir la escuela." },
];
export const TIPO_LABEL: Record<TipoObra, string> = Object.fromEntries(TIPOS_OBRA.map((t) => [t.id, t.label])) as Record<TipoObra, string>;

export type ObraTipo = { tipo?: string | null; con_boleteria?: boolean | null };

/** Tipo válido (lo que venga raro de la base se toma como profesional). */
export function tipoDe(o: ObraTipo | null | undefined): TipoObra {
  const t = o?.tipo;
  return t === "showcase" || t === "taller" || t === "escuela" ? t : "profesional";
}

/** ¿La obra vende boletos por DARF? (apagado solo si alguien lo apagó) */
export function conBoleteria(o: ObraTipo | null | undefined): boolean {
  return o?.con_boleteria !== false;
}

/** Al elegir un tipo nuevo: la escuela empieza sin boletería; los demás, con. */
export function boleteriaPorDefecto(tipo: TipoObra): boolean {
  return tipo !== "escuela";
}

/** Páginas de boletería (se apagan todas juntas con con_boleteria). */
export const PAGINAS_BOLETERIA = ["funciones", "mapa", "beneficios", "preventa", "descuentos", "boletos", "taquilla", "vendedores", "corte", "hoy", "puerta", "entregas"];

// Qué página de la obra NO aplica a cada tipo (ids de panel-nav). Lo demás se ve igual que siempre.
const NO_APLICA: Record<TipoObra, string[]> = {
  profesional: ["cuotas", "adeudos", "evaluaciones"],
  showcase: ["ensayos", "comunicados", "materiales", "preguntas", "expedientes", "cuotas", "adeudos", "solicitudes", "evaluaciones", "audiciones", "fanzone", "fotos", "vendedores", "preventa", "beneficios"],
  taller: ["vendedores"],
  escuela: ["cuotas", "adeudos", "fanzone", "fotos", "vendedores", "preventa", "beneficios"],
};

/** Ids de página que no aplican a la obra (por su tipo y si vende boletos). */
export function paginasNoAplican(o: ObraTipo | null | undefined): Set<string> {
  const out = new Set(NO_APLICA[tipoDe(o)]);
  if (!conBoleteria(o)) for (const p of PAGINAS_BOLETERIA) out.add(p);
  return out;
}

/** Texto corto para el encabezado de la obra ("Escuela · sin boletería"). */
export function etiquetaTipo(o: ObraTipo | null | undefined): string {
  return `${TIPO_LABEL[tipoDe(o)]}${conBoleteria(o) ? "" : " · sin boletería"}`;
}
