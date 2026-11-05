"use client";

// Descargar como PDF: abre el diálogo de impresión del navegador ("Guardar como PDF"). La página trae estilos de
// impresión: sin menú ni botones, en blanco y negro.
export function ImprimirBoton({ children = "Descargar PDF" }: { children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala print:hidden">
      {children}
    </button>
  );
}
