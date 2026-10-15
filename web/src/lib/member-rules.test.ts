import { describe, expect, it } from "vitest";
import { adeudo, cuentaAdvertencias, estadoInscripcion, mesesDePersona, recaudacion, docAplica, docsPendientes, estadoCuotas, faltantes, limiteDelMes, meses, semaforo, textoVencimiento, venceCorto } from "./member-rules";

const hoy = new Date("2026-11-15T12:00:00Z");
const completo = {
  fecha_nacimiento: "2000-01-01", telefono: "55", emergencia_nombre: "Mamá", emergencia_telefono: "55",
  alergias: "Ninguna",
};
const confirmado = { confirmado_at: "2026-11-01", revisado_at: null };

describe("expediente", () => {
  it("lo que falta", () => {
    expect(faltantes(null)).toEqual(["Expediente sin llenar"]);
    expect(faltantes(completo, hoy)).toEqual([]);
    expect(faltantes({ ...completo, fecha_nacimiento: "2012-05-01" }, hoy)).toContain("Madre, padre o tutor");
    expect(faltantes({ ...completo, alergias: " " }, hoy)).toHaveLength(1);
  });
  const base = { solo_menores: false, obligatorio: true, grupo: null, personas: [] as string[] };
  const tipos = [
    { ...base, id: "a", nombre: "Reglamento", aplica: "todos" as const },
    { ...base, id: "b", nombre: "Permiso", aplica: "menores" as const, solo_menores: true },
    { ...base, id: "c", nombre: "Foto", aplica: "todos" as const, obligatorio: false },
    { ...base, id: "d", nombre: "Responsiva aéreo", aplica: "personas" as const, personas: ["u1"] },
    { ...base, id: "e", nombre: "Partituras firmadas", aplica: "grupo" as const, grupo: "ensamble" },
  ];
  it("documentos dirigidos: menores, personas y grupo", () => {
    const docs = [{ doc_type_id: "a", archivo_path: "x", subido_at: "x", entregado_at: null }];
    expect(docsPendientes(tipos, docs, { uid: "u2", esMenor: false, tipos: ["reparto"] }).map((t) => t.id)).toEqual(["a"]);
    expect(docsPendientes(tipos, docs, { uid: "u1", esMenor: true, tipos: ["ensamble"] }).map((t) => t.id)).toEqual(["a", "b", "d", "e"]);
    expect(docAplica(tipos[3], { uid: "u3", esMenor: false, tipos: [] })).toBe(false);
  });
  it("semáforo: falta confirmar vigencia, por revisar, completo", () => {
    expect(semaforo(completo, 1, confirmado, hoy)).toBe("rojo");
    expect(semaforo(completo, 0, null, hoy)).toBe("rojo");
    expect(semaforo(completo, 0, confirmado, hoy)).toBe("amarillo");
    expect(semaforo(completo, 0, { ...confirmado, revisado_at: "2026-11-02" }, hoy)).toBe("verde");
  });
  it("advertencias que cuentan", () => {
    expect(cuentaAdvertencias([
      { nivel: "nota", anulada_at: null }, { nivel: "advertencia", anulada_at: null },
      { nivel: "grave", anulada_at: null }, { nivel: "advertencia", anulada_at: "2026-11-01" },
    ])).toBe(2);
  });
});

