"use client";

import { EscanerAcceso } from "@/components/panel/EscanerAcceso";
import { validarCredencial } from "@/app/panel/producciones/[id]/fanzone/actions";

// Entrada de un evento del Club Fan (0080): se escanea la credencial del socio y la base dice si
// puede pasar (apartó lugar, tiene boleto, hay cupo) y marca su llegada.
export function EscanerFan({ pid, eid, titulo, botonClass }: { pid: string; eid: string; titulo: string; botonClass?: string }) {
  return (
    <EscanerAcceso
      boton="Validar credenciales"
      titulo={`Club Fan · ${titulo}`}
      placeholder="FAN-XXXX o liga de la credencial"
      ayuda="Revisa que la foto corresponda a la persona. Si la cámara falla, escribe el código corto de su credencial (FAN-XXXX)."
      leer={(code) => validarCredencial(pid, eid, code)}
      botonClass={botonClass}
    />
  );
}
