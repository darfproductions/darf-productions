/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// La app reutiliza las reglas puras de la web (web/src/lib/*-rules.ts, poster.ts, dates.ts…) con el mismo alias
// "@" que usa la web, para que la lógica de cartelera, precios y boletos viva en un solo lugar.
// Solo se importan archivos sin dependencias de Next ni del servidor.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../web/src", import.meta.url)),
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: { fs: { allow: [".."] } },
  build: { outDir: "dist", target: "es2022", chunkSizeWarningLimit: 900 },
  test: { include: ["src/**/*.test.ts"] },
});
