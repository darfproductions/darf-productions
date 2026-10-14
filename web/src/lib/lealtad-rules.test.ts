import { describe, expect, it } from "vitest";
import { medallaSrc, nivelDe, siguienteMeta, textoLealtad } from "@/lib/lealtad-rules";
import { filaGoogle, paseGafete, sellosApple, sellosDe } from "@/lib/gafete-rules";
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

  it("Google: DARF al centro y la medalla lo más al centro posible", () => {
    expect(filaGoogle(["club", "lealtad", "casa"])).toEqual(["club", "darf", "lealtad", "casa"]);
    expect(filaGoogle(["club", "lealtad"])).toEqual(["club", "darf", "lealtad"]);
    expect(filaGoogle(["lealtad", "casa"])).toEqual(["lealtad", "darf", "casa"]);
    expect(filaGoogle(["club", "casa"])).toEqual(["club", "darf", "casa"]);
    expect(filaGoogle(["lealtad"])).toEqual(["darf", "lealtad"]);
    expect(filaGoogle([])).toEqual(["darf"]);
  });

  it("también en la credencial del Club Fan y en la de cuenta", () => {
    const base = { token: "t", codigo: "ABC", desde: null, franja: null, papel: null, compartir_telefono: false, compartir_correo: false,
      compartir_instagram: false, compartir_perfil: false, nombre: "Ana", fotoUrl: null, lealtad: 5 };
    const fan = paseCredencial({ ...base, nivel: "club", socio: { numero: 1, desde: "2026-01-01", fundador: true } });
    expect(sellosDe(fan).at(-1)?.src).toBe("/medalla/5");
    expect(sellosDe(paseCredencial({ ...base, nivel: "cuenta", socio: null })).map((s) => s.src)).toEqual(["/medalla/5"]);
  });
});
