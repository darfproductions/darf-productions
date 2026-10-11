import { describe, expect, it } from "vitest";
import { adeudo, cuentaAdvertencias, docAplica, docsPendientes, estadoCuotas, faltantes, meses, semaforo } from "./member-rules";

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
  it("antes del día límite está pendiente, no vencido", () => {
    const ms = estadoCuotas(fee, { beca: false, cuota_especial: null }, [], new Date("2026-11-05T12:00:00Z"));
    expect(ms[2].estado).toBe("pendiente");
  });
  it("beca y cuota especial", () => {
    expect(estadoCuotas(fee, { beca: true, cuota_especial: null }, [], hoy).every((m) => m.estado === "beca")).toBe(true);
    const esp = estadoCuotas(fee, { beca: false, cuota_especial: 250 }, [{ periodo: "2026-09-01", monto: 250 }], hoy);
    expect(esp[0].estado).toBe("pagado");
    expect(esp[0].debe).toBe(250);
  });
});
