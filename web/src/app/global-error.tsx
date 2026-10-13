"use client";

// Error en el layout raíz: no hay estilos globales, así que lleva los suyos.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#0b0910", color: "#f4f1f8", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: 24, textAlign: "center" }}>
        <title>Algo salió mal · DARF Productions</title>
        <main>
          <p style={{ letterSpacing: "0.3em", fontSize: 12, fontWeight: 700, color: "#a39db0", textTransform: "uppercase" }}>DARF Productions</p>
          <h1 style={{ fontSize: 32, margin: "12px 0" }}>Algo salió mal</h1>
          <p style={{ color: "#d3cddd", marginBottom: 24 }}>Intenta de nuevo en un momento.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#f4f1f8", color: "#0b0910", border: 0, borderRadius: 999, padding: "12px 24px", fontWeight: 700, fontSize: 15 }}>Intentar de nuevo</button>
        </main>
      </body>
    </html>
  );
}