describe("mensualidades", () => {
  const fee = { monto: 500, desde: "2026-09-01", hasta: "2027-01-01", dia_limite: 10 };
  it("meses del periodo, cruzando el año", () => {
    expect(meses("2026-11-01", "2027-02-01")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
  });
  it("estado de cada mes y adeudo", () => {
    const ms = estadoCuotas(fee, { beca: false, cuota_especial: null }, [
      { periodo: "2026-09-01", monto: 500 },
      { periodo: "2026-10-01", monto: 200 },
    ], hoy);
    expect(ms.map((m) => m.estado)).toEqual(["pagado", "parcial", "vencido", "futuro", "futuro"]);
    expect(adeudo(ms, hoy)).toBe(800);
  });
  it("vence el segundo sábado (0111)", () => {
    const sab = { ...fee, vence_sabado: true };
    expect(limiteDelMes(sab, "2026-10-01")).toBe("2026-10-10");
    expect(limiteDelMes(sab, "2026-11-01")).toBe("2026-11-14");
    expect(limiteDelMes(sab, "2026-08-01")).toBe("2026-08-08");
    expect(limiteDelMes(fee, "2026-10-01")).toBe("2026-10-10");
    const t = { beca: false, cuota_especial: null };
    expect(estadoCuotas(sab, t, [], new Date("2026-11-13T18:00:00Z")).find((m) => m.periodo === "2026-11-01")?.estado).toBe("pendiente");
    expect(estadoCuotas(sab, t, [], new Date("2026-11-15T18:00:00Z")).find((m) => m.periodo === "2026-11-01")?.estado).toBe("vencido");
    expect(textoVencimiento(sab)).toContain("primer sábado");
    expect(venceCorto(fee)).toBe("Día 10");
  });
  it("antes del día límite está pendiente, no vencido", () => {
    const ms = estadoCuotas(fee, { beca: false, cuota_especial: null }, [], new Date("2026-11-05T12:00:00Z"));
    expect(ms[2].estado).toBe("pendiente");
  });
  it("ingreso tardío y baja recortan los meses", () => {
    expect(mesesDePersona("2026-09-01", "2027-01-01", { ingreso: "2026-10-20", baja_at: null })).toEqual(["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"]);
    expect(mesesDePersona("2026-09-01", "2027-01-01", { ingreso: "2026-09-05", baja_at: "2026-11-01" })).toEqual(["2026-09-01", "2026-10-01"]);
    expect(mesesDePersona("2026-09-01", "2027-01-01", { ingreso: "2026-09-05", baja_at: "2026-11-15" })).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
  });
  it("inscripción: completa aunque entre tarde; no cuenta como mensualidad", () => {
    const f = { ...fee, inscripcion: 800 };
    const pagos = [{ periodo: "2026-11-01", monto: 800, concepto: "inscripcion" as const }, { periodo: "2026-11-01", monto: 500, concepto: "mensualidad" as const }];
    expect(estadoInscripcion(f, { beca: false, cuota_especial: null }, pagos).estado).toBe("pagado");
    expect(estadoInscripcion(f, { beca: false, cuota_especial: null }, []).estado).toBe("pendiente");
    expect(estadoInscripcion(f, { beca: true, cuota_especial: null, sin_inscripcion: true }, []).estado).toBe("exento");
    const ms = estadoCuotas(f, { beca: false, cuota_especial: null }, pagos, hoy, { ingreso: "2026-11-03", baja_at: null });
    expect(ms[0]).toMatchObject({ periodo: "2026-11-01", pagado: 500, estado: "pagado" });
  });
  it("taller sin pagos: nada que cobrar", () => {
    expect(estadoCuotas({ ...fee, cobrar: false }, { beca: false, cuota_especial: null }, [], hoy)).toEqual([]);
    expect(estadoInscripcion({ ...fee, cobrar: false, inscripcion: 800 }, { beca: false, cuota_especial: null }, []).estado).toBe("no_aplica");
  });
  it("recaudación por mes de cobro", () => {
    const r = recaudacion([
      { monto: 800, concepto: "inscripcion", registrado_at: "2026-11-03T18:00:00Z" },
      { monto: 500, concepto: "mensualidad", registrado_at: "2026-11-20T18:00:00Z" },
      { monto: 500, concepto: "mensualidad", registrado_at: "2026-12-01T05:00:00Z" },
    ]);
    expect(r.meses.map((m) => [m.mes, m.mensualidades, m.inscripciones])).toEqual([["2026-11-01", 1000, 800]]);
    expect(r.total).toBe(1800);
  });
  it("beca y cuota especial", () => {
    expect(estadoCuotas(fee, { beca: true, cuota_especial: null }, [], hoy).every((m) => m.estado === "beca")).toBe(true);
    const esp = estadoCuotas(fee, { beca: false, cuota_especial: 250 }, [{ periodo: "2026-09-01", monto: 250 }], hoy);
    expect(esp[0].estado).toBe("pagado");
    expect(esp[0].debe).toBe(250);
  });
});
