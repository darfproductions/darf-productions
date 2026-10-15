import { describe, expect, it } from "vitest";
import { leerMedalla, medallaSrc, nivelDe, siguienteMeta, textoLealtad } from "@/lib/lealtad-rules";
import { filaGoogle, paseGafete, sellosApple, sellosDe, sellosFuera } from "@/lib/gafete-rules";
import { paseCredencial } from "@/lib/credencial-rules";

describe("DARF Loyalty (0103)", () => {
  it("niveles por número de producciones", () => {
    expect(nivelDe(0)).toBeNull();
    expect(nivelDe(2)).toBeNull();
    expect(nivelDe(3)?.nombre).toBe("Rookie");
    expect(nivelDe(4)?.nombre).toBe("Rookie");
    expect(nivelDe(5)?.nombre).toBe("Rising Star");
    expect(nivelDe(10)?.nombre).toBe("Lead");
    expect(nivelDe(15)?.nombre).toBe("Headliner");
    expect(nivelDe(20)?.nombre).toBe("Showstopper");
    expect(nivelDe(30)?.nombre).toBe("Legend");
    expect(nivelDe(49)?.nombre).toBe("Legend");
    expect(nivelDe(50)?.nombre).toBe("Hall of Fame");
    expect(nivelDe(120)?.nombre).toBe("Hall of Fame");
  });

  it("siguiente meta y avance (la barra de Mi cuenta)", () => {
    expect(siguienteMeta(1)).toMatchObject({ faltan: 2, nivel: { nombre: "Rookie" } });
    expect(siguienteMeta(1)!.progreso).toBeCloseTo(1 / 3);
    expect(siguienteMeta(7)).toMatchObject({ faltan: 3, nivel: { nombre: "Lead" } });
    expect(siguienteMeta(7)!.progreso).toBeCloseTo(2 / 5);
    expect(siguienteMeta(49)).toMatchObject({ faltan: 1, nivel: { nombre: "Hall of Fame" } });
    expect(siguienteMeta(50)).toBeNull();
  });

  it("imagen y texto", () => {
    expect(medallaSrc(12)).toBe("/medalla/12");
    expect(medallaSrc(5000)).toBe("/medalla/999");
    expect(textoLealtad(12)).toBe("Lead · 12 producciones");
    expect(textoLealtad(2)).toBeNull();
  });

  it("web y PDF: Club Fan · medalla · Casa DARF; Apple: medalla primero", () => {
    const p = { ...paseGafete({ nombre: "Diego", fotoUrl: null, franja: "casa", papel: "CEO", casaDesde: 2019, lealtad: 12 }), sello: "Socio #0001" };
    expect(sellosDe(p).map((s) => s.src)).toEqual(["/marca/sello-club.svg", "/medalla/12", "/marca/sello-casa.svg"]);
    expect(sellosApple(sellosDe(p)).map((s) => s.id)).toEqual(["lealtad", "casa", "club"]);
    expect(sellosApple(sellosDe({ ...p, lealtad: 0 })).map((s) => s.id)).toEqual(["casa", "club"]);
    expect(sellosDe({ ...p, lealtad: 2 }).map((s) => s.src)).not.toContain("/medalla/2");
  });

  it("Google: con un sello, DARF primero; con dos, DARF al centro", () => {
    expect(filaGoogle(["club", "casa"])).toEqual(["club", "darf", "casa"]);
    expect(filaGoogle(["club"])).toEqual(["darf", "club"]);
    expect(filaGoogle([])).toEqual(["darf"]);
  });

  it("también en la credencial del Club Fan y en la de cuenta", () => {
    const base = { token: "t", codigo: "ABC", desde: null, franja: null, papel: null, compartir_telefono: false, compartir_correo: false,
      compartir_instagram: false, compartir_perfil: false, nombre: "Ana", fotoUrl: null, lealtad: 5 };
    const fan = paseCredencial({ ...base, nivel: "club", socio: { numero: 1, desde: "2026-01-01", fundador: true } });
    expect(sellosDe(fan).at(-1)?.src).toBe("/medalla/5");
    expect(sellosDe(paseCredencial({ ...base, nivel: "cuenta", socio: null })).map((s) => s.src)).toEqual(["/medalla/5"]);
  });

  it("fans (0104): butacas en metales, mismas metas", () => {
    expect(nivelDe(2, "fan")).toBeNull();
    expect(nivelDe(3, "fan")?.nombre).toBe("Balcony");
    expect(nivelDe(7, "fan")?.material).toBe("Plata");
    expect(nivelDe(50, "fan")?.nombre).toBe("Standing Ovation");
    expect(siguienteMeta(7, "fan")).toMatchObject({ faltan: 3, nivel: { nombre: "Orchestra" } });
    expect(textoLealtad(1, "fan")).toBeNull();
    expect(textoLealtad(12, "fan")).toBe("Orchestra · 12 visitas");
    expect(medallaSrc(12, "fan")).toBe("/medalla/f12");
    expect(leerMedalla("/medalla/f12")).toEqual({ prog: "fan", n: 12 });
    expect(leerMedalla("/medalla/12")).toEqual({ prog: "equipo", n: 12 });
    expect(leerMedalla("/medalla/x12")).toBeNull();
  });

  it("la medalla de fan solo se ve siendo socio, entre el club y la del equipo", () => {
    const g = paseGafete({ nombre: "Ana", fotoUrl: null, franja: "casa", papel: "CMO", lealtad: 12, fanVisitas: 7 });
    expect(sellosDe(g).map((s) => s.id)).toEqual(["lealtad", "casa"]);
    const socio = { ...g, sello: "Socio #0001" };
    expect(sellosDe(socio).map((s) => s.id)).toEqual(["club", "fan", "lealtad", "casa"]);
    expect(sellosApple(sellosDe(socio)).map((s) => s.id)).toEqual(["lealtad", "fan", "casa", "club"]);
  });

  it("Wallet y PDF: sin medallas, solo Club Fan y Casa DARF", () => {
    const p = { ...paseGafete({ nombre: "Ana", fotoUrl: null, franja: "casa", papel: "CMO", lealtad: 12, fanVisitas: 7 }), sello: "Socio #0001" };
    expect(sellosFuera(sellosDe(p)).map((s) => s.id)).toEqual(["club", "casa"]);
  });
});
