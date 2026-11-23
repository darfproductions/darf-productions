import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { mensajeError } from "@/lib/errores";
import { Icono } from "~/componentes/Icono";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";

// Eliminar mi cuenta dentro de la app (lo piden Apple y Google). Igual que la web (web/src/lib/cuenta-eliminar.ts):
// la base revisa si se puede con account_delete (0077); antes se borra la foto de perfil.

export function EliminarCuenta() {
  const { sesion, cargando } = useSesion();
  const navegar = useNavigate();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const listo = texto.trim().toUpperCase() === "ELIMINAR";

  if (!cargando && !sesion) return <Navigate to="/acceso" replace />;

  const eliminar = async () => {
    if (!sesion || !listo) return;
    if (!window.confirm("¿Eliminar tu cuenta para siempre? No se puede deshacer.")) return;
    setEnviando(true);
    setError(null);
    const { data: perfil } = await supabase.from("profiles").select("foto_path").eq("id", sesion.user.id).maybeSingle();
    const { error } = await supabase.rpc("account_delete", { p_confirm: "ELIMINAR" });
    if (error) {
      setEnviando(false);
      return setError(mensajeError(error));
    }
    if (perfil?.foto_path) await supabase.storage.from("avatares").remove([perfil.foto_path as string]);
    await supabase.auth.signOut();
    navegar("/?cuenta=eliminada", { replace: true });
  };

  return (
    <main className="pantalla sin-barra">
      <div className="contenido" style={{ gap: 16 }}>
        <Link to="/cuenta" className="circulo" aria-label="Volver"><Icono nombre="atras" /></Link>
        <h1 className="titulo-grande">Eliminar mi cuenta</h1>
        <p className="suave" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>Puedes borrar tu cuenta cuando quieras. Esto no se puede deshacer.</p>

        <section className="tarjeta" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, lineHeight: 1.6 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Qué pasa al eliminarla</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="suave">
            <li>Se borran tu perfil, tu foto, tus avisos, tu lugar en el Club Fan y tus registros.</li>
            <li>Tus compras pasadas se quedan para la contabilidad de DARF, pero sin tu nombre ni tu teléfono.</li>
            <li>Ya no podrás ver tus boletos ni tu historial.</li>
          </ul>
          <h2 style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 800 }}>Cuándo no se puede (todavía)</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="suave">
            <li>Si tienes una orden pendiente de pago o boletos para una función que aún no pasa.</li>
            <li>Si tienes expediente o un papel en una producción, o vendiste boletos con tu código: <button onClick={() => navegar("/contacto")} style={{ background: "none", border: "none", padding: 0, color: "var(--acento)", fontWeight: 700, cursor: "pointer" }}>escríbenos</button> y lo hacemos contigo.</li>
          </ul>
        </section>

        <label className="campo">Escribe ELIMINAR para confirmar
          <input value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" autoCapitalize="characters" />
        </label>
        {error && <p className="aviso error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <button className="boton" onClick={eliminar} disabled={!listo || enviando} style={{ background: "#be123c", color: "#ffffff" }}>
          {enviando ? "Eliminando…" : "Eliminar mi cuenta"}
        </button>
      </div>
    </main>
  );
}
