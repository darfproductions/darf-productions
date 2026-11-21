import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { App as AppNativa } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Barra } from "~/componentes/Barra";
import { AparienciaProvider } from "~/lib/apariencia";
import { SesionProvider } from "~/lib/sesion";
import { Acceso } from "~/pantallas/Acceso";
import { Boletos } from "~/pantallas/Boletos";
import { Cuenta } from "~/pantallas/Cuenta";
import { Inicio } from "~/pantallas/Inicio";
import { Obra } from "~/pantallas/Obra";
import { Obras } from "~/pantallas/Obras";

// La barra de pestañas solo va en las cuatro pantallas principales; el detalle de una obra y el acceso la ocultan.
const CON_BARRA = new Set(["/", "/obras", "/boletos", "/cuenta"]);

function Marco() {
  const { pathname } = useLocation();
  const navegar = useNavigate();

  useEffect(() => window.scrollTo(0, 0), [pathname]);

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
        <Route path="/cuenta" element={<Cuenta />} />
        <Route path="/acceso" element={<Acceso />} />
        <Route path="*" element={<Inicio />} />
      </Routes>
      {CON_BARRA.has(pathname) && <Barra />}
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
