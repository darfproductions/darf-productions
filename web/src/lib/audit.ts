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
    default:
      return `${r.accion} en ${r.tabla}`;
  }
}
