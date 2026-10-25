"use client";

import { useEffect } from "react";

// Credencial y boletos sin internet (2026-10-25): en la fila del teatro a veces no hay señal. Al abrir Mi cuenta se
// guarda en este teléfono lo necesario para mostrar los QR (nombre, código y la imagen del QR) y la página
// "Sin conexión" del service worker (public/offline.html) los muestra. Los QR son tokens firmados por la base: no se
// pueden inventar. Al cerrar sesión se borra (OlvidarSinConexion en el encabezado).

export const CLAVE_SIN_CONEXION = "darf-sin-conexion";

export type GuardadoSinConexion = {
  guardado: string;
  nombre: string;
  credencial: { titulo: string; codigo: string; qr: string } | null;
  boletos: { obra: string; funcion: string; lugar: string | null; asiento: string; qr: string }[];
};

export function GuardarSinConexion({ datos }: { datos: Omit<GuardadoSinConexion, "guardado"> }) {
  useEffect(() => {
    try { localStorage.setItem(CLAVE_SIN_CONEXION, JSON.stringify({ ...datos, guardado: new Date().toISOString() })); } catch { /* sin espacio o modo privado */ }
  }, [datos]);
  return null;
}

export function OlvidarSinConexion() {
  useEffect(() => {
    try { localStorage.removeItem(CLAVE_SIN_CONEXION); } catch { /* nada */ }
  }, []);
  return null;
}
