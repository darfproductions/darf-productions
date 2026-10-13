// Bitácora (tabla audit_log, migración 0031) contada en lenguaje sencillo.
// Función pura para poder probarla: audit.test.ts.

export type AuditRow = {
  id: number;
  at: string;
  actor: string | null;
  tabla: string;
  accion: "insert" | "update" | "delete" | string;
  registro_id: string | null;
  production_id: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
};

export type AuditNames = {
  person: (id: unknown) => string;
  role: (id: unknown) => string;
  production: (id: unknown) => string;
};

const ROL_GLOBAL: Record<string, string> = { fan: "fan", staff: "staff", admin: "Director" };
const ESTADO_OBRA: Record<string, string> = { borrador: "borrador", publicada: "publicada", archivada: "concluida" };

/** Qué es cada tabla, para los cambios que no tienen una frase propia. */
const COSA: Record<string, [string, "o" | "a"]> = {
  auditions: ["la convocatoria", "a"], audition_members: ["el equipo de una convocatoria", "o"], audition_invites: ["una invitación a audicionar", "a"],
  audition_templates: ["una plantilla de convocatoria", "a"], casting_offers: ["una oferta de papel", "a"], member_docs: ["un documento del expediente", "o"],
  member_fee_terms: ["las condiciones de pago de un integrante", "a"], production_fees: ["las mensualidades de la obra", "a"],
  member_incidents: ["una incidencia", "a"], member_measures: ["una medida disciplinaria", "a"], production_discipline: ["las reglas de disciplina", "a"],
  people: ["una ficha de persona", "a"], rehearsals: ["un ensayo", "o"], member_enrollment: ["la inscripción de un integrante", "a"],
  materials: ["un material", "o"], announcements: ["un comunicado", "o"], program_pages: ["el programa de mano", "o"],
  seller_productions: ["un vendedor", "o"], fanzone_items: ["un contenido de la Fan Zone", "o"], season_closures: ["el cierre de temporada", "o"],
  pro_profiles: ["un perfil profesional", "o"], rubric_evaluations: ["una evaluación", "a"], rubric_periods: ["un periodo de evaluación", "o"],
  rubric_teachers: ["las materias de un maestro", "a"], rubric_settings: ["la configuración de la rúbrica", "a"], anuncios: ["un anuncio", "o"],
  fan_encuentros: ["un evento", "o"], member_payments: ["un pago", "o"], production_characters: ["un personaje de la obra", "o"],
};
const VERBO: Record<string, string> = { insert: "Creó", update: "Editó", delete: "Borró" };

/** Campos de una obra que cambiaron (sin contar fechas de sistema). */
export function changedFields(antes: Record<string, unknown> | null, despues: Record<string, unknown> | null): string[] {
  if (!antes || !despues) return [];
  return Object.keys(despues).filter(
    (k) => !["updated_at", "publicada_at"].includes(k) && JSON.stringify(antes[k]) !== JSON.stringify(despues[k]),
  );
}

