import { describe, expect, it } from "vitest";
import { archivoIcs, calendarioIcs, escaparIcs, ligaGoogle, ligaOutlook, ligasSuscripcion } from "./calendario";

const e = { uid: "orden-1", titulo: "Showman, función", inicia: "2026-11-22T02:00:00Z", lugar: "Teatro; Querétaro", url: "https://darfproductions.com/cuenta" };

describe("agregar al calendario", () => {
  it("archivo .ics con hora UTC, duración y aviso 2 h antes", () => {
    const ics = archivoIcs(e, 2.5, new Date("2026-10-13T00:00:00Z"));
    expect(ics).toContain("DTSTART:20261122T020000Z");
    expect(ics).toContain("DTEND:20261122T043000Z");
    expect(ics).toContain("SUMMARY:Showman\\, función");
    expect(ics).toContain("LOCATION:Teatro\\; Querétaro");
    expect(ics).toContain("TRIGGER:-PT2H");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
  it("liga de Google", () => {
    const g = ligaGoogle(e);
    expect(g).toContain("dates=20261122T020000Z%2F20261122T043000Z");
    expect(g).toContain("ctz=America%2FMexico_City");
  });
  it("escapa saltos de línea", () => {
    expect(escaparIcs("a\nb")).toBe("a\\nb");
  });
  it("liga de Outlook: personal y de trabajo o escuela", () => {
    const u = new URL(ligaOutlook(e));
    expect(u.host).toBe("outlook.live.com");
    expect(u.searchParams.get("subject")).toBe("Showman, función");
    expect(u.searchParams.get("startdt")).toBe("2026-11-22T02:00:00.000Z");
    expect(u.searchParams.get("enddt")).toBe("2026-11-22T04:30:00.000Z");
    expect(u.searchParams.get("location")).toBe("Teatro; Querétaro");
    expect(u.searchParams.get("rru")).toBe("addevent");
    expect(new URL(ligaOutlook(e, "trabajo")).host).toBe("outlook.office.com");
  });
});

describe("0156: Mi calendario DARF", () => {
  const ahora = new Date("2026-11-20T12:00:00Z");
  const evs = [
    { uid: "ensayo-1", titulo: "Ensayo: Coreografía · Grease", inicia: "2026-11-22T17:00:00Z", termina: "2026-11-22T20:00:00Z", lugar: "Salón DARF" },
    { uid: "funcion-2", titulo: "Función: Grease", inicia: "2026-12-05T02:00:00Z" },
  ];
  it("un calendario con nombre, todos los eventos y que se revise cada hora", () => {
    const ics = calendarioIcs(evs, "DARF · Mi calendario", 2.5, ahora);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("X-WR-CALNAME:DARF · Mi calendario");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(ics).toContain("UID:ensayo-1@darfproductions.com");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });
  it("sin eventos sigue siendo un calendario válido", () => {
    expect(calendarioIcs([], "Vacío", 2.5, ahora)).toContain("END:VCALENDAR");
  });
  it("ligas para suscribirse", () => {
    const l = ligasSuscripcion("https://www.darfproductions.com/calendario/mi/abc", "DARF");
    expect(l.apple).toBe("webcal://www.darfproductions.com/calendario/mi/abc");
    expect(l.google).toContain(encodeURIComponent("webcal://www.darfproductions.com/calendario/mi/abc"));
    expect(l.outlook).toContain(encodeURIComponent("https://www.darfproductions.com/calendario/mi/abc"));
  });
});
