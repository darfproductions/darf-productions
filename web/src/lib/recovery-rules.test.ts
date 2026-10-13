import { describe, expect, it } from "vitest";
import { esRecuperacion, metodosDeSesion } from "./recovery-rules";

const jwt = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
const ahora = new Date("2026-10-13T12:00:00Z");

describe("enlace de recuperación", () => {
  it("lee los métodos del token", () => {
    expect(metodosDeSesion(jwt({ amr: [{ method: "recovery", timestamp: 1 }] }))).toEqual(["recovery"]);
    expect(metodosDeSesion("no-es-token")).toEqual([]);
    expect(metodosDeSesion(null)).toEqual([]);
  });
  it("solo la recuperación deja poner contraseña sin la actual", () => {
    expect(esRecuperacion({ type: "recovery", metodos: [], recoverySentAt: null, ahora })).toBe(true);
    expect(esRecuperacion({ type: "signup", metodos: ["recovery"], recoverySentAt: ahora.toISOString(), ahora })).toBe(false);
    expect(esRecuperacion({ type: null, metodos: ["recovery"], recoverySentAt: null, ahora })).toBe(true);
    expect(esRecuperacion({ type: null, metodos: ["oauth"], recoverySentAt: null, ahora })).toBe(false); // entrar con Google
    expect(esRecuperacion({ type: null, metodos: ["otp"], recoverySentAt: "2026-10-13T11:30:00Z", ahora })).toBe(true);
    expect(esRecuperacion({ type: null, metodos: ["otp"], recoverySentAt: "2026-10-13T08:00:00Z", ahora })).toBe(false); // hace 4 h
  });
});
