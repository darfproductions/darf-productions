import { describe, expect, it } from "vitest";
import { adeudo, docsPendientes, estadoCuotas, faltantes, meses, semaforo } from "./member-rules";

const hoy = new Date("2026-11-15T12:00:00Z");
const completo = {
  fecha_nacimiento: "2000-01-01", telefono: "55", emergencia_nombre: "Mamá", emergencia_telefono: "55",
  alergias: "Ninguna", revisado_at: null,
};

describe("expediente", () => {
  it("lo que falta", () => {
    expect(faltantes(null)).toEqual(["Expediente sin llenar"]);
    expect(faltantes(completo, hoy)).toEqual([]);
    expect(faltantes({ ...completo, fecha_nacimiento: "2012-05-01" }, hoy)).toContain("Madre, padre o tutor");
    expect(faltantes({ ...completo, alergias: " " }, hoy)).toHaveLength(1);
  });
  it("documentos de menores solo a menores", () => {
    const tipos = [
      { id: "a", nombre: "Reglamento", solo_menores: false, obligatorio: true },
      { id: "b", nombre: "Permiso", solo_menores: true, obligatorio: true },
      { id: "c", nombre: "Foto", solo_menores: false, obligatorio: false },
    ];
    const docs = [{ doc_type_id: "a", archivo_path: "x", subido_at: "x", entregado_at: null }];
    expect(docsPendientes(tipos, docs, false).map((t) => t.id)).toEqual(["a"]);
    expect(docsPendientes(tipos, docs, true).map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("semáforo", () => {
    expect(semaforo(completo, 1, hoy)).toBe("rojo");
    expect(semaforo(completo, 0, hoy)).toBe("amarillo");
    expect(semaforo({ ...completo, revisado_at: "2026-11-01" }, 0, hoy)).toBe("verde");
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
