import { describe, expect, it } from "vitest";
import { filtroValido, unirDirectorio, type CuentaUsuario, type FichaPersona } from "./directory-rules";

const fichas: FichaPersona[] = [
  { id: "p1", profile_id: "u1", nombre: "Ána López", email: "ana@x.mx", obras: ["Showman"], creditos: 2 },
  { id: "p2", profile_id: null, nombre: "Beto Ruiz", email: null, obras: ["MM"], creditos: 1 },
];
const cuentas: CuentaUsuario[] = [
  { id: "u1", email: "ana@x.mx", nombre: "Ana", rol: "staff" },
  { id: "u2", email: "carla@x.mx", nombre: null, rol: "fan" },
  { id: "u3", email: "dir@x.mx", nombre: "Dir", rol: "admin" },
];

describe("directorio de personas", () => {
  it("une ficha y cuenta en una sola fila y agrega cuentas sin ficha", () => {
    const f = unirDirectorio(fichas, cuentas);
    expect(f.map((x) => x.nombre)).toEqual(["Ána López", "Beto Ruiz", "carla", "Dir"]);
    expect(f[0]).toMatchObject({ userId: "u1", rol: "staff", fichaHref: "/panel/talento/u1" });
    expect(f[1]).toMatchObject({ userId: null, fichaHref: "/panel/talento/p/p2" });
    expect(f[2]).toMatchObject({ personId: null, rol: "fan", fichaHref: "/panel/talento/u2" });
  });
  it("filtros", () => {
    expect(unirDirectorio(fichas, cuentas, "elenco").map((x) => x.key)).toEqual(["p:p1", "p:p2"]);
    // Casa DARF y admin: el admin y quien tiene puesto de Casa DARF (staff ya no cuenta).
    expect(unirDirectorio(fichas, cuentas, "equipo").map((x) => x.key)).toEqual(["u:u3"]);
    const conCasa = unirDirectorio(fichas, cuentas, "equipo", { u2: ["Comunicación y Marketing"] });
    expect(conCasa.map((x) => x.key)).toEqual(["u:u2", "u:u3"]);
    expect(conCasa[0].casa).toEqual(["Comunicación y Marketing"]);
    expect(unirDirectorio(fichas, cuentas, "sin-cuenta").map((x) => x.key)).toEqual(["p:p2"]);
    // 0111: cuentas vacías (solo cuentas sin ficha que la base marcó como vacías).
    const vacias = unirDirectorio(fichas, cuentas, "vacias", {}, new Set(["u2", "u1"]));
    expect(vacias.map((x) => x.key)).toEqual(["u:u2"]);
    expect(vacias[0].vacia).toBe(true);
    expect(filtroValido("vacias")).toBe("vacias");
    expect(filtroValido("x")).toBe("todos");
    expect(filtroValido("equipo")).toBe("equipo");
  });
});
