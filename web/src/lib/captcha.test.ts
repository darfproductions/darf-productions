import { describe, expect, it } from "vitest";
import { errorAuthComun, tokenCaptcha } from "./captcha";

describe("tokenCaptcha", () => {
  it("lee el campo del widget o nada", () => {
    const f = new FormData();
    expect(tokenCaptcha(f)).toBeUndefined();
    f.set("cf-turnstile-response", " abc ");
    expect(tokenCaptcha(f)).toBe("abc");
  });
});

describe("errorAuthComun", () => {
  it("traduce captcha y límites; lo demás no", () => {
    expect(errorAuthComun("captcha protection: request disallowed (invalid-input-response)")).toMatch(/persona/);
    expect(errorAuthComun("Email rate limit exceeded")).toMatch(/demasiados intentos/);
    expect(errorAuthComun("For security purposes, you can only request this after 42 seconds.")).toMatch(/demasiados intentos/);
    expect(errorAuthComun("Invalid login credentials")).toBeNull();
    expect(errorAuthComun(null)).toBeNull();
  });
});
