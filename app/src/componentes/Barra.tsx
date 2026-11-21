import { NavLink } from "react-router";
import { Icono, type NombreIcono } from "~/componentes/Icono";

// Barra de pestañas flotante (abajo, al alcance del pulgar).
const PESTANAS: { a: string; texto: string; icono: NombreIcono }[] = [
  { a: "/", texto: "Inicio", icono: "inicio" },
  { a: "/obras", texto: "Obras", icono: "obras" },
  { a: "/boletos", texto: "Boletos", icono: "boletos" },
  { a: "/cuenta", texto: "Cuenta", icono: "cuenta" },
];

export function Barra() {
  return (
    <nav className="barra" aria-label="Navegación principal">
      {PESTANAS.map((p) => (
        <NavLink key={p.a} to={p.a} end={p.a === "/"}>
          <Icono nombre={p.icono} />
          {p.texto}
        </NavLink>
      ))}
    </nav>
  );
}
