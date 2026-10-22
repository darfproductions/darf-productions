"use client";

// Abre WhatsApp con la invitación y la liga completa (sirve en DEV y en producción).
export function CompartirWhatsApp({ path, texto }: { path: string; texto: string }) {
  return (
    <button type="button" className="rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-bold text-[#062b16]"
      onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${window.location.origin}${path}`)}`, "_blank", "noopener")}>
      Compartir por WhatsApp
    </button>
  );
}
