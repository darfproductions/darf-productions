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
      if (campos.includes("estado")) return `Cambió ${String(row.nombre)} a ${String(row.estado)}`;
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
        default: return `Cambió la orden ${cod} de ${obra}`;
      }
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
    default:
      return `${r.accion} en ${r.tabla}`;
  }
}
