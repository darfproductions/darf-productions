"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveDocFile } from "@/app/expediente/actions";
import { ACCEPT_EXPEDIENTE, subirAExpediente } from "@/lib/expediente-upload";

// Subir un documento del expediente (PDF o foto, máx. 10 MB) a la carpeta privada de la persona.
export function DocUpload({ pid, uid, docTypeId, hay }: { pid: string; uid: string; docTypeId: string; hay: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function subir(file: File) {
    setMsg("");
    setBusy(true);
    try {
      const up = await subirAExpediente(pid, uid, docTypeId, file);
      if ("error" in up) return setMsg(up.error);
      const r = await saveDocFile(pid, uid, docTypeId, up.path);
      if (!r.ok) return setMsg(r.message ?? "No se pudo guardar.");
      setMsg("Archivo subido.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="cursor-pointer rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50">
        {busy ? "Subiendo…" : hay ? "Cambiar archivo" : "Subir archivo"}
        <input type="file" accept={ACCEPT_EXPEDIENTE} className="sr-only" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
      </label>
      {msg && <span className="text-xs text-texto-2">{msg}</span>}
    </span>
  );
}
