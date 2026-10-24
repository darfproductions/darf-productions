import { beforeEach, describe, expect, it, vi } from "vitest";

// La bandeja "Por hacer" se recuerda 60 s por persona (2026-10-24: recalcularla en cada recarga saturó la base).
const consultas = { n: 0 };
const sesion = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ requireSession: async () => sesion }));
vi.mock("@/lib/permissions", () => ({ getPanelAccess: async () => ({ isDirector: false, byProduction: { mm: ["ventas.operar"] } }) }));
vi.mock("@/lib/panel-data", () => ({ pendingOrdersByProduction: async () => new Map([["mm", 2]]) }));
vi.mock("@/lib/adeudos", () => ({ getAdeudos: async () => ({ cobra: false, filas: [] }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => { consultas.n++; return { data: [] }; },
    from: () => ({ select: () => ({ neq: async () => ({ data: [] }) }) }),
  }),
}));

describe("pendientes del panel con memoria corta", () => {
  beforeEach(() => { consultas.n = 0; vi.useRealTimers(); });

  it("la segunda vez dentro de 60 s no vuelve a consultar; después de 60 s sí", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T16:00:00Z") });
    const { getPendientes } = await import("./panel-pendientes");
    const a = await getPendientes();
    expect(a).toEqual([{ tipo: "ordenes", production_id: "mm", n: 2 }]);
    const tras1 = consultas.n;
    expect(tras1).toBeGreaterThan(0);
    vi.setSystemTime(new Date("2026-10-24T16:00:30Z"));
    await getPendientes();
    expect(consultas.n).toBe(tras1);
    vi.setSystemTime(new Date("2026-10-24T16:01:01Z"));
    await getPendientes();
    expect(consultas.n).toBeGreaterThan(tras1);
  });

  it("cada persona tiene la suya", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T17:00:00Z") });
    const { getPendientes } = await import("./panel-pendientes");
    sesion.userId = "u2";
    await getPendientes();
    const n = consultas.n;
    sesion.userId = "u3";
    await getPendientes();
    expect(consultas.n).toBeGreaterThan(n);
    sesion.userId = "u1";
  });
});
