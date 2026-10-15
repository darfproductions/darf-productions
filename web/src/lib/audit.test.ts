import { describe, expect, it } from "vitest";
import { changedFields, describeAudit, tipoBitacora, TIPOS_BITACORA, type AuditNames, type AuditRow } from "./audit";

const names: AuditNames = {
  person: (id) => (id === "u1" ? "Ana" : "alguien"),
  role: (id) => (id === "taquilla" ? "Taquilla" : String(id)),
  production: (id) => (id === "mm" ? "Mamma Mia" : String(id)),
};
const base: AuditRow = { id: 1, at: "2026-10-11T00:00:00Z", actor: null, tabla: "", accion: "insert", registro_id: null, production_id: null, antes: null, despues: null };

describe("bitácora en lenguaje sencillo", () => {
  it("roles por obra", () => {
    const row = { user_id: "u1", role_id: "taquilla", production_id: "mm" };
    expect(describeAudit({ ...base, tabla: "production_members", despues: row }, names)).toBe("Dio a Ana el rol Taquilla en Mamma Mia");
    expect(describeAudit({ ...base, tabla: "production_members", accion: "delete", antes: row }, names)).toBe("Quitó a Ana como Taquilla en Mamma Mia");
  });
  it("cambio de rol general", () => {
    expect(describeAudit({ ...base, tabla: "profiles", accion: "update", despues: { id: "u1", rol: "admin" } }, names)).toBe(
      "Cambió el rol general de Ana a Director",
    );
  });
  it("cambios en una obra", () => {
    const antes = { nombre: "Mamma Mia", estado: "publicada", frase: "a", updated_at: "1" };
    expect(describeAudit({ ...base, tabla: "productions", accion: "update", antes, despues: { ...antes, estado: "archivada" } }, names)).toBe(
      "Cambió Mamma Mia a concluida",
    );
    expect(changedFields(antes, { ...antes, frase: "b", updated_at: "2" })).toEqual(["frase"]);
  });
  it("0108: publicar y despublicar al elenco", () => {
    const fila = (accion: string, d: Record<string, unknown>) => ({ ...base, tabla: "production_credits", accion, production_id: "mm", despues: d });
    expect(describeAudit(fila("publicar", { persona: "Ana", papel: "Donna", tipo: "reparto" }), names)).toBe("Publicó a Ana como Donna en Mamma Mia");
    expect(describeAudit(fila("despublicar", { persona: "Beto", papel: null, tipo: "ensamble" }), names)).toBe("Quitó de la página a Beto en el Ensamble en Mamma Mia");
  });
});

describe("bitácora del mapa de asientos", () => {
  const names = { person: () => "Ana", role: String, production: (id: unknown) => (id === "mm" ? "Mamma Mia" : "Showman") };
  const row = (accion: string, despues: Record<string, unknown>) => ({ id: 1, at: "", actor: null, tabla: "seats", accion, registro_id: null, production_id: "mm", antes: null, despues });
  it("una línea por cambio", () => {
    expect(describeAudit(row("mapa", { asientos: 120 }), names)).toBe("Guardó el mapa de asientos de Mamma Mia (120 asientos)");
    expect(describeAudit(row("copiar", { asientos: 5, origen: "showman" }), names)).toBe("Copió a Mamma Mia el mapa de asientos de Showman (5 asientos)");
    expect(describeAudit(row("quitar", { asientos: 1 }), names)).toBe("Quitó 1 asiento del mapa de Mamma Mia");
  });
});

describe("bitácora del portal del equipo", () => {
  const names = { person: () => "Ana", role: String, production: () => "Showman" };
  it("lo cuenta en lenguaje sencillo", () => {
    expect(describeAudit({ id: 1, at: "", actor: null, tabla: "team_meetings", accion: "update", registro_id: null, production_id: "showman",
      antes: { estado: "programada", titulo: "Junta" }, despues: { estado: "realizada", titulo: "Junta" } }, names)).toBe('Cerró la junta "Junta" en Showman');
    expect(describeAudit({ id: 2, at: "", actor: null, tabla: "team_announcements", accion: "insert", registro_id: null, production_id: null,
      antes: null, despues: { titulo: "Bienvenidos" } }, names)).toBe('Agregó aviso al equipo "Bienvenidos" (DARF general)');
  });
});

