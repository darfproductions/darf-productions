import { redirect } from "next/navigation";

// Equipo DARF (0063) se reemplazó por Casa DARF (0105): "Conoce al equipo" sale de los puestos de
// Ajustes → Casa DARF. La liga vieja lleva ahí; el portal del equipo sigue en /panel/personas/equipo/portal.
export default function EquipoDarf() {
  redirect("/panel/ajustes/casa");
}
