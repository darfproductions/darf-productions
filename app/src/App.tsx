import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { App as AppNativa } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Barra } from "~/componentes/Barra";
import { AparienciaProvider } from "~/lib/apariencia";
import { completarRegreso, REGRESO } from "~/lib/entrar-social";
import { SesionProvider } from "~/lib/sesion";
import { Acceso, destinoTrasEntrar } from "~/pantallas/Acceso";
import { Boletos, PasarBoletos } from "~/pantallas/Boletos";
import { Cuenta } from "~/pantallas/Cuenta";
import { EliminarCuenta } from "~/pantallas/EliminarCuenta";
import { Notificaciones } from "~/pantallas/Notificaciones";
import { Credencial } from "~/pantallas/Credencial";
import { EditarPerfil, MisEventos, MisVentas, Transacciones } from "~/pantallas/CuentaSecciones";
import { MisHonorarios, PerfilProfesional } from "~/pantallas/CuentaPro";
import { Artista, Contacto, Nosotros } from "~/pantallas/Paginas";
import { Audicion, Audiciones } from "~/pantallas/Audiciones";
import { Comprar } from "~/pantallas/Comprar";
import { Eventos, FanZone } from "~/pantallas/FanZone";
import { Inicio } from "~/pantallas/Inicio";
import { Obra } from "~/pantallas/Obra";
import { Obras } from "~/pantallas/Obras";

// La barra de pestañas solo va en las cuatro pantallas principales; el detalle de una obra y el acceso la ocultan.
const CON_BARRA = new Set(["/", "/obras", "/boletos", "/cuenta"]);

function Marco() {
  const { pathname } = useLocation();
  const navegar = useNavigate();

  useEffect(() => window.scrollTo(0, 0), [pathname]);

  // Regreso de "Continuar con Google" (com.darfproductions.app://auth/callback?code=…): abre la sesión.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = AppNativa.addListener("appUrlOpen", ({ url }) => {
      if (!url.startsWith(REGRESO)) return;
      completarRegreso(url)
        .then((ok) => ok && navegar(destinoTrasEntrar(), { replace: true }))
        .catch(() => navegar("/acceso?error=regreso", { replace: true }));
    });
    return () => { h.then((x) => x.remove()); };
  }, [navegar]);

  // Botón "atrás" de Android: regresa dentro de la app; en Inicio, sale.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = AppNativa.addListener("backButton", ({ canGoBack }) => (canGoBack && pathname !== "/" ? navegar(-1) : AppNativa.exitApp()));
    return () => { h.then((x) => x.remove()); };
  }, [pathname, navegar]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/obras" element={<Obras />} />
        <Route path="/obras/:id" element={<Obra />} />
        <Route path="/boletos" element={<Boletos />} />
        <Route path="/boletos/:orden/pasar" element={<PasarBoletos />} />
        <Route path="/cuenta" element={<Cuenta />} />
        <Route path="/cuenta/eliminar" element={<EliminarCuenta />} />
        <Route path="/notificaciones" element={<Notificaciones />} />
        <Route path="/cuenta/credencial" element={<Credencial />} />
        <Route path="/cuenta/perfil" element={<EditarPerfil />} />
        <Route path="/cuenta/transacciones" element={<Transacciones />} />
        <Route path="/cuenta/eventos" element={<MisEventos />} />
        <Route path="/cuenta/ventas" element={<MisVentas />} />
        <Route path="/cuenta/honorarios" element={<MisHonorarios />} />
        <Route path="/cuenta/perfil-profesional" element={<PerfilProfesional />} />
        <Route path="/comprar/:funcion" element={<Comprar />} />
        <Route path="/fan-zone" element={<FanZone />} />
        <Route path="/eventos" element={<Eventos />} />
        <Route path="/audiciones" element={<Audiciones />} />
        <Route path="/audiciones/:id" element={<Audicion />} />
        <Route path="/contacto" element={<Contacto />} />
        <Route path="/nosotros" element={<Nosotros />} />
        <Route path="/artista/:slug" element={<Artista />} />
        <Route path="/acceso" element={<Acceso />} />
        <Route path="*" element={<Inicio />} />
      </Routes>
      {CON_BARRA.has(pathname) && <><div className="barra-estado" aria-hidden="true" /><Barra /></>}
    </>
  );
}

export function App() {
  return (
    <AparienciaProvider>
      <SesionProvider>
        <BrowserRouter>
          <Marco />
        </BrowserRouter>
      </SesionProvider>
    </AparienciaProvider>
  );
}
