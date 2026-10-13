// ─── Configuración pública de Supabase ──────────────────────────────────
// La publishable key es pública por diseño (equivalente a la anon key) —
// puede vivir en el frontend/commitearse. NUNCA poner aquí la service_role
// key ni ningún secreto administrativo. Toda operación sensible se protege
// en el servidor vía RLS + RPC `SECURITY DEFINER`, no desde este archivo.
//
// RAMA darf-2.0 → SOLO el proyecto Supabase "DARF 2.0 DEV" (datos ficticios).
// La configuración de producción no existe en esta rama a propósito: así
// ninguna copia de 2.0 (local, preview de Vercel) puede tocar la boletería
// real. Vuelve solo en la migración final aprobada (docs/DARF-2.0-FASE-0.md).
// `scripts/check-isolation.sh` falla si aparece otro proyecto Supabase.
window.DARF_CONFIG = {
  ENV: 'DEV',
  SUPABASE_URL: 'https://qgywscczyzuqinutuvak.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_sNdLJ6lK6-0gAESg6hkQxQ_YSqusOUM'
};

// Aviso visible en todas las pantallas para no confundir DEV con la web real.
(function(){
  if (window.DARF_CONFIG.ENV !== 'DEV') return;
  function show(){
    if (document.getElementById('darf-env-banner')) return;
    var b = document.createElement('div');
    b.id = 'darf-env-banner';
    b.setAttribute('role', 'status');
    b.textContent = 'ENTORNO DE PRUEBAS — DARF 2.0 DEV · datos ficticios · no es la web real';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
      'background:#FFD400;color:#000;font:700 12px/1.4 system-ui,sans-serif;' +
      'text-align:center;padding:6px 12px;letter-spacing:.04em;pointer-events:none';
    document.body.appendChild(b);
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
