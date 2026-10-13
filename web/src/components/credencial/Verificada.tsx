import { numeroSocio } from "@/lib/fanzone-rules";
import { anioMx } from "@/lib/gafete-rules";

// Resultado de escanear una credencial que no es gafete (0080/0083): socio del Club Fan o cuenta
// DARF verificada, o no válida. Solo nombre corto y número; nunca datos de contacto.
export function Verificada({ nombre, socio }: { nombre: string; socio: { numero: number; desde: string; fundador: boolean } | null }) {
  return (
    <section aria-label="Credencial verificada" className={`flex w-[min(360px,90vw)] flex-col items-center gap-3 rounded-[26px] border px-6 py-8 ${socio ? "border-oro/50 bg-[radial-gradient(120%_70%_at_50%_0%,rgb(215_187_95/0.25),transparent_60%),linear-gradient(170deg,#1a1622,#0b0910)]" : "border-linea-2 bg-telon"}`}>
      <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-[#14532d] text-3xl text-[#bbf7d0]">✓</span>
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#bbf7d0]">{socio ? "Socio del Club Fan verificado" : "Cuenta DARF verificada"}</p>
      <p className="text-3xl font-black uppercase">{nombre || (socio ? "Socio" : "Asistente")}</p>
      {socio && (
        <>
          <p className="text-lg font-bold text-oro">{numeroSocio(socio.numero)}{socio.fundador ? " · Fan fundador" : ""}</p>
          <p className="text-xs uppercase tracking-[0.2em] text-texto-3">Socio desde {anioMx(new Date(socio.desde))}</p>
        </>
      )}
    </section>
  );
}

export function NoValida() {
  return (
    <section aria-label="Credencial no válida" className="flex w-[min(360px,90vw)] flex-col items-center gap-3 rounded-[26px] border border-[#ff8fa3]/50 px-6 py-8">
      <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-[#5a1a22] text-3xl text-[#fecdd3]">✕</span>
      <p className="text-lg font-bold">Credencial no válida</p>
      <p className="text-sm text-texto-3">Puede que se haya regenerado. Pide a la persona que abra su credencial en Mi cuenta.</p>
    </section>
  );
}
