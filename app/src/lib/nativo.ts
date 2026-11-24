import { registerPlugin } from "@capacitor/core";

// Complemento propio de iOS (plugins/darf-apple): Iniciar sesión con Apple y Añadir a Apple Wallet.
export type RespuestaApple = { identityToken: string; nombre: string; apellido: string; correo: string };
export const DarfApple = registerPlugin<{
  entrar(o: { nonce: string }): Promise<RespuestaApple>;
  agregarPase(o: { datos: string }): Promise<{ estado: "agregado" | "ya_estaba" | "cancelado" }>;
}>("DarfApple");
