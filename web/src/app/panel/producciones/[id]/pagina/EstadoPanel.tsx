"use client";

import { useActionState } from "react";
import { Notice } from "@/components/panel/ui";
import { setEstado, type EditState } from "./actions";

const ACCIONES: Record<string, { estado: string; label: string; confirm: string; primary?: boolean }[]> = {
  borrador: [{ estado: "publicada", label: "Publicar", confirm: "¿Publicar la obra? Será visible para todo el público.", primary: true }],
  publicada: [
    { estado: "archivada", label: "Archivar", confirm: "¿Archivar la obra? Pasa al archivo y deja de estar en cartelera." },
    { estado: "oculta", label: "Ocultar", confirm: "¿Ocultar la obra del público? No se borra nada." },
    { estado: "borrador", label: "Volver a borrador", confirm: "¿Regresar a borrador? Dejará de ser visible para el público." },
  ],
  archivada: [
    { estado: "publicada", label: "Volver a cartelera", confirm: "¿Regresar la obra a cartelera?" },
    { estado: "oculta", label: "Ocultar", confirm: "¿Ocultar la obra del público? No se borra nada." },
  ],
  oculta: [
    { estado: "publicada", label: "Publicar", confirm: "¿Publicar la obra de nuevo?", primary: true },
    { estado: "archivada", label: "Mostrar en archivo", confirm: "¿Mostrarla en el archivo?" },
  ],
  cancelada: [{ estado: "borrador", label: "Volver a borrador", confirm: "¿Regresar a borrador?" }],
};

// Cambios de estado con confirmación. La base no deja publicar sin kit completo
// y solo quien tiene obra.publicar puede hacerlo.
export function EstadoPanel({ pid, estado, onSale }: { pid: string; estado: string; onSale: boolean }) {
  const [state, run, pending] = useActionState<EditState, FormData>(setEstado, null);
  const acciones = [
    ...(ACCIONES[estado] ?? []),
    ...(estado !== "cancelada" ? [{ estado: "cancelada", label: "Cancelar obra", confirm: "¿Cancelar la obra? Se conserva toda su información." }] : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {acciones.map((a) => (
          <form key={a.estado} action={run} onSubmit={(e) => { if (!window.confirm(a.confirm)) e.preventDefault(); }}>
            <input type="hidden" name="pid" value={pid} />
            <input type="hidden" name="estado" value={a.estado} />
            <button disabled={pending} className={a.primary ? "boton-compra rounded-full px-6 py-2.5 text-sm font-bold disabled:opacity-60" : "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60"}>
              {a.label}
            </button>
          </form>
        ))}
      </div>
      {onSale && estado === "publicada" && <p className="text-sm text-texto-3">Está en venta: para archivarla, taquilla primero debe cerrar la venta.</p>}
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
    </div>
  );
}
