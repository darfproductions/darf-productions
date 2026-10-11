import { describe, expect, it } from "vitest";
import { parseYoutube } from "./youtube";

describe("enlaces de YouTube", () => {
  it("reconoce las formas comunes", () => {
    expect(parseYoutube("https://youtu.be/lOfGNDV1qa8")).toBe("lOfGNDV1qa8");
    expect(parseYoutube("https://www.youtube.com/watch?v=2t8v1NjM-zQ&t=10")).toBe("2t8v1NjM-zQ");
    expect(parseYoutube("https://youtube.com/shorts/CK3TjWGxQlo")).toBe("CK3TjWGxQlo");
    expect(parseYoutube(" -VI8e89E7Ws ")).toBe("-VI8e89E7Ws");
  });
  it("rechaza lo que no es un video", () => {
    expect(parseYoutube("https://instagram.com/darf")).toBeNull();
    expect(parseYoutube("abc")).toBeNull();
  });
});
