"use client";

import { useId, useRef, useState } from "react";
import { buscarCuentas, type CuentaEncontrada } from "@/lib/cuentas-actions";
import { input as inputCls } from "@/components/panel/ui";

// Buscar a una persona por nombre o correo (0105). Escribe el nombre y elige de la lista, o escribe un
// correo completo (para invitar a alguien que aún no tiene cuenta). El formulario recibe en `name`
// "cuenta:<id>" o el correo escrito.
export function BuscarCuenta({ name = "email", placeholder = "Nombre o correo", required = true, className = "" }: {
  name?: string; placeholder?: string; required?: boolean; className?: string;
}) {
  const [texto, setTexto] = useState("");
  const [valor, setValor] = useState("");
  const [lista, setLista] = useState<CuentaEncontrada[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const pedido = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  // Busca 250 ms después de dejar de escribir; solo vale la respuesta más reciente.
  const buscar = (t: string) => {
    if (espera.current) clearTimeout(espera.current);
    const n = ++pedido.current;
    if (t.trim().length < 2) { setLista([]); return; }
    espera.current = setTimeout(async () => {
      const r = await buscarCuentas(t);
      if (n === pedido.current) { setLista(r); setActivo(-1); }
    }, 250);
  };

  const elegir = (c: CuentaEncontrada) => {
    setTexto(`${c.nombre} · ${c.correo}`);
    setValor(`cuenta:${c.id}`);
    setAbierto(false);
    setLista([]);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        className={`${inputCls} w-full`} type="text" autoComplete="off" required={required} placeholder={placeholder}
        role="combobox" aria-expanded={abierto && lista.length > 0} aria-controls={`${id}-lista`} aria-autocomplete="list"
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setValor(e.target.value.trim()); setAbierto(true); buscar(e.target.value); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (!abierto || lista.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, lista.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && activo >= 0) { e.preventDefault(); elegir(lista[activo]); }
        }}
      />
      <input type="hidden" name={name} value={valor} />
      {abierto && lista.length > 0 && (
        <ul id={`${id}-lista`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-white/15 bg-sala py-1 text-sm shadow-xl">
          {lista.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === activo}
              onMouseDown={(e) => { e.preventDefault(); elegir(c); }}
              className={`flex cursor-pointer flex-col px-3 py-2 ${i === activo ? "bg-white/10" : "hover:bg-white/5"}`}>
              <span className="font-semibold">{c.nombre}</span>
              <span className="text-xs text-texto-3">{c.correo}{c.con_ficha ? "" : " · sin ficha"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
