"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Vuelve a cargar los datos cada cierto tiempo (varias personas usan la lista a la vez).
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
