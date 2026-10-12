# DARF 2.0 — Plan: qué hay, qué falta y en qué orden (2026-10-12)

Lista viva de trabajo. Cada bloque se hace en `darf-2.0`, se prueba en DEV y necesita el
visto bueno de Diego antes del siguiente. **Nada se publica en producción hasta el bloque
final (Lanzamiento) y con aprobación explícita.**

## Ya hecho (en DEV)

| Área | Qué hay |
|---|---|
| Web pública | Portada, cartelera, página de obra con tema propio, Fan Zone (videos y galería), audiciones públicas, contacto, programa de mano (plantilla, enlace o archivo, con QR) |
| Compra | Mapa de asientos, códigos de descuento, códigos de vendedor con link, aprobación por WhatsApp, boletos con QR, Mis boletos |
| Panel | Roles por obra y personalizados, bitácora, usuarios, editor de obra, funciones y precios, órdenes, taquilla, puerta, descuentos, vendedores, reportes por obra |
| Audiciones | Por obra y generales, plantillas (abierta, escuela, cerrada, en línea, por invitación, guardadas), criterios propios, horarios, día en vivo con QR, jueces, tablero, ofertas de papel |
| Elenco | Expediente único, documentos dirigidos, mensualidades e inscripción, incidencias y advertencias, ensayos y asistencia, materiales, comunicados con lectura, bajas e ingresos tardíos |
| Talento | Ficha por persona (con o sin cuenta), historial, unir duplicados, ligar fichas a cuentas, compras y funciones vistas |

## Lo que sigue

### 1. Mi cuenta completa (pedido de Diego) — HECHO (0051, ver FASE-3 §17)

- **Datos personales:**
  - nombre y apellidos por separado;
  - teléfono;
  - fecha de nacimiento.
- **Correo:** cambio con verificación (llega un enlace al correo nuevo).
- **Contraseña:** cambio seguro desde Mi cuenta (pide la actual) y la opción "Olvidé mi
  contraseña" en Entrar.
- **Foto de perfil** personal, distinta del retrato profesional que sale en los créditos.
- **Una sola fecha de nacimiento:** la del expediente y la de la cuenta son la misma; se
  captura una vez.
- **Cumpleaños:**
  - el Director ve todos;
  - cada producción ve los de su elenco y equipo, con "cumpleaños del mes" en el panel y
    en el portal del elenco.
- **Historial más claro:** próximas funciones y funciones pasadas, detalle de cada compra
  (visión §9.3).

### 2. Fan Zone ampliada — HECHO (0052, ver FASE-3 §18)

- Además de videos: enlaces, documentos (PDF), fotos sueltas, textos o avisos.
- Acomodar el orden arrastrando o con flechas, y elegir qué se destaca arriba.

### 3. Reporte general del Director y cierre de temporada — HECHO (0053, ver FASE-3 §19)

- **Todas las obras juntas:**
  - ventas;
  - ocupación;
  - vendedores;
  - lo cobrado en talleres;
  - asistencia.
- **Cierre de temporada:**
  - pasar la obra a archivo;
  - congelar el elenco y los créditos;
  - resumen final descargable.

### 4. Boletería y compra (Fase 4) — HECHO (0054–0056, ver `docs/DARF-2.0-FASE-4.md`)

- Mapa de asientos y compra más cómodos en celular; mensajes más claros.
- Vencimiento automático de órdenes pendientes (liberar asientos si no pagan a tiempo).
- Admisión general (sin asiento) donde haga falta.
- Pruebas obligatorias (visión §8.3):
  - compras simultáneas;
  - precios y descuentos;
  - aprobación, rechazo y cancelación;
  - códigos QR;
  - pruebas por rol.

### 5. Avisos por correo y WhatsApp — requiere proveedor externo y tu aprobación

- **Correo** (p. ej. Resend): confirmaciones de compra, comunicados y recordatorios de
  ensayo, con marca de leído.
- **WhatsApp:** API de WhatsApp Business de Meta. Requiere verificar el negocio y tiene costo
  por conversación.

### 6. Perfil profesional — HECHO (0057, ver FASE-3 §20)

- Retrato profesional, semblanza y trayectoria (obras DARF y externas), con fotos.
- Habilidades: canto, baile, instrumentos y aéreos.
- Opción de mostrar el perfil al público en los créditos.

### 7. Escuela — HECHO (0058, ver FASE-3 §21)

- Rúbrica de evaluación por producción, editable por los maestros.

### 8. DARFY, asistente virtual (Fase 6 de la visión)

- Responde preguntas del público con información autorizada (funciones, compra, obras).
- Nunca muestra datos privados.

### 9. Lanzamiento (fase final) — nada de esto se hace sin tu aprobación

1. Revisión completa en celular y escritorio, y tu aprobación final del diseño.
2. Aviso de privacidad (menores, expedientes, evaluaciones), idealmente revisado por
   alguien con conocimiento legal.
3. **Planes pagos:**
   - Vercel Pro, porque el plan Hobby no permite uso comercial;
   - Supabase Pro, para tener respaldos.
4. Respaldo completo de la base de producción.
5. **Migración planificada de datos reales de la 1.0:**
   - cuentas;
   - órdenes y boletos;
   - vendedores;
   - obras;
   - elenco;
   - fotos: cada foto se optimiza al copiarla de la 1.0 a la 2.0 (mismo método que las
     fotos nuevas). Las originales quedan intactas en la 1.0 como respaldo (decisión de
     Diego, 2026-10-12).
6. Pruebas finales, plan de reversión y ensayo del cambio en DEV.
7. Cambio de dominio en GoDaddy y Vercel, el día acordado.

### 10. Notas de Diego del 12 de octubre (en curso)

1. **Ver contraseña y fotos optimizadas — HECHO.** Botón de ojo en todos los campos de
   contraseña. Las fotos se reducen en el navegador antes de subir (WebP o JPEG; los PNG con
   transparencia se quedan en PNG).
2. **Panel — HECHO (0061).** Menú en Inicio · Proyectos · Personas · Reportes · Ajustes.
   Directorio que une Usuarios y Talento, e inicio "Tu día" (pendientes, semana, cumpleaños
   y cambios recientes).
3. **Mapas de asientos — HECHO (0062).** Funciones y boletos → Mapa de asientos: zonas con
   color, generador por filas con vista previa, ajuste asiento por asiento (quitar, volver
   a poner, cambiar zona) y copiar de otra obra. Con boletos vendidos ya no se regenera, y
   no se quitan asientos vendidos para funciones próximas.
4. **Boletos bonitos — HECHO.** En Mi cuenta hay una tarjeta por orden, con el logo y los
   colores de la obra, y un botón "Ver boletos" que abre una ventana con un boleto
   diseñado por asiento (flechas o deslizar). El PDF se dibuja en el navegador con el
   mismo diseño; el del servidor queda de respaldo. Apple y Google Wallet en espera.
5. **Equipo DARF:** página pública `/nosotros` con los directivos.

## Orden recomendado

1 → 2 → 3, luego 4. El 5 se puede adelantar si Diego aprueba el proveedor. 6 y 8 van después;
el 7 queda en espera. El 9 va al final.