export function describeAudit(r: AuditRow, n: AuditNames): string {
  const row = (r.despues ?? r.antes ?? {}) as Record<string, unknown>;
  switch (r.tabla) {
    case "production_members":
      return r.accion === "delete"
        ? `Quitó a ${n.person(row.user_id)} como ${n.role(row.role_id)} en ${n.production(row.production_id)}`
        : `Dio a ${n.person(row.user_id)} el rol ${n.role(row.role_id)} en ${n.production(row.production_id)}`;
    case "panel_roles":
      if (r.accion === "insert") return `Creó el rol personalizado "${String(row.nombre)}"`;
      if (r.accion === "delete") return `Eliminó el rol personalizado "${String(row.nombre)}"`;
      return `Editó el rol personalizado "${String(row.nombre)}"`;
    case "role_permissions":
      return r.accion === "delete"
        ? `Quitó el permiso ${String(row.permission_id)} al rol ${n.role(row.role_id)}`
        : `Dio el permiso ${String(row.permission_id)} al rol ${n.role(row.role_id)}`;
    case "profiles":
      return `Cambió el rol general de ${n.person(row.id)} a ${ROL_GLOBAL[String(row.rol)] ?? String(row.rol)}`;
    case "productions": {
      if (r.accion === "insert") return `Creó la obra ${String(row.nombre)}`;
      if (r.accion === "delete") return `Eliminó la obra ${String(row.nombre)}`;
      const campos = changedFields(r.antes, r.despues);
      if (campos.includes("estado")) return `Cambió ${String(row.nombre)} a ${ESTADO_OBRA[String(row.estado)] ?? String(row.estado)}`;
      return campos.length
        ? `Editó ${String(row.nombre)} (${campos.join(", ")})`
        : `Guardó ${String(row.nombre)} sin cambios visibles`;
    }
    case "team_materials":
    case "team_announcements":
    case "team_notes":
    case "team_meetings":
    case "team_comments": {
      const que = { team_materials: "material del equipo", team_announcements: "aviso al equipo", team_notes: "nota de dirección", team_meetings: "junta del equipo", team_comments: "comentario en un material" }[r.tabla];
      const titulo = row.titulo ? ` "${String(row.titulo)}"` : "";
      const donde = r.production_id ? ` en ${n.production(r.production_id)}` : " (DARF general)";
      if (r.accion === "insert") return `Agregó ${que}${titulo}${donde}`;
      if (r.accion === "delete") return `Borró ${que}${titulo}${donde}`;
      if (r.tabla === "team_notes" && r.antes && r.despues && !r.antes.atendida_at && r.despues.atendida_at) return `Marcó atendida una nota de dirección${donde}`;
      if (r.tabla === "team_meetings" && r.antes?.estado === "programada" && r.despues?.estado === "realizada") return `Cerró la junta${titulo}${donde}`;
      return `Editó ${que}${titulo}${donde}`;
    }
    case "seats": {
      const k = Number(row.asientos ?? 0);
      const cuantos = `${k} ${k === 1 ? "asiento" : "asientos"}`;
      const obra = n.production(r.production_id);
      if (r.accion === "mapa") return `Guardó el mapa de asientos de ${obra} (${cuantos})`;
      if (r.accion === "copiar") return `Copió a ${obra} el mapa de asientos de ${n.production(row.origen)} (${cuantos})`;
      if (r.accion === "quitar") return `Quitó ${cuantos} del mapa de ${obra}`;
      if (r.accion === "poner") return `Volvió a poner ${cuantos} en el mapa de ${obra}`;
      return `Cambió de zona ${cuantos} en el mapa de ${obra}`;
    }
    case "member_requests": {
      const que = { falta: "falta", documento: "documento", pago: "comprobante de pago", otro: "solicitud" }[String(row.tipo)] ?? "solicitud";
      const quien = n.person(row.user_id);
      const obra = n.production(r.production_id);
      if (r.accion === "insert") return `${quien} mandó una solicitud (${que}) en ${obra}`;
      const est = String(row.estado);
      if (est === "aprobada") return `Aprobó la solicitud de ${quien} (${que}) en ${obra}`;
      if (est === "rechazada") return `Rechazó la solicitud de ${quien} (${que}) en ${obra}`;
      if (est === "cancelada") return `${quien} canceló su solicitud (${que}) en ${obra}`;
      return `Actualizó la solicitud de ${quien} (${que}) en ${obra}`;
    }
    case "orders": {
      // 0088: ventas, sin datos del comprador.
      const cod = String(row.order_code ?? "una orden");
      const obra = n.production(r.production_id);
      const dinero = (v: unknown) => `$${Number(v ?? 0).toLocaleString("es-MX")}`;
      const motivo = row.motivo ? ` (${String(row.motivo)})` : "";
      switch (r.accion) {
        case "aprobar": return `Aprobó la orden ${cod} de ${obra} por ${dinero(row.total)}`;
        case "rechazar": return `Rechazó la orden ${cod} de ${obra}${motivo}`;
        case "cancelar": return `Canceló la orden ${cod} de ${obra} (${dinero(row.monto)})${motivo}`;
        case "cancelar_boleto": return `Canceló el boleto ${String(row.lugar ?? "")} de la orden ${cod} (${dinero(row.monto)})${motivo}`.replace("boleto  de", "boleto de");
        case "cancelar_comprador": return `El comprador canceló su apartado ${cod} de ${obra}`;
        case "extender": return `Dio más tiempo para pagar la orden ${cod} de ${obra}`;
        case "pago": return `Registró el método de pago de la orden ${cod}`;
        case "cortesia": return `Hizo cortesía la orden ${cod} de ${obra}${motivo}`;
        case "codigo": return `Aplicó el código ${String(row.codigo ?? "")} en taquilla a la orden ${cod} (−${dinero(row.descuento)})`;
        case "deshacer_entrada": return `Deshizo una entrada en Puerta de la orden ${cod}`;
        default: return `Cambió la orden ${cod} de ${obra}`;
      }
    }
    case "performances": {
      const cuando = (v: unknown) => (v ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(String(v))) : "");
      if (r.accion === "cancelar") return `Canceló la función del ${cuando(row.starts_at)} de ${n.production(r.production_id)}${row.motivo ? ` (${String(row.motivo)})` : ""}`;
      if (r.accion === "cambiar_fecha") return `Cambió la función de ${n.production(r.production_id)} del ${cuando(row.antes)} al ${cuando(row.ahora)}`;
      return `${VERBO[r.accion] ?? "Cambió"} una función de ${n.production(r.production_id)}`;
    }
    case "precios": {
      const zona = String((r.despues ?? {}).zona ?? "una zona");
      const de = r.antes?.precio, a = r.despues?.precio;
      return `Cambió el precio de ${zona} en ${n.production(r.production_id)}: $${Number(de ?? 0).toLocaleString("es-MX")} → $${Number(a ?? 0).toLocaleString("es-MX")}`;
    }
    case "discount_codes": {
      const cod = String(row.codigo ?? "");
      if (r.accion === "insert") return `Creó el código de descuento ${cod} (${String(row.percent)}%) en ${n.production(r.production_id)}`;
      if (r.accion === "delete") return `Borró el código de descuento ${cod} en ${n.production(r.production_id)}`;
      return `Editó el código de descuento ${cod} en ${n.production(r.production_id)}`;
    }
    default: {
      const cosa = COSA[r.tabla];
      const donde = r.production_id ? ` en ${n.production(r.production_id)}` : "";
      if (!cosa) return `${VERBO[r.accion] ?? "Cambió"} un registro (${r.tabla})${donde}`;
      const verbo = r.accion === "insert" ? (cosa[0].startsWith("l") ? "Configuró" : "Creó") : VERBO[r.accion] ?? "Cambió";
      return `${verbo} ${cosa[0]}${donde}`;
    }
  }
}