describe("describeAudit · ventas (0088)", () => {
  const n = { person: () => "Ana", role: () => "Taquilla", production: () => "Showman" };
  const base = { id: 1, at: "", actor: null, registro_id: null, production_id: "showman", antes: null };
  it("cuenta aprobar, cancelar y precios sin datos del comprador", () => {
    expect(describeAudit({ ...base, tabla: "orders", accion: "aprobar", despues: { order_code: "DARF-1", total: 400 } }, n)).toBe("Aprobó la orden DARF-1 de Showman por $400");
    expect(describeAudit({ ...base, tabla: "orders", accion: "cancelar_boleto", despues: { order_code: "DARF-1", lugar: "A-3", monto: 200, motivo: "Cambio" } }, n)).toBe("Canceló el boleto A-3 de la orden DARF-1 ($200) (Cambio)");
    expect(describeAudit({ ...base, tabla: "precios", accion: "precio", antes: { zona: "VIP", precio: 300 }, despues: { zona: "VIP", precio: 350 } }, n)).toBe("Cambió el precio de VIP en Showman: de $300 a $350");
  });
});

describe("bitácora de tablas sin frase propia", () => {
  const r = (tabla: string, accion: string, production_id: string | null) =>
    ({ id: 1, at: "", actor: null, tabla, accion, registro_id: null, production_id, antes: null, despues: null });
  it("en español", () => {
    expect(describeAudit(r("member_payments", "insert", "mm"), names)).toBe("Creó un pago en Mamma Mia");
    expect(describeAudit(r("rehearsals", "delete", "mm"), names)).toBe("Borró un ensayo en Mamma Mia");
    expect(describeAudit(r("rara", "update", null), names)).toBe("Editó un registro (rara)");
  });
});

describe("bitácora de taquilla y funciones (0091)", () => {
  it("cortesía y función cancelada", () => {
    const r = { id: 1, at: "", actor: null, registro_id: null, production_id: "mm", antes: null };
    expect(describeAudit({ ...r, tabla: "orders", accion: "cortesia", despues: { order_code: "DARF-1", motivo: "Prensa" } }, names)).toContain("Hizo cortesía la orden DARF-1");
    expect(describeAudit({ ...r, tabla: "performances", accion: "cancelar", despues: { starts_at: "2026-11-22T02:00:00Z", motivo: "Lluvia" } }, names)).toContain("Canceló la función del");
  });
});

describe("bitácora 4C: contacto, invitaciones y tipos", () => {
  const n = { person: (id: unknown) => (id === "u1" ? "Ana" : "alguien"), role: String, production: () => "Showman" };
  const fila = (tabla: string, accion: string, despues: Record<string, unknown>) =>
    ({ id: 1, at: "2026-10-13T12:00:00Z", actor: null, tabla, accion, registro_id: null, production_id: "showman", antes: despues, despues });
  it("contacto sin datos personales", () => {
    expect(describeAudit(fila("contact_messages", "update", { campos: ["asignado_a", "asignado_at"], asignado_a: "u1" }), n)).toBe("Asignó un mensaje de contacto a Ana");
    expect(describeAudit(fila("contact_messages", "update", { campos: ["leido", "respondido_at"], respondido_por: "u1", respuesta_canal: "whatsapp" }), n)).toBe("Marcó respondido un mensaje de contacto (WhatsApp)");
    expect(describeAudit(fila("contact_messages", "update", { campos: ["respondido_at"] }), n)).toBe("Reabrió un mensaje de contacto");
  });
  it("invitaciones al equipo", () => {
    expect(describeAudit(fila("production_invites", "insert", {}), n)).toBe("Invitó a alguien al equipo de Showman");
    expect(describeAudit(fila("production_invites", "update", { campos: ["cancelada_at"] }), n)).toBe("Canceló una invitación al equipo de Showman");
  });
  it("tipos de acción", () => {
    expect(tipoBitacora("boletos-cortesia")).toMatchObject({ tablas: ["orders"], accion: "cortesia" });
    expect(tipoBitacora("nada")).toBeNull();
    expect(new Set(TIPOS_BITACORA.map((t) => t.id)).size).toBe(TIPOS_BITACORA.length);
  });
});
