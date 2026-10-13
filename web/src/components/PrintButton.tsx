"use client";

// Imprimir o guardar como PDF (el navegador ofrece "Guardar como PDF").
export function PrintButton({ label = "Imprimir o guardar PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full border border-white/30 px-4 py-2 text-sm font-bold hover:border-white/60 print:hidden">
      {label}
    </button>
  );
}
