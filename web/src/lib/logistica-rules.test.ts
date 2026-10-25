import { describe, expect, it } from "vitest";
import { aQuienLlama, horario, horasLlamados, hora, ligaMaps, lineaHorario, LOGISTICA_OMISION, textoDuracion, textoPuertas } from "./logistica-rules";

// Función el 23 de enero de 2027 a las 8:00 p.m. (México) = 24 de enero 02:00 UTC.
const f = { starts_at: "2027-01-24T02:00:00Z" };
const lg = { ...LOGISTICA_OMISION, puertas_min: 30, duracion_min: 130, intermedio_min: 15 };

describe("logística de funciones (0127)", () => {
  it("horario calculado con la obra o propio de la función", () => {
    const h = horario(f, lg);
    expect(hora(h.puertas)).toBe("7:30 p.m.");
    expect(hora(h.termina)).toBe("10:10 p.m.");
    expect(lineaHorario(h)).toBe("Puertas 7:30 p.m. · Función 8:00 p.m. · Termina aprox. 10:10 p.m.");
    const propio = horario({ ...f, puertas_at: "2027-01-24T01:15:00Z", termina_at: "2027-01-24T04:00:00Z" }, lg);
    expect(hora(propio.puertas)).toBe("7:15 p.m.");
    expect(hora(propio.termina)).toBe("10:00 p.m.");
    expect(hora(horario(f, null).puertas)).toBe("7:30 p.m.");
  });
  it("duración e intermedio", () => {
    expect(textoDuracion(horario(f, lg))).toBe("2 h 10 min con intermedio de 15 min");
    expect(textoDuracion(horario(f, { ...lg, duracion_min: 120, intermedio_min: null }))).toBe("2 h");
  });
  it("Google Maps: la liga propia o una búsqueda", () => {
    expect(ligaMaps({ direccion: null, maps_url: "https://maps.app.goo.gl/abc" })).toBe("https://maps.app.goo.gl/abc");
    expect(ligaMaps({ direccion: "Av. Juárez 10, Querétaro", maps_url: null }, "Teatro de la Ciudad"))
      .toBe("https://www.google.com/maps/search/?api=1&query=Teatro%20de%20la%20Ciudad%2C%20Av.%20Ju%C3%A1rez%2010%2C%20Quer%C3%A9taro");
    expect(ligaMaps(null)).toBeNull();
  });
  it("llamados: a quién y a qué hora", () => {
    expect(aQuienLlama({ elenco: "todos", grupos: [], equipo_todos: true })).toBe("Llama a todo el elenco y al equipo");
    expect(aQuienLlama({ elenco: "grupos", grupos: ["crew", "tecnico"], equipo_todos: false })).toBe("Llama a Crew, Técnicos");
    expect(aQuienLlama({ elenco: "nadie", grupos: [], equipo_todos: true })).toBe("Llama al equipo");
    expect(horasLlamados(f, [{ nombre: "Elenco", minutos_antes: 120 }, { nombre: "Producción", minutos_antes: 180 }]).map((x) => `${x.nombre} ${hora(x.hora)}`))
      .toEqual(["Producción 5:00 p.m.", "Elenco 6:00 p.m."]);
  });
  it("texto de puertas (a la 1, a las 7)", () => {
    expect(textoPuertas(horario(f, lg))).toBe("Las puertas abren a las 7:30 p.m.");
    expect(textoPuertas({ puertas: "2027-01-24T07:00:00Z" })).toBe("Las puertas abren a la 1:00 a.m.");
  });
});
