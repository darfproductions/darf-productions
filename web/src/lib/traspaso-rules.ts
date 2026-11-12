// Pasar boletos a otra persona (0142). Reglas puras con pruebas en traspaso-rules.test.ts; la base valida todo otra vez.

export type BoletoPasable = { id: string; is_active: boolean; checked_in_at: string | null };
export type Traspaso = {
  id: string; order_id: string; new_order_id: string | null; estado: "pendiente" | "aceptada" | "cancelada"; token: string;
  created_at: string; resolved_at: string | null; direccion: "enviado" | "recibido"; to_email: string | null; to_nombre: string | null;
  from_nombre: string; boletos: number; etiquetas: string[] | null; mensaje: string | null;
};

/** Boletos que todavía se pueden pasar: activos y sin usar (la base además rechaza los que ya están en un traspaso pendiente). */
export function boletosPasables<T extends BoletoPasable>(tickets: T[]): T[] {
  return tickets.filter((t) => t.is_active && !t.checked_in_at);
}

/** ¿Se puede pasar algo de esta orden? Pagada, función por venir y con boletos sin usar. */
export function puedePasar(o: { status: string; tickets: BoletoPasable[] }, startsAt: string | null, cancelada: boolean, ahora: Date = new Date()): boolean {
  if (o.status !== "aprobado" || cancelada || !startsAt) return false;
  if (new Date(startsAt).getTime() <= ahora.getTime()) return false;
  return boletosPasables(o.tickets).length > 0;
}

export function correoValido(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

const plural = (n: number) => (n === 1 ? "1 boleto" : `${n} boletos`);

/** Lo que ve quien mandó, debajo de su orden. */
export function textoEnviado(t: Traspaso): string {
  const quien = t.to_nombre ?? t.to_email ?? "alguien";
  if (t.estado === "aceptada") return `Pasaste ${plural(t.boletos)} a ${quien}. Ya los tiene en su cuenta.`;
  if (t.estado === "cancelada") return `Cancelaste el traspaso de ${plural(t.boletos)} a ${quien}.`;
  return `Pasaste ${plural(t.boletos)} a ${quien} · esperando que los acepte.`;
}

/** Lo que ve quien recibió, arriba de su orden nueva. */
export function textoRecibido(t: Traspaso): string {
  return `Te ${t.boletos === 1 ? "lo pasó" : "los pasó"} ${t.from_nombre}${t.mensaje ? `: «${t.mensaje}»` : "."}`;
}

/** Liga que se comparte (sirve aunque la otra persona todavía no tenga cuenta). */
export function ligaTraspaso(origen: string, token: string): string {
  return `${origen.replace(/\/$/, "")}/cuenta/traspaso/${token}`;
}

/** Mensaje de WhatsApp para mandar la liga (sin número: la persona elige el chat). */
export function whatsappTraspasoUrl(o: { obra: string; funcion: string; boletos: number; liga: string }): string {
  const texto = `Te paso ${plural(o.boletos)} para ${o.obra} (${o.funcion}). Acéptalos aquí con tu cuenta de DARF: ${o.liga}`;
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** Estado de la liga para quien la abre. */
export function estadoLiga(info: { estado: string; vencida: boolean; para_mi: boolean; soy_quien_manda: boolean }): "aceptar" | "aceptada" | "cancelada" | "vencida" | "otra_cuenta" | "soy_yo" {
  if (info.soy_quien_manda) return "soy_yo";
  if (info.estado === "aceptada") return "aceptada";
  if (info.estado === "cancelada") return "cancelada";
  if (info.vencida) return "vencida";
  if (!info.para_mi) return "otra_cuenta";
  return "aceptar";
}
