"use client";

import { CopyLink } from "@/components/panel/CopyLink";
import { textoInvitacion } from "@/lib/guia-roles";

// Copiar la liga de una invitación al equipo o mandarla por WhatsApp (0094).
export function InvitacionBotones({ token, obra, roles }: { token: string; obra: string; roles: string[] }) {
  const path = `/invitacion/${token}`;
  return (
    <span className="flex flex-wrap gap-2">
      <CopyLink path={path} />
      <button
        type="button"
        className="rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-bold text-[#062b16]"
        onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(textoInvitacion(obra, roles, `${window.location.origin}${path}`))}`, "_blank", "noopener")}
      >
        Mandar por WhatsApp
      </button>
    </span>
  );
}
