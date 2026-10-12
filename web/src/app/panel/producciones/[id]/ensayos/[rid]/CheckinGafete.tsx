"use client";

import { EscanerAcceso } from "@/components/panel/EscanerAcceso";
import { leerGafete } from "../actions";

// Mesa de asistencia (0078): la computadora o el celular lee el gafete de cada integrante al llegar.
export function CheckinGafete({ pid, rid }: { pid: string; rid: string }) {
  return (
    <EscanerAcceso
      boton="Checar con gafete"
      titulo="Asistencia con gafete"
      placeholder="DRF-XXXX o liga del gafete"
      ayuda="Revisa que la foto corresponda a la persona. Si la cámara falla, escribe el código corto de su gafete (DRF-XXXX)."
      leer={(code) => leerGafete(pid, rid, code)}
    />
  );
}
