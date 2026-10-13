"use client";

import { useEffect } from "react";

// Registra el service worker (app instalable y notificaciones push). Sin él todo sigue funcionando.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
