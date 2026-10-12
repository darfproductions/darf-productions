import { describe, expect, it } from "vitest";
import { httpsOrNull, parseList, reelYoutube, trayectoriaDe, usuarioRed } from "./pro-rules";

describe("perfil profesional", () => {
  it("listas sin repetidos", () => {
    expect(parseList("Jazz, ballet,  jazz,\nTap")).toEqual(["Jazz", "ballet", "Tap"]);
    expect(parseList("")).toEqual([]);
  });
  it("usuarios de redes", () => {
    expect(usuarioRed("@ana.p")).toBe("ana.p");
    expect(usuarioRed("https://www.instagram.com/ana.p/")).toBe("ana.p");
    expect(usuarioRed("ana p")).toBeNull();
  });
  it("trayectoria", () => {
    const hoy = new Date(2026, 9, 12);
    const r = trayectoriaDe([{ obra: " Rent ", papel: "Mimi", compania: "Teatro X", anio: "2019" }, { obra: "", papel: "x", compania: "", anio: "" }], hoy);
    expect(r).toEqual({ ok: true, items: [{ obra: "Rent", papel: "Mimi", compania: "Teatro X", anio: "2019" }] });
    expect(trayectoriaDe([{ obra: "Cats", papel: "", compania: "", anio: "1890" }], hoy).ok).toBe(false);
  });
  it("enlaces", () => {
    expect(httpsOrNull("")).toBeNull();
    expect(httpsOrNull("http://x.com")).toBe(false);
    expect(httpsOrNull("https://youtu.be/dQw4w9WgXcQ")).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(reelYoutube("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(reelYoutube("https://vimeo.com/1")).toBeNull();
  });
});
