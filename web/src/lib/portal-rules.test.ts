import { describe, expect, it } from "vitest";
import { bloquesPortal, etiquetaProximo, hitosPendientes, proximoEvento, textoHito } from "./portal-rules";
import type { Rehearsal } from "./rehearsal-rules";

const r = (id: string, inicia: string, extra: Partial<Rehearsal> = {}): Rehearsal =>
  ({ id, titulo: id, inicia, termina: null, lugar: null, notas: null, convocatoria: "todos", grupos: [], personas: [], estado: "programado", ...extra });

describe("portal del integrante (0141)", () => {
  const ahora = new Date("2026-11-07T18:00:00Z"); // sábado 7 de noviembre, 12:00 en México
  it("el próximo es el primero que no ha terminado; los cancelados no cuentan", () => {
    const p = proximoEvento([r("ayer", "2026-11-06T16:00:00Z"), r("canc", "2026-11-07T19:00:00Z", { estado: "cancelado" }), r("tarde", "2026-11-07T22:00:00Z"), r("mañana", "2026-11-08T16:00:00Z")], ahora);
    expect(p?.r.id).toBe("tarde");
    expect(p?.esHoy).toBe(true);
    expect(p?.enCurso).toBe(false);
    expect(etiquetaProximo(p)).toBe("Hoy");
  });
  it("uno que empezó hace una hora sigue siendo el de ahora (dura 3 h si no tiene fin)", () => {
    const p = proximoEvento([r("curso", "2026-11-07T17:00:00Z"), r("luego", "2026-11-07T22:00:00Z")], ahora);
    expect(p?.r.id).toBe("curso");
    expect(etiquetaProximo(p)).toBe("En curso");
    expect(proximoEvento([r("ya", "2026-11-07T14:00:00Z", { termina: "2026-11-07T17:00:00Z" })], ahora)).toBeNull();
  });
  it("mañana es Próximo", () => {
    expect(etiquetaProximo(proximoEvento([r("m", "2026-11-08T16:00:00Z")], ahora))).toBe("Próximo");
    expect(etiquetaProximo(null)).toBe("Próximo");
  });
  it("hitos: con día o solo mes; los pasados se van", () => {
    expect(textoHito({ dia: "2027-03-01", mes: "2027-03-01" })).toBe("1 de marzo de 2027");
    expect(textoHito({ dia: null, mes: "2027-03-01" })).toBe("Marzo de 2027");
    const h = hitosPendientes([{ nombre: "a", mes: "2026-10-01", dia: null, notas: null }, { nombre: "b", mes: "2026-11-01", dia: null, notas: null }, { nombre: "c", mes: "2026-11-01", dia: "2026-11-06", notas: null }], "2026-11-07");
    expect(h.map((x) => x.nombre)).toEqual(["b"]);
  });
  it("seis bloques, con avisos en Documentos y Avisos", () => {
    const b = bloquesPortal({ sinLeer: 2, pendientes: 0 });
    expect(b.map((x) => x.id)).toEqual(["hoy", "docs", "materiales", "avisos", "pedir", "obra"]);
    expect(b[3].aviso).toBe(2);
    expect(b[1].aviso).toBeUndefined();
  });
});
