"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unirmeAlClub } from "@/lib/club-actions";

// Botón "Unirme al Club Fan" (gratis, un toque): da el número de socio y abre la Fan Zone.
export function UnirseClub() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await unirmeAlClub();
            if (r.ok) router.refresh();
            else setError(r.message);
          })
        }
        className="fb fb-fz"
      >
        {pending ? "Un momento…" : "Unirme al Club Fan · gratis"}
      </button>
      {error && <p role="alert" className="text-sm text-[#ff8fa3]">{error}</p>}
    </div>
  );
}
