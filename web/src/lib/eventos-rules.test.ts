import { describe, expect, it } from "vitest";
import { accionEvento, type Evento } from "./eventos-rules";

const base: Evento = {
  id: "e", production_id: "showman", obra: "Showman", performance_id: null, tipo: "presencial", categoria: null, titulo: "Meet",
  descripcion: null, lugar: null, starts_at: "2027-01-01T20:00:00Z", termina: "2027-01-01T23:00:00Z", venue: null, cupo: 10, libres: 10,
  abierto: true, notas: null, requiere_registro: true, requiere_boleto: false, acceso: "club",
  apartado: false, con_boleto: true, recordar: false, en_vivo: false, liga: null,
};
const yo = { sesion: true, socio: true };

describe("eventos (0081)", () => {
  it("presencial con registro: apartar, liberar, lleno, boleto, club y sesión", () => {
    expect(accionEvento(base, yo)).toBe("apartar");
    expect(accionEvento({ ...base, apartado: true }, yo)).toBe("liberar");
    expect(accionEvento({ ...base, libres: 0 }, yo)).toBe("lleno");
    expect(accionEvento({ ...base, con_boleto: false }, yo)).toBe("boleto");
    expect(accionEvento(base, { sesion: true, socio: false })).toBe("unirse_club");
    expect(accionEvento({ ...base, acceso: "publico" }, { sesion: false, socio: false })).toBe("entrar_sesion");
  });
  it("sin registro: recordar (con sesión) o solo llegar", () => {
    expect(accionEvento({ ...base, requiere_registro: false }, yo)).toBe("recordar");
    expect(accionEvento({ ...base, requiere_registro: false, acceso: "publico" }, { sesion: false, socio: false })).toBe("sin_registro");
  });
  it("en línea: la liga solo cuando llega (y con registro, al apartar)", () => {
    const vivo = { ...base, tipo: "en_linea" as const, requiere_registro: false };
    expect(accionEvento(vivo, yo)).toBe("recordar");
    expect(accionEvento({ ...vivo, liga: "https://x" }, { sesion: false, socio: false })).toBe("entrar");
    expect(accionEvento({ ...vivo, requiere_registro: true }, yo)).toBe("apartar");
    expect(accionEvento({ ...vivo, requiere_registro: true, apartado: true }, yo)).toBe("recordar");
  });
});
