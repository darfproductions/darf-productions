// ─── SUPABASE ───────────────────────────────────────────────────────────
// URL + publishable key viven en js/config.js (públicas por diseño, se
// commitean). El módulo DB de abajo se está reemplazando gradualmente por
// llamadas a `sb` — AuthService, checkout, staff, etc. ya están escritos
// contra la interfaz de DB, no contra localStorage directamente, así que el
// swap se hace método por método sin tocar el resto de la app.
const sb = (window.supabase && window.DARF_CONFIG)
  ? window.supabase.createClient(window.DARF_CONFIG.SUPABASE_URL, window.DARF_CONFIG.SUPABASE_ANON_KEY)
  : null;

function clearEl(el){ if(el){ while(el.firstChild) el.removeChild(el.firstChild); } }

function togglePass(btn, inputId){
  var input=document.getElementById(inputId);
  if(!input)return;
  if(input.type==='password'){ input.type='text'; btn.textContent='🙈'; }
  else { input.type='password'; btn.textContent='👁'; }
}

// ─── DB LOCAL (mock funcional, listo para reemplazar por Supabase) ──
const DB = (function(){
  const KEYS = {orders:'darf_orders', productions:'darf_productions', performances:'darf_performances', contact:'darf_contact', blocked:'darf_blocked', sellers:'darf_sellers'};
  const listeners = {};

  function read(key, fallback){
    try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch(e){ return fallback; }
  }
  function write(key, val){
    localStorage.setItem(key, JSON.stringify(val));
    notify(key);
  }
  function notify(key){ (listeners[key]||[]).forEach(function(fn){ try{ fn(); }catch(e){} }); }
  function subscribe(key, fn){ (listeners[key]=listeners[key]||[]).push(fn); }
  window.addEventListener('storage', function(e){ if(e.key && listeners[e.key]) notify(e.key); });

  function uid(){
    if(window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'id-'+Date.now()+'-'+Math.random().toString(16).slice(2);
  }
  function genOrderCode(){
    // Código corto y legible para dar seguimiento a una solicitud (staff <-> WhatsApp),
    // distinto del id interno (uid) que es un UUID largo pensado para el almacenamiento, no para
    // que un humano lo lea/dicte por WhatsApp.
    var chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var existing = {};
    getOrders().forEach(function(o){ if(o.codigoOrden) existing[o.codigoOrden]=true; });
    var code;
    do{
      code='DARF-';
      for(var i=0;i<6;i++){ code+=chars.charAt(Math.floor(Math.random()*chars.length)); }
    } while(existing[code]);
    return code;
  }

  let productionsCache = {};
  async function loadProductions(){
    if(!sb) return productionsCache;
    const { data, error } = await sb.from('productions').select();
    if(error) return productionsCache;
    const p = {};
    data.forEach(function(row){
      p[row.id] = {
        id: row.id, nombre: row.nombre, venue: row.venue, fecha: row.fecha,
        price: Number(row.price), capacity: row.capacity,
        onSale: row.on_sale, concluded: !!row.concluded, attendeesHistoric: row.attendees_historic
      };
    });
    productionsCache = p;
    notify(KEYS.productions);
    return productionsCache;
  }
  function getProductions(){ return productionsCache; }
  function getProduction(id){ return productionsCache[id]||null; }
  async function setProductionOnSale(id, onSale){
    if(!sb) return false;
    const { error } = await sb.from('productions').update({on_sale: !!onSale}).eq('id', id);
    if(error) return false;
    if(productionsCache[id]) productionsCache[id].onSale = !!onSale;
    notify(KEYS.productions);
    return true;
  }
  async function setProductionConcluded(id, concluded){
    if(!sb) return false;
    // Una producción concluida no puede seguir en venta (check en 0017).
    const patch = concluded ? {concluded:true, on_sale:false} : {concluded:false};
    const { error } = await sb.from('productions').update(patch).eq('id', id);
    if(error) return false;
    await loadProductions();
    return true;
  }
  function slugify(nombre){
    return (nombre||'').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40) || 'prod';
  }
  async function createProduction(fields){
    if(!sb) return {ok:false, error:'No hay conexión con el servidor.'};
    if(!fields.nombre) return {ok:false, error:'Escribe el nombre de la producción.'};
    var base = slugify(fields.nombre);
    var id = base;
    var n = 2;
    while(productionsCache[id]){ id = base+'-'+n; n++; }
    const { error } = await sb.from('productions').insert({
      id: id, nombre: fields.nombre, venue: fields.venue||null, fecha: fields.fecha||null,
      price: Number(fields.price)||0, capacity: fields.capacity?Number(fields.capacity):null
    });
    if(error) return {ok:false, error: error.message};
    await loadProductions();
    return {ok:true, id: id};
  }
  async function updateProduction(id, patch){
    if(!sb) return false;
    const { error } = await sb.from('productions').update({
      nombre: patch.nombre, venue: patch.venue||null, fecha: patch.fecha||null,
      price: Number(patch.price)||0, capacity: patch.capacity?Number(patch.capacity):null
    }).eq('id', id);
    if(error) return false;
    await loadProductions();
    return true;
  }

  let performancesCache = [];
  async function loadPerformances(){
    if(!sb) return performancesCache;
    const { data, error } = await sb.from('performances').select().order('starts_at');
    if(error) return performancesCache;
    performancesCache = data;
    notify(KEYS.performances);
    return performancesCache;
  }
  function getPerformances(){ return performancesCache; }
  function getPerformancesForProduction(productionId){
    return performancesCache.filter(function(p){ return p.production_id===productionId; });
  }
  async function createPerformance(productionId, fields){
    if(!sb) return {ok:false, error:'No hay conexión con el servidor.'};
    const { error } = await sb.from('performances').insert({
      production_id: productionId, starts_at: fields.startsAt, venue: fields.venue||null,
      on_sale: !!fields.onSale
    });
    if(error) return {ok:false, error: error.message};
    await loadPerformances();
    return {ok:true};
  }
  async function updatePerformance(id, patch){
    if(!sb) return false;
    const { error } = await sb.from('performances').update({
      starts_at: patch.startsAt, venue: patch.venue||null, on_sale: !!patch.onSale
    }).eq('id', id);
    if(error) return false;
    await loadPerformances();
    return true;
  }

  async function deletePerformance(id){
    if(!sb) return {ok:false, error:'No hay conexión con el servidor.'};
    const { error } = await sb.rpc('admin_delete_performance', { target_performance_id: id });
    if(error) return {ok:false, error: error.message};
    await loadPerformances();
    return {ok:true};
  }

  function getOrders(){ return read(KEYS.orders, []); }
  function saveOrders(list){ write(KEYS.orders, list); }
  function createOrder(order){
    const orders = getOrders();
    const o = Object.assign({
      id: uid(), codigoOrden: genOrderCode(), status:'pendiente', qrCode:null, checkedIn:false,
      createdAt: Date.now(), approvedAt:null
    }, order);
    orders.push(o);
    saveOrders(orders);
    return o;
  }
  function updateOrder(id, patch){
    const orders = getOrders();
    const idx = orders.findIndex(function(o){ return o.id===id; });
    if(idx<0) return null;
    orders[idx] = Object.assign({}, orders[idx], patch);
    saveOrders(orders);
    return orders[idx];
  }
  function approveOrder(id){
    const order = getOrders().find(function(o){ return o.id===id; });
    if(!order) return null;
    const seatQrs = {};
    (order.seats||[]).forEach(function(s){ seatQrs[s]=uid(); });
    releaseSeats(order.productionId, order.seats||[]);
    return updateOrder(id, {status:'aprobado', qrCode: order.qrCode || uid(), seatQrs: seatQrs, checkedInSeats:{}, approvedAt: Date.now()});
  }
  function rejectOrder(id){
    return updateOrder(id, {status:'rechazado'});
  }
  function getPendingOrders(){ return getOrders().filter(function(o){ return o.status==='pendiente'; }); }
  function getPendingOrdersFor(productionId){ return getOrders().filter(function(o){ return o.status==='pendiente' && o.productionId===productionId; }); }
  function getOrdersForUser(userId){ return getOrders().filter(function(o){ return o.userId===userId; }); }
  function getOrdersForProduction(productionId){ return getOrders().filter(function(o){ return o.productionId===productionId; }); }
  function getSeatsTaken(productionId){
    const taken = {};
    const blocked = getBlockedSeats(productionId);
    Object.keys(blocked).forEach(function(s){ taken[s]='bloqueado'; });
    getOrders().forEach(function(o){
      if(o.productionId===productionId && (o.status==='pendiente'||o.status==='aprobado')){
        (o.seats||[]).forEach(function(s){
          if(o.status==='aprobado' && o.checkedInSeats && o.checkedInSeats[s]) taken[s]='usado';
          else taken[s]=o.status;
        });
      }
    });
    return taken; // {seatId: 'pendiente'|'aprobado'|'usado'|'bloqueado'}
  }
  function getBlockedSeats(productionId){
    const all = read(KEYS.blocked, {});
    return all[productionId] || {};
  }
  function releaseSeats(productionId, seats){
    const all = read(KEYS.blocked, {});
    const cur = Object.assign({}, all[productionId]||{});
    (seats||[]).forEach(function(s){ delete cur[s]; });
    all[productionId]=cur;
    write(KEYS.blocked, all);
  }
  function getApprovedCount(productionId){
    let n=0;
    getOrders().forEach(function(o){
      if(o.productionId===productionId && o.status==='aprobado') n += (o.seats||[]).length;
    });
    return n;
  }

  let sellersCache = [];
  async function loadSellers(){
    if(!sb) return sellersCache;
    const { data, error } = await sb.from('sellers').select().order('created_at');
    if(error) return sellersCache;
    sellersCache = data;
    notify(KEYS.sellers);
    return sellersCache;
  }
  function getSellers(){ return sellersCache; }
  function normCode(codigo){ return (codigo||'').trim().toUpperCase(); }
  function getSellerByCode(codigo){
    const norm = normCode(codigo);
    if(!norm) return null;
    return sellersCache.find(function(s){ return s.codigo===norm; }) || null;
  }
  async function addSeller(nombre, codigo){
    nombre = (nombre||'').trim();
    const norm = normCode(codigo);
    if(!nombre) return {ok:false, error:'Escribe el nombre del vendedor.'};
    if(!norm) return {ok:false, error:'Escribe un código.'};
    if(getSellerByCode(norm)) return {ok:false, error:'Ese código ya está en uso.'};
    if(!sb) return {ok:false, error:'No hay conexión con el servidor.'};
    const { data, error } = await sb.from('sellers').insert({nombre:nombre, codigo:norm}).select().single();
    if(error) return {ok:false, error: error.message};
    await loadSellers();
    return {ok:true, seller:data};
  }
  async function deleteSeller(id){
    if(!sb) return false;
    const { error } = await sb.from('sellers').delete().eq('id', id);
    if(error) return false;
    await loadSellers();
    return true;
  }

  let contactMessagesCache = [];
  async function loadContactMessages(){
    if(!sb) return contactMessagesCache;
    const { data, error } = await sb.from('contact_messages').select().order('created_at');
    if(error) return contactMessagesCache;
    contactMessagesCache = data;
    notify(KEYS.contact);
    return contactMessagesCache;
  }
  function getContactMessages(){ return contactMessagesCache; }
  async function createContactMessage(msg){
    if(!sb) return false;
    const { error } = await sb.from('contact_messages').insert({
      nombre: msg.nombre, correo: msg.correo, telefono: msg.telefono||null,
      asunto: msg.asunto||null, mensaje: msg.mensaje
    });
    return !error;
  }
  async function deleteContactMessage(id){
    if(!sb) return false;
    const { error } = await sb.from('contact_messages').delete().eq('id', id);
    if(error) return false;
    await loadContactMessages();
    return true;
  }

  return {
    KEYS, subscribe,
    loadProductions, getProductions, getProduction, setProductionOnSale, setProductionConcluded, createProduction, updateProduction,
    loadPerformances, getPerformances, getPerformancesForProduction, createPerformance, updatePerformance, deletePerformance,
    getOrders, createOrder, updateOrder, approveOrder, rejectOrder,
    getPendingOrders, getPendingOrdersFor, getOrdersForUser, getOrdersForProduction,
    getSeatsTaken, getApprovedCount,
    loadContactMessages, getContactMessages, createContactMessage, deleteContactMessage,
    getBlockedSeats, releaseSeats,
    loadSellers, getSellers, getSellerByCode, addSeller, deleteSeller
  };
})();
DB.loadProductions();
DB.loadPerformances();

// ─── AUTH SERVICE (Supabase Auth: sesión real + rol leído de `profiles`) ──
const AuthService = (function(){
  const session = {usuario:null, rol:null, nombre:null, userId:null};
  let pendingVerifyEmail = null;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function passwordOk(p){ return typeof p==='string' && p.length>=8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p); }
  function siteUrl(){ return window.location.origin + window.location.pathname; }

  function showLoginTab(tab){
    var tabs=['correo','registro','verificar'];
    tabs.forEach(function(t){
      var p=document.getElementById('lpanel-'+t);if(p)p.style.display=t===tab?'block':'none';
      var b=document.getElementById('ltab-'+t);if(b){b.style.background=t===tab?'var(--rojo)':'var(--g2)';b.style.color=t===tab?'#fff':'var(--t2)';}
    });
  }

  function showVerifyPanel(email){
    pendingVerifyEmail = email;
    var emailEl = document.getElementById('verifyEmailLabel');
    if(emailEl) emailEl.textContent = email;
    showLoginTab('verificar');
  }

  // El rol vive en `profiles.rol` (server-side, no editable por el propio
  // usuario vía RLS — ver 0005/0010). Nunca se confía un rol que no venga
  // de esta consulta: editar localStorage ya no puede otorgar acceso staff.
  async function fetchProfile(userId){
    if(!sb) return null;
    const { data, error } = await sb.from('profiles').select('rol,nombre').eq('id', userId).single();
    if(error) return null;
    return data;
  }

  async function applySession(user){
    if(!user){ clearSession(); return; }
    const profile = await fetchProfile(user.id);
    session.usuario = user.email;
    session.userId = user.id;
    session.rol = profile ? profile.rol : 'fan';
    session.nombre = (profile && profile.nombre) || (user.user_metadata && user.user_metadata.nombre) || '';
    updateNavAuth();
  }

  function clearSession(){
    session.usuario=null; session.rol=null; session.nombre=null; session.userId=null;
    updateNavAuth();
  }

  async function doRegister(){
    var name=(document.getElementById('rn').value||'').trim();
    var email=(document.getElementById('re').value||'').trim().toLowerCase();
    var pass=(document.getElementById('rp').value||'').trim();
    if(!name||!email||!pass){flash('Completa todos los campos.','d');return;}
    if(!EMAIL_RE.test(email)){flash('Ese correo no parece válido.','d');return;}
    if(!passwordOk(pass)){flash('La contraseña debe tener al menos 8 caracteres, con letras y números.','d');return;}
    if(!sb){flash('No hay conexión con el servidor. Intenta más tarde.','d');return;}
    const { data, error } = await sb.auth.signUp({
      email: email, password: pass,
      options:{ data:{ nombre:name }, emailRedirectTo: siteUrl() }
    });
    if(error){ flash(error.message,'d'); return; }
    // Supabase no devuelve error si el correo ya existe (anti-enumeración):
    // regresa un usuario sin identities.
    if(data.user && data.user.identities && data.user.identities.length===0){
      flash('Ese correo ya tiene cuenta. Inicia sesión.','d');
      showLoginTab('correo');
      return;
    }
    // Con "Confirm email" desactivado en Supabase llega sesión directa.
    if(data.session){
      await applySession(data.user);
      flash('¡Cuenta creada! Bienvenido, '+(session.nombre||session.usuario)+' 🎭','s');
      nav('fan');
      return;
    }
    flash('¡Cuenta creada! Revisa tu correo para confirmar tu cuenta.','s');
    showVerifyPanel(email);
  }

  function doResendVerification(){
    if(!pendingVerifyEmail){flash('No hay una verificación en curso.','d');return;}
    if(!sb){flash('No hay conexión con el servidor. Intenta más tarde.','d');return;}
    sb.auth.resend({ type:'signup', email: pendingVerifyEmail, options:{ emailRedirectTo: siteUrl() } }).then(function(res){
      if(res.error){ flash(res.error.message,'d'); return; }
      flash('Correo de confirmación reenviado.','i');
    });
  }

  async function doLogin(){
    const u=(document.getElementById('lu').value||'').trim().toLowerCase();
    const p=(document.getElementById('lp').value||'').trim();
    if(!u||!p){flash('Escribe tu correo y contraseña.','d');return;}
    if(!sb){flash('No hay conexión con el servidor. Intenta más tarde.','d');return;}
    const { data, error } = await sb.auth.signInWithPassword({ email:u, password:p });
    if(error){
      if(/confirm/i.test(error.message)){
        flash('Confirma tu correo antes de iniciar sesión — revisa tu bandeja.','d');
        showVerifyPanel(u);
      } else {
        flash('Correo o contraseña incorrectos.','d');
      }
      return;
    }
    await applySession(data.user);
    flash('¡Bienvenido, '+(session.nombre||session.usuario)+'! 🎭','s');
    nav(session.rol==='fan'?'fan':'staff');
  }

  async function doLogout(){
    if(sb) await sb.auth.signOut();
    clearSession();
    flash('Sesión cerrada. ¡Hasta pronto!','i');
    nav('home');
  }

  async function loginGoogle(){
    if(!sb){flash('No hay conexión con el servidor. Intenta más tarde.','d');return;}
    const { error } = await sb.auth.signInWithOAuth({
      provider:'google',
      options:{ redirectTo: window.location.origin + window.location.pathname }
    });
    if(error){ flash(error.message,'d'); }
  }

  function updateNavAuth(){
    var el=document.getElementById('navAuth');
    clearEl(el);
    if(session.usuario){
      if(session.rol==='staff'||session.rol==='admin'){
        var staffBtn=document.createElement('button');
        staffBtn.className='btn btn-o btn-sm';
        staffBtn.textContent='⚙️ Panel Staff';
        staffBtn.onclick=function(){nav('staff');};
        el.appendChild(staffBtn);
        var fanBtn=document.createElement('button');
        fanBtn.className='btn btn-o btn-sm';
        fanBtn.textContent='🎭 Zona Fans';
        fanBtn.onclick=function(){nav('fan');};
        el.appendChild(fanBtn);
        var staffCuentaBtn=document.createElement('button');
        staffCuentaBtn.className='btn btn-o btn-sm';
        staffCuentaBtn.textContent='👤 Mi Cuenta';
        staffCuentaBtn.onclick=function(){nav('cuenta');};
        el.appendChild(staffCuentaBtn);
        var logoutBtn1=document.createElement('button');
        logoutBtn1.className='btn btn-o btn-sm';
        logoutBtn1.textContent='🚪 Cerrar Sesión';
        logoutBtn1.onclick=function(){doLogout();};
        el.appendChild(logoutBtn1);
      } else {
        var zoneBtn=document.createElement('button');
        zoneBtn.className='btn btn-o btn-sm';
        zoneBtn.textContent='🎭 Zona Fans';
        zoneBtn.onclick=function(){nav('fan');};
        el.appendChild(zoneBtn);
        var cuentaBtn=document.createElement('button');
        cuentaBtn.className='btn btn-o btn-sm';
        cuentaBtn.textContent='👤 Mi Cuenta';
        cuentaBtn.onclick=function(){nav('cuenta');};
        el.appendChild(cuentaBtn);
        var logoutBtn2=document.createElement('button');
        logoutBtn2.className='btn btn-o btn-sm';
        logoutBtn2.textContent='🚪 Cerrar Sesión';
        logoutBtn2.onclick=function(){doLogout();};
        el.appendChild(logoutBtn2);
      }
    } else {
      var loginBtn=document.createElement('button');
      loginBtn.className='btn btn-r btn-sm';
      loginBtn.textContent='Iniciar Sesión';
      loginBtn.onclick=function(){nav('login');};
      el.appendChild(loginBtn);
    }
  }

  async function updatePass(){
    var np=(document.getElementById('pf-pass').value||'').trim();
    if(!passwordOk(np)){flash('La contraseña debe tener al menos 8 caracteres, con letras y números.','d');return;}
    if(!sb){flash('No hay conexión con el servidor. Intenta más tarde.','d');return;}
    const { error } = await sb.auth.updateUser({ password: np });
    if(error){ flash(error.message,'d'); return; }
    document.getElementById('pf-pass').value='';
    flash('Contraseña actualizada.','s');
  }

  async function restoreSession(){
    if(!sb) return;
    const { data } = await sb.auth.getSession();
    if(data && data.session && data.session.user){ await applySession(data.session.user); }
    sb.auth.onAuthStateChange(function(event, sessionObj){
      if(event==='SIGNED_OUT'){ clearSession(); }
      else if(sessionObj && sessionObj.user){ applySession(sessionObj.user); }
    });
  }

  return {session, showLoginTab, doLogin, doLogout, doRegister, doResendVerification,
    loginGoogle, updateNavAuth, updatePass, restoreSession};
})();

// ─── CARRUSELES ───────────────────────────────────────
const carState={};
function carInit(id){
  const track=document.getElementById(id);
  if(!track)return;
  const n=track.children.length;
  carState[id]={idx:0,n};
  const suffix=id==='carMM'?'MM':'HSM';
  const dotsEl=document.getElementById('dots'+suffix);
  if(dotsEl){clearEl(dotsEl);for(let i=0;i<n;i++){const d=document.createElement('div');d.className='dot'+(i===0?' on':'');d.onclick=()=>carGo(id,i);dotsEl.appendChild(d);}}
}
function carGo(id,idx){
  const track=document.getElementById(id);const s=carState[id];if(!track||!s)return;
  s.idx=Math.max(0,Math.min(idx,s.n-1));
  track.style.transform=`translateX(-${s.idx*100}%)`;
  const suffix=id==='carMM'?'MM':'HSM';
  const dotsEl=document.getElementById('dots'+suffix);
  if(dotsEl)dotsEl.querySelectorAll('.dot').forEach((d,i)=>d.classList.toggle('on',i===s.idx));
}
function carMove(id,dir){const s=carState[id];if(!s)return;carGo(id,(s.idx+dir+s.n)%s.n);}
carInit('carMM');carInit('carHSM');

// ─── NAVEGACIÓN SPA ───────────────────────────────────
const VIEWS_MAP={home:'v-home',cartelera:'v-cartelera',prods:'v-prods',mm:'v-mm',hsm:'v-hsm',showman:'v-showman',login:'v-login',fan:'v-fan',staff:'v-staff',contacto:'v-contacto',casting:'v-casting',cuenta:'v-cuenta',checkout:'v-checkout'};
const NAV_KEY_MAP={home:'navHome',cartelera:'navCartelera',prods:'navProdBtn',mm:'navProdBtn',hsm:'navProdBtn',showman:'navProdBtn',contacto:'navContacto'};
function nav(key, skipPush){
  if((key==='fan'||key==='staff'||key==='cuenta')&&!AuthService.session.usuario){nav('login');return;}
  if(key==='staff'&&AuthService.session.rol!=='staff'&&AuthService.session.rol!=='admin'){nav('fan');return;}
  Object.values(VIEWS_MAP).forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('active');});
  const target=document.getElementById(VIEWS_MAP[key]);
  if(target){target.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});}
  if(key==='fan'){setTimeout(()=>fanNav('home'),0);}
  if(key==='staff'){setTimeout(renderStaff,0);}
  if(key==='showman'){setTimeout(renderShowmanBanner,0);}
  if(key==='checkout'){setTimeout(function(){ ckState.loadedPerf=null; renderCheckout(); },0);} // recarga siempre: los asientos tomados cambian
  if(key==='cuenta'){setTimeout(()=>cuentaTab('boletos'),0);}
  document.querySelectorAll('.nav-a').forEach(el=>el.classList.remove('active'));
  const activeBtn=document.getElementById(NAV_KEY_MAP[key]);
  if(activeBtn)activeBtn.classList.add('active');
  if(!skipPush) window.history.pushState(null,'','?v='+key);
  document.getElementById('navLinks').classList.remove('open');
}

// ─── REPRODUCTOR IN-APP ───────────────────────────────
function playVid(el){
  var vid=el.dataset.vid;
  if(!vid)return;
  var thumb=el.querySelector('.vid-thumb');
  if(!thumb)return;
  var iframe=document.createElement('iframe');
  iframe.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(vid)+'?autoplay=1&rel=0&fs=1';
  iframe.setAttribute('allow','autoplay;encrypted-media;fullscreen');
  iframe.setAttribute('allowfullscreen','');
  iframe.style.cssText='width:100%;height:100%;border:none;display:block';
  var t=setTimeout(function(){
    if(thumb.contains(iframe)){
      clearEl(thumb);
      var fb=document.createElement('div');
      fb.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;background:#111';
      var msg=document.createElement('div');msg.style.cssText='font-size:13px;color:#aaa;text-align:center;padding:0 16px';msg.textContent='No se puede reproducir aquí.';
      var lnk=document.createElement('a');lnk.href='https://youtu.be/'+vid;lnk.target='_blank';lnk.rel='noopener';
      lnk.style.cssText='background:var(--rojo);color:#fff;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:.06em';
      lnk.textContent='▶ Ver en YouTube →';
      fb.appendChild(msg);fb.appendChild(lnk);thumb.appendChild(fb);
    }
  },4000);
  iframe.onload=function(){clearTimeout(t);};
  thumb.style.background='#000';
  thumb.style.backgroundImage='none';
  clearEl(thumb);
  thumb.appendChild(iframe);
  el.style.cursor='default';
  el.onclick=null;
}

// Navbar scroll shadow
window.addEventListener('scroll',()=>{document.querySelector('.navbar').classList.toggle('scrolled',window.scrollY>10);},{passive:true});

// ─── FAN ZONE ─────────────────────────────────────────
function fanNav(sub){
  const panels=['fan-home','fan-mm','fan-hsm'];
  panels.forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  const target=document.getElementById('fan-'+sub);
  if(target){target.style.display='block';window.scrollTo({top:0,behavior:'smooth'});}
}

// ─── CUENTA TABS ──────────────────────────────────────
function cuentaTab(tab){
  var tabs=['boletos','transacciones','eventos','perfil'];
  tabs.forEach(function(t){
    var p=document.getElementById('cp-'+t);if(p)p.style.display=t===tab?'block':'none';
    var b=document.getElementById('ctab-'+t);if(b){b.style.background=t===tab?'var(--rojo)':'var(--g2)';b.style.color=t===tab?'#fff':'var(--t2)';}
  });
  if(tab==='perfil'){
    var n=document.getElementById('pf-nombre');var c=document.getElementById('pf-correo');var r=document.getElementById('pf-rol');
    var ROL_LABELS={fan:'Fan',staff:'Staff',admin:'Admin'};
    if(n)n.value=AuthService.session.nombre||'';if(c)c.value=AuthService.session.usuario||'';if(r)r.value=ROL_LABELS[AuthService.session.rol]||'Fan';
  }
  if(tab==='boletos'){ loadMyOrders(); }
}

document.getElementById('lp').addEventListener('keydown',e=>{if(e.key==='Enter')AuthService.doLogin();});

// ─── TABS ─────────────────────────────────────────────
function switchTab(key,btn){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on');
  const panel=document.getElementById('tp-'+key);
  if(panel)panel.classList.add('on');
}

// ─── FLASH ────────────────────────────────────────────
function flash(msg,type){
  const box=document.getElementById('flashBox');
  const el=document.createElement('div');
  el.className='flash flash-'+type;
  const icons={'s':'✅','d':'❌','i':'ℹ️'};
  el.textContent=(icons[type]||'')+' '+msg;
  box.appendChild(el);
  setTimeout(()=>{el.style.transition='opacity .4s';el.style.opacity='0';setTimeout(()=>el.remove(),400);},3500);
}

// ─── HAMBURGUESA ──────────────────────────────────────
document.getElementById('hbg').addEventListener('click',function(){document.getElementById('navLinks').classList.toggle('open');});

// ─── CHATBOT DARFY (mock local) ───────────────────────
const DARFY_REPLIES=[
  '¡Hola! Soy DARFY 🎭 En DARF Productions hemos montado dos producciones épicas: Mamma Mia! (2026) al ritmo de ABBA, y High School Musical (2025) con Disney. ¿Sobre cuál quieres saber más? ✨',
  'Mamma Mia! es nuestra producción 2026 🌸 Sophie invita a tres posibles padres a su boda en una isla griega, todo al ritmo de los clásicos de ABBA: Dancing Queen, Voulez-Vous, Chiquitita... ¡Un espectáculo que no te puedes perder! 🎵',
  'High School Musical 2025 fue nuestro debut 🎬 Troy y Gabriella rompen las reglas de East High para seguir su pasión por el teatro. Con un elenco increíble y la magia Disney, fue una noche para recordar. ¡El show debe continuar! ⭐',
  '¿Tienes dudas sobre las producciones, el elenco o cómo contactarnos? Escríbenos a hola@darfproductions.com o síguenos en @darfproductions. ¡Siempre hay algo nuevo en el escenario de DARF! 🎪'
];
let darfyIdx=0;
function toggleChat(){document.getElementById('chatWin').classList.toggle('open');}
function addMsg(role,text){
  var msgs=document.getElementById('chatMsgs');
  var div=document.createElement('div');div.className='msg '+role;
  var bbl=document.createElement('div');bbl.className='msg-bbl';bbl.textContent=text;
  div.appendChild(bbl);msgs.appendChild(div);msgs.scrollTop=msgs.scrollHeight;
}
function addTyping(){
  var msgs=document.getElementById('chatMsgs');
  var div=document.createElement('div');div.className='msg b';div.id='typing';
  var bbl=document.createElement('div');bbl.className='typing-bbl';
  for(var i=0;i<3;i++){var dot=document.createElement('div');dot.className='typing-dot';bbl.appendChild(dot);}
  div.appendChild(bbl);msgs.appendChild(div);msgs.scrollTop=msgs.scrollHeight;
}
function sendChat(){
  const inp=document.getElementById('chatInput');
  const txt=(inp.value||'').trim();if(!txt)return;
  addMsg('u',txt);inp.value='';
  addTyping();
  setTimeout(()=>{
    var typing=document.getElementById('typing');if(typing)typing.remove();
    const reply=DARFY_REPLIES[darfyIdx%DARFY_REPLIES.length];
    darfyIdx++;
    addMsg('b',reply);
  },800);
}
document.getElementById('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});

// ─── BOLETAJE: helpers de UI ──────────────────────────
const SHOWMAN_ID='showman';
const SEAT_ROWS=['A','B','C','D','E','F'];
const SEAT_COLS=8;
function allSeatIds(){
  var out=[];
  SEAT_ROWS.forEach(function(r){ for(var i=1;i<=SEAT_COLS;i++) out.push(r+i); });
  return out;
}
function qrDataUrl(text, cb){
  if(!window.QRCode){ cb(null); return; }
  QRCode.toDataURL(text, {width:160,margin:1}, function(err,url){ cb(err?null:url); });
}
function money(n){ return '$'+Number(n).toFixed(2)+' MXN'; }

// ─── CHECKOUT PÚBLICO (Supabase; se activa con "En venta" de la función) ──
var ckState={perf:null,loadedPerf:null,seats:[],taken:{},prices:{},selected:{},loading:false,error:null};
var CK_STATES=[['disp','Disponible','#1565C0'],['sel','Seleccionado','#EC4899'],['bloq','No disponible','#7a7a7a']];
function onSalePerfs(){
  return DB.getPerformancesForProduction(SHOWMAN_ID).filter(function(p){return p.on_sale && p.starts_at;})
    .sort(function(a,b){return a.starts_at<b.starts_at?-1:a.starts_at>b.starts_at?1:0;});
}
function currentOnSaleProduction(){
  var prod = DB.getProductions()[SHOWMAN_ID];
  return prod && !prod.concluded && onSalePerfs().length ? prod : null;
}
function renderShowmanBanner(){
  var banner = document.getElementById('showmanSaleBanner');
  if(!banner)return;
  clearEl(banner);
  if(currentOnSaleProduction()){
    var span=document.createElement('span');
    span.style.cssText='color:var(--showman-gold);font-size:13px;font-weight:700;letter-spacing:.03em';
    span.textContent='🎟️ ¡Boletos ya disponibles!';
    var btn=document.createElement('button');
    btn.className='btn btn-sm';
    btn.style.cssText='background:var(--showman-gold);color:#05070d;border:none';
    btn.textContent='Comprar Boletos →';
    btn.onclick=function(){ nav('checkout'); };
    banner.appendChild(span);banner.appendChild(btn);
  } else {
    var span2=document.createElement('span');
    span2.id='showmanSaleBannerText';
    span2.style.cssText='color:var(--showman-gold);font-size:13px;font-weight:700;letter-spacing:.03em';
    span2.textContent='🎟️ Boletos a la venta muy pronto.';
    banner.appendChild(span2);
  }
}
DB.subscribe(DB.KEYS.productions, function(){ if(document.getElementById('v-showman').classList.contains('active')) renderShowmanBanner(); });
DB.subscribe(DB.KEYS.performances, function(){
  if(document.getElementById('v-showman').classList.contains('active')) renderShowmanBanner();
  if(document.getElementById('v-checkout').classList.contains('active')) renderCheckout();
});

async function ckLoad(){
  var perfId=ckState.perf;
  ckState.loadedPerf=perfId;ckState.loading=true;ckState.error=null;
  renderCkMap();
  if(!sb||!perfId){ckState.loading=false;ckState.error='Sin conexión con el servidor.';renderCkMap();return;}
  var r=await Promise.all([
    sb.from('seats').select('id,seat_label,seat_row,seat_number,section,lado,price_category_id,is_active').eq('production_id',SHOWMAN_ID).limit(2000),
    sb.rpc('get_taken_seats',{target_performance_id:perfId}),
    sb.from('performance_price_categories').select('price_category_id,price,price_categories(nombre)').eq('performance_id',perfId)
  ]);
  if(ckState.perf!==perfId) return; // el comprador cambió de función mientras cargaba
  ckState.loading=false;
  var err=r[0].error||r[1].error||r[2].error;
  if(err){ckState.error='No se pudo cargar el mapa: '+err.message;ckState.seats=[];renderCkMap();return;}
  ckState.seats=(r[0].data||[]).filter(function(x){return x.is_active;});
  ckState.taken={};(r[1].data||[]).forEach(function(id){ckState.taken[id]=true;});
  ckState.prices={};(r[2].data||[]).forEach(function(x){ckState.prices[x.price_category_id]={price:Number(x.price),nombre:x.price_categories?x.price_categories.nombre:''};});
  // Quitar de la selección lo que otro comprador ya tomó.
  Object.keys(ckState.selected).forEach(function(id){ if(ckState.taken[id]) delete ckState.selected[id]; });
  renderCkMap();
}
function ckCat(seat){ var p=ckState.prices[seat.price_category_id]; return p?p.nombre:''; }
function ckSelectedSeats(){ return ckState.seats.filter(function(x){return ckState.selected[x.id];}); }
function ckToggle(seat){
  if(ckState.taken[seat.id]) return;
  if(ckState.selected[seat.id]) delete ckState.selected[seat.id];
  else {
    if(ckSelectedSeats().length>=20){flash('Máximo 20 asientos por solicitud.','d');return;}
    ckState.selected[seat.id]=true;
  }
  renderCkMap();
}
function renderCkMap(){
  var root=document.getElementById('ckMapRoot');
  if(!root) return;
  clearEl(root);
  if(ckState.loading){var l=document.createElement('div');l.className='empty-note';l.textContent='Cargando asientos…';root.appendChild(l);updateCart();return;}
  if(ckState.error){var e=document.createElement('div');e.className='empty-note';e.textContent=ckState.error;root.appendChild(e);updateCart();return;}
  if(!ckState.seats.length){var n=document.createElement('div');n.className='empty-note';n.textContent='No hay asientos disponibles para esta función.';root.appendChild(n);updateCart();return;}
  root.appendChild(smapBuildMap(ckState.seats,{
    catName:ckCat,
    stateOf:function(seat){return ckState.selected[seat.id]?'sel':(ckState.taken[seat.id]?'bloq':'disp');},
    titleOf:function(seat){
      var p=ckState.prices[seat.price_category_id];
      return seat.seat_label+(p?' — '+p.nombre+' · $'+p.price:'')+(ckState.taken[seat.id]?' — No disponible':'');
    },
    onClick:ckToggle
  }));
  smapLegendEls(CK_STATES).forEach(function(el){root.appendChild(el);});
  updateCart();
}
function renderCheckout(){
  var prod = currentOnSaleProduction();
  var wrap = document.querySelector('#v-checkout .checkout-layout');
  var notice = document.getElementById('checkoutNotOnSale');
  if(!prod){
    if(wrap) wrap.style.display='none';
    if(notice) notice.style.display='block';
    ckState.perf=null;ckState.loadedPerf=null;
    return;
  }
  if(wrap) wrap.style.display='';
  if(notice) notice.style.display='none';

  var perfs=onSalePerfs();
  if(!perfs.some(function(x){return x.id===ckState.perf;})){ckState.perf=perfs[0].id;ckState.selected={};}
  var sel=document.getElementById('ckPerfSel');
  if(sel){
    clearEl(sel);
    perfs.forEach(function(pf){var o=document.createElement('option');o.value=pf.id;o.textContent=fmtPerfDate(pf.starts_at);if(pf.id===ckState.perf)o.selected=true;sel.appendChild(o);});
    sel.onchange=function(){ckState.perf=sel.value;ckState.selected={};renderCheckout();};
  }
  var cur=perfs.filter(function(x){return x.id===ckState.perf;})[0];
  document.getElementById('cartShowName').textContent = prod.nombre;
  document.getElementById('cartShowDate').textContent = fmtPerfDate(cur.starts_at)+(cur.venue||prod.venue?' · '+(cur.venue||prod.venue):'');
  if(ckState.loadedPerf!==ckState.perf) ckLoad(); else renderCkMap();
}

function updateCart(){
  var seats=ckSelectedSeats();
  var total=0;
  var items=document.getElementById('cartItems');
  if(items){
    clearEl(items);
    if(seats.length>0){
      seats.forEach(function(seat){
        var p=ckState.prices[seat.price_category_id];
        total+=p?p.price:0;
        var row=document.createElement('div');row.className='cart-item';
        var label=document.createElement('span');label.textContent=seat.seat_label;label.style.cssText='font-size:13px;color:var(--t2)';
        var val=document.createElement('span');val.textContent=p?'$'+p.price:'—';val.style.cssText='font-size:13px;font-weight:700;color:#fff';
        row.appendChild(label);row.appendChild(val);items.appendChild(row);
      });
    } else {
      var empty=document.createElement('span');empty.style.cssText='font-size:13px;color:var(--t3)';empty.textContent='Ningún asiento seleccionado';
      items.appendChild(empty);
    }
  }
  var totalEl=document.getElementById('cartTotalPrice');
  if(totalEl)totalEl.textContent='$'+total.toFixed(2)+' MXN';
  var hint=document.getElementById('cartPricePerSeat');
  if(hint)hint.textContent=seats.length?seats.length+(seats.length===1?' boleto':' boletos'):'Elige tus asientos en el mapa';
}
function waPayUrl(orderCode, seatLabels, total, phone, prodName){
  var msg = 'Hola, quiero pagar mi solicitud de boletos para '+prodName+
    ' — Código de orden: '+orderCode+
    ' — Asientos: '+seatLabels.join(', ')+' — Total: '+money(total)+
    (phone?' — Teléfono: '+phone:'')+
    '. Mi solicitud ya quedó guardada en mi cuenta DARF, en espera de aprobación.';
  return 'https://wa.me/4465220560?text='+encodeURIComponent(msg);
}
var ckBusy=false;
async function proceedToPayment(){
  if(ckBusy) return;
  var prod = currentOnSaleProduction();
  if(!prod){flash('Los boletos aún no están a la venta.','d');return;}
  if(!AuthService.session.usuario){flash('Inicia sesión para comprar tus boletos.','i');nav('login');return;}
  var seats=ckSelectedSeats();
  if(!seats.length){flash('Selecciona al menos un asiento.','d');return;}
  var phoneEl=document.getElementById('buyerPhone');
  var phone=(phoneEl&&phoneEl.value||'').trim();
  if(!phone){flash('Escribe tu número de teléfono.','d');return;}
  var sellerEl=document.getElementById('buyerSellerCode');
  var sellerCode=(sellerEl&&sellerEl.value||'').trim();
  // Se abre la pestaña de WhatsApp dentro del clic (evita el bloqueador de ventanas) y se llena al terminar.
  var wa=window.open('about:blank','_blank');
  ckBusy=true;
  var r=await sb.rpc('create_seated_ticket_order',{
    target_performance_id:ckState.perf,
    target_buyer_nombre:AuthService.session.nombre||AuthService.session.usuario,
    target_buyer_telefono:phone,
    target_seat_ids:seats.map(function(x){return x.id;}),
    target_seller_codigo:sellerCode||null
  });
  ckBusy=false;
  if(r.error){
    if(wa) wa.close();
    flash(r.error.message,'d');
    await ckLoad();
    return;
  }
  var d=r.data;
  var url=waPayUrl(d.order_code,d.seats||[],d.total,phone,prod.nombre);
  if(wa) wa.location.href=url;
  flash('Solicitud guardada. '+(wa?'Te redirigimos a WhatsApp para el pago…':'Págala por WhatsApp desde Mis Boletos.'),'s');
  if(phoneEl) phoneEl.value='';
  if(sellerEl) sellerEl.value='';
  ckState.selected={};
  nav('cuenta');
}

// ─── MIS BOLETOS (cuenta del fan, Supabase) ───────────
const misBoletosOpen={};
var myOrders={list:[],loading:false,error:null};
function toggleMisBoletos(orderId){
  misBoletosOpen[orderId]=!misBoletosOpen[orderId];
  renderMisBoletos();
}
async function loadMyOrders(){
  if(!sb||!AuthService.session.userId){myOrders.list=[];myOrders.loading=false;renderMisBoletos();return;}
  myOrders.loading=true;myOrders.error=null;renderMisBoletos();
  var r=await sb.from('orders')
    .select('id,order_code,status,total,buyer_telefono,created_at,performances(starts_at,production_id),tickets(id,is_active,qr_token,checked_in_at,seats(seat_label))')
    .eq('buyer_user_id',AuthService.session.userId).order('created_at',{ascending:false});
  myOrders.loading=false;
  if(r.error){myOrders.error='No se pudieron cargar tus boletos: '+r.error.message;myOrders.list=[];}
  else myOrders.list=r.data||[];
  renderMisBoletos();
}
function misQrItem(o,t){
  var seat=(t.seats&&t.seats.seat_label)||'—';
  var one=document.createElement('div');one.style.cssText='display:flex;flex-direction:column;align-items:center;gap:4px';
  var img=document.createElement('img');img.className='qr-img';img.alt='QR '+seat;
  qrDataUrl(t.qr_token, function(url){ if(url) img.src=url; });
  var codeLbl=document.createElement('div');codeLbl.className='ticket-code';codeLbl.textContent='Asiento '+seat+(t.checked_in_at?' · usado':'');
  var verBtn=document.createElement('button');verBtn.className='btn btn-o btn-sm';verBtn.textContent='Ver boleto →';verBtn.style.marginTop='2px';
  verBtn.onclick=function(){ showAccessModal(o.performances?o.performances.production_id:SHOWMAN_ID, {buyerNombre:AuthService.session.nombre}, seat, t.qr_token, o.performances?o.performances.starts_at:null); };
  one.appendChild(img);one.appendChild(codeLbl);one.appendChild(verBtn);
  return one;
}
function renderMisBoletos(){
  var box=document.getElementById('cp-boletos-list');
  if(!box) return;
  clearEl(box);
  if(myOrders.loading){var ld=document.createElement('div');ld.className='empty-note';ld.textContent='Cargando tus boletos…';box.appendChild(ld);return;}
  if(myOrders.error){var er=document.createElement('div');er.className='empty-note';er.textContent=myOrders.error;box.appendChild(er);return;}
  var orders=myOrders.list;
  if(!orders.length){
    var empty=document.createElement('div');
    empty.className='empty-note';
    empty.textContent='Todavía no tienes boletos. Cuando compres, aparecerán aquí.';
    box.appendChild(empty);
    return;
  }
  orders.forEach(function(o){
    var pid=o.performances?o.performances.production_id:SHOWMAN_ID;
    var prod = DB.getProduction(pid) || {nombre:pid};
    var active=(o.tickets||[]).filter(function(t){return t.is_active;});
    var labels=active.map(function(t){return (t.seats&&t.seats.seat_label)||'—';});
    var card=document.createElement('div');
    card.className='ticket-card';
    var main=document.createElement('div');main.className='ticket-main';
    var info=document.createElement('div');
    var show=document.createElement('div');show.className='ticket-show';show.textContent=prod.nombre;
    var d0=document.createElement('div');d0.className='ticket-detail';d0.textContent='Código de orden: '+(o.order_code||'—');
    var d1=document.createElement('div');d1.className='ticket-detail';d1.textContent=(o.performances?fmtPerfDate(o.performances.starts_at):'')+' · Asientos: '+(labels.join(', ')||'—');
    var d2=document.createElement('div');d2.className='ticket-detail';d2.textContent='Total: '+money(o.total);
    var cancelled=o.status==='aprobado'&&!active.length;
    var pill=document.createElement('span');pill.className='status-pill status-'+o.status;pill.textContent=cancelled?'cancelado':o.status;
    info.appendChild(show);info.appendChild(d0);info.appendChild(d1);info.appendChild(d2);
    var pillWrap=document.createElement('div');pillWrap.style.marginTop='6px';pillWrap.appendChild(pill);info.appendChild(pillWrap);
    main.appendChild(info);
    var qrBlock=document.createElement('div');qrBlock.className='ticket-qr-block';
    if(o.status==='aprobado' && active.length>1){
      var open=!!misBoletosOpen[o.id];
      var dd=document.createElement('div');dd.className='ticket-dropdown';
      var ddHdr=document.createElement('div');ddHdr.className='ticket-dropdown-hdr';
      var ddLabel=document.createElement('span');ddLabel.textContent=active.length+' boletos';
      var ddChev=document.createElement('span');ddChev.className='ticket-dropdown-chevron';ddChev.textContent='▾';
      ddHdr.appendChild(ddLabel);ddHdr.appendChild(ddChev);
      ddHdr.onclick=function(){ toggleMisBoletos(o.id); };
      var ddBody=document.createElement('div');ddBody.className='ticket-dropdown-body';ddBody.style.display=open?'flex':'none';
      if(open) active.forEach(function(t){ ddBody.appendChild(misQrItem(o,t)); });
      dd.appendChild(ddHdr);dd.appendChild(ddBody);
      qrBlock.appendChild(dd);
    } else if(o.status==='aprobado' && active.length===1){
      qrBlock.appendChild(misQrItem(o,active[0]));
    } else if(o.status==='pendiente'){
      var wait=document.createElement('div');wait.style.cssText='font-size:11px;color:var(--t2);text-align:center;max-width:140px';wait.textContent='En espera de pago y aprobación';
      var payBtn=document.createElement('button');payBtn.className='btn btn-o btn-sm';payBtn.style.marginTop='6px';payBtn.textContent='Pagar por WhatsApp';
      payBtn.onclick=function(){ window.open(waPayUrl(o.order_code,labels,o.total,o.buyer_telefono,prod.nombre),'_blank'); };
      qrBlock.appendChild(wait);qrBlock.appendChild(payBtn);
    } else {
      var rej=document.createElement('div');rej.style.cssText='font-size:11px;color:var(--rojo);text-align:center;max-width:100px';rej.textContent=cancelled?'Boleto cancelado':'Solicitud rechazada';
      qrBlock.appendChild(rej);
    }
    card.appendChild(main);card.appendChild(qrBlock);
    box.appendChild(card);
  });
}

// ─── CONTACTO → BUZÓN STAFF ───────────────────────────
const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function submitContactForm(){
  var nombre=(document.getElementById('cn').value||'').trim();
  var correo=(document.getElementById('ce').value||'').trim();
  var telefono=(document.getElementById('ctel').value||'').trim();
  var asunto=document.getElementById('cas').value||'';
  var mensaje=(document.getElementById('cm').value||'').trim();
  if(!nombre||!correo){flash('Escribe tu nombre y correo.','d');return;}
  if(!CONTACT_EMAIL_RE.test(correo)){flash('Ese correo no parece válido.','d');return;}
  var ok = await DB.createContactMessage({nombre:nombre, correo:correo, telefono:telefono, asunto:asunto, mensaje:mensaje});
  if(!ok){flash('No se pudo enviar el mensaje. Intenta más tarde.','d');return;}
  document.getElementById('cn').value='';
  document.getElementById('ce').value='';
  document.getElementById('ctel').value='';
  document.getElementById('cas').value='';
  document.getElementById('cm').value='';
  flash('¡Mensaje enviado! Te contactaremos pronto.','s');
}
function renderContactInbox(){
  var box=document.getElementById('contactInbox');
  if(!box) return;
  var msgs=DB.getContactMessages();
  clearEl(box);
  if(!msgs.length){
    var empty=document.createElement('div');empty.className='empty-note';empty.textContent='Sin mensajes de contacto.';
    box.appendChild(empty);
    return;
  }
  msgs.slice().reverse().forEach(function(m){
    var card=document.createElement('div');card.className='contact-inbox-card';
    var hdr=document.createElement('div');hdr.className='contact-inbox-hdr';
    var left=document.createElement('div');
    var name=document.createElement('div');name.className='contact-inbox-name';name.textContent=m.nombre+' — '+(m.asunto||'Sin asunto');
    var meta=document.createElement('div');meta.className='contact-inbox-meta';meta.textContent=m.correo+(m.telefono?(' · '+m.telefono):'')+' · '+new Date(m.created_at).toLocaleString();
    left.appendChild(name);left.appendChild(meta);
    var delBtn=document.createElement('button');delBtn.className='btn btn-o btn-sm';delBtn.textContent='Eliminar';
    delBtn.onclick=async function(){
      var ok = await DB.deleteContactMessage(m.id);
      if(!ok){ flash('No se pudo eliminar el mensaje.','d'); return; }
      flash('Mensaje eliminado.','i'); renderContactInbox();
    };
    hdr.appendChild(left);hdr.appendChild(delBtn);
    var msgTxt=document.createElement('div');msgTxt.className='contact-inbox-msg';msgTxt.textContent=m.mensaje||'—';
    card.appendChild(hdr);card.appendChild(msgTxt);
    box.appendChild(card);
  });
}
DB.subscribe(DB.KEYS.contact, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderContactInbox(); });

// ─── PANEL STAFF: ventas, boletaje, control de accesos ─
const PROD_LOGOS={showman:'SHOWMAN VISUALS/2.png', mm:'MAMMA MIA VISUALS/5.png', hsm:'HIGH SCHOOL MUSICAL VISUALS/3.png'};
const DARF_LOGO='DARF PRODUCTIONS LOGOS/2.png';
// Boleto digital: logo "1.png" de cada producción (el logo principal, no la foto de portada)
// sobre un fondo del color de identidad de esa producción.
const TICKET_LOGOS={showman:'SHOWMAN VISUALS/1.png', mm:'MAMMA MIA VISUALS/1.png', hsm:'HIGH SCHOOL MUSICAL VISUALS/1.png'};
const TICKET_BG={showman:'#0C1830', mm:'#1565C0', hsm:'#C62222'};
function renderSellersPanel(){
  var box=document.getElementById('sellersPanel');
  if(!box) return;
  clearEl(box);
  if(AuthService.session.rol!=='admin') return;
  var h=document.createElement('div');h.style.cssText='font-weight:800;color:#fff;margin-bottom:8px';h.textContent='Vendedores';box.appendChild(h);
  var list=DB.getSellers();
  if(!list.length){var n=document.createElement('div');n.className='empty-note';n.textContent='No hay vendedores registrados.';box.appendChild(n);}
  list.forEach(function(s){
    var row=document.createElement('div');row.style.cssText='display:flex;gap:10px;align-items:center;font-size:13px;color:var(--t2);margin-bottom:4px';
    row.textContent=s.nombre+' — '+s.codigo+' ';
    var del=document.createElement('button');del.className='btn btn-o btn-sm';del.textContent='Eliminar';
    del.onclick=async function(){ if(!confirm('¿Eliminar a '+s.nombre+'?')) return; var ok=await DB.deleteSeller(s.id); if(!ok) flash('No se pudo eliminar al vendedor.','d'); renderSellersPanel(); };
    row.appendChild(del);box.appendChild(row);
  });
  var form=document.createElement('div');form.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
  var nom=document.createElement('input');nom.className='form-c';nom.placeholder='Nombre';
  var cod=document.createElement('input');cod.className='form-c';cod.placeholder='Código';
  var add=document.createElement('button');add.className='btn btn-a btn-sm';add.textContent='Agregar';
  add.onclick=async function(){ var r=await DB.addSeller(nom.value,cod.value); if(!r.ok) flash(r.error,'d'); else flash('Vendedor agregado.','s'); renderSellersPanel(); };
  form.appendChild(nom);form.appendChild(cod);form.appendChild(add);box.appendChild(form);
}

async function renderStaff(){
  renderSalesBars();
  renderBoletajeProductions();
  renderSellersPanel();
  renderContactInbox();
  renderAdminProductions();
  await Promise.all([DB.loadSellers(), DB.loadContactMessages(), DB.loadPerformances()]);
  dbState.key=null; renderDataPanels();
  loadPendingOrders(); loadShowmanSold();
  renderBoletajeProductions();
  renderSellersPanel();
  renderContactInbox();
  renderAdminProductions();
}

// ─── PANEL ADMIN: gestión de producciones y funciones ─
function toDatetimeLocalValue(iso){
  if(!iso) return '';
  var d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  var pad=function(n){return String(n).padStart(2,'0');};
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}
function renderAdminProductions(){
  var sec = document.getElementById('admProdSec');
  if(!sec) return;
  var isAdmin = AuthService.session.rol==='admin';
  sec.style.display = isAdmin?'':'none';
  if(!isAdmin) return;
  var box = document.getElementById('adminProdList');
  if(!box) return;
  clearEl(box);
  var prods = DB.getProductions();
  var concluded = [];
  Object.keys(prods).forEach(function(id){
    if(prods[id].concluded) concluded.push(prods[id]);
    else box.appendChild(buildAdminProdCard(prods[id]));
  });
  if(concluded.length){
    var folder = document.createElement('details');
    folder.className = 'adm-folder';
    folder.open = admConcludedOpen;
    folder.ontoggle = function(){ admConcludedOpen = folder.open; };
    var sum = document.createElement('summary');
    sum.textContent = '📁 Producciones concluidas (' + concluded.length + ')';
    folder.appendChild(sum);
    concluded.forEach(function(prod){ folder.appendChild(buildAdminProdCard(prod)); });
    box.appendChild(folder);
  }
}
var admConcludedOpen = false;
DB.subscribe(DB.KEYS.productions, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderAdminProductions(); });
DB.subscribe(DB.KEYS.performances, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderAdminProductions(); });

function buildAdminProdCard(prod){
  var card=document.createElement('div');card.style.cssText='background:var(--g2);border:1px solid var(--g3);border-radius:var(--r8);padding:16px;margin-bottom:14px';

  // Datos de la producción: fijos, se definen por código (migración/seed), no se editan aquí.
  var row=document.createElement('div');row.style.cssText='display:flex;gap:6px 18px;flex-wrap:wrap;align-items:baseline';
  var nameEl=document.createElement('div');nameEl.style.cssText='font-size:15px;font-weight:800;color:#fff';nameEl.textContent=prod.nombre||prod.id;
  var metaEl=document.createElement('div');metaEl.style.cssText='font-size:12px;color:var(--t3)';
  metaEl.textContent=[prod.id, prod.fecha, prod.venue, prod.price?('$'+prod.price):null].filter(Boolean).join(' · ');
  row.appendChild(nameEl);row.appendChild(metaEl);
  card.appendChild(row);

  var concRow=document.createElement('div');concRow.style.cssText='margin-top:12px';
  var concLabel=document.createElement('label');concLabel.style.cssText='display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--t2)';
  var concChk=document.createElement('input');concChk.type='checkbox';concChk.checked=!!prod.concluded;
  concChk.onchange=async function(){
    var ok = await DB.setProductionConcluded(prod.id, concChk.checked);
    if(!ok){ concChk.checked=!concChk.checked; flash('No se pudo cambiar el estado. ¿Ya se aplicó la migración 0017?','d'); return; }
    flash(concChk.checked?'Producción marcada como concluida: '+prod.nombre:'Producción reactivada: '+prod.nombre,'i');
  };
  concLabel.appendChild(concChk);concLabel.appendChild(document.createTextNode('Producción concluida (se oculta de Cartelera y del panel de venta)'));
  concRow.appendChild(concLabel);card.appendChild(concRow);

  var perfWrap=document.createElement('div');perfWrap.style.cssText='margin-top:14px;padding-top:14px;border-top:1px solid #252525';
  var perfTitle=document.createElement('div');perfTitle.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;color:var(--t2)';perfTitle.textContent='Funciones';
  perfWrap.appendChild(perfTitle);
  var perfs = DB.getPerformancesForProduction(prod.id);
  perfs.forEach(function(perf){
    var prow=document.createElement('div');prow.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px';
    var dtI=document.createElement('input');dtI.type='datetime-local';dtI.className='form-c';dtI.value=toDatetimeLocalValue(perf.starts_at);dtI.style.cssText='flex:1;min-width:180px';
    var label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:6px;font-size:12px;color:var(--t2);cursor:pointer';
    var onSaleChk=document.createElement('input');onSaleChk.type='checkbox';onSaleChk.checked=!!perf.on_sale;
    label.appendChild(onSaleChk);label.appendChild(document.createTextNode('En venta'));
    var psaveBtn=document.createElement('button');psaveBtn.className='btn btn-o btn-sm';psaveBtn.textContent='Guardar';
    psaveBtn.onclick=async function(){
      var iso = dtI.value ? new Date(dtI.value).toISOString() : null;
      if(!iso && onSaleChk.checked){ flash('Una función sin fecha no puede ponerse en venta.','d'); return; }
      var ok = await DB.updatePerformance(perf.id, {startsAt: iso, venue: perf.venue, onSale: onSaleChk.checked});
      if(!ok){ flash('No se pudo actualizar la función.','d'); return; }
      flash('Función actualizada.','s');
    };
    var pdelBtn=document.createElement('button');pdelBtn.className='btn btn-o btn-sm';pdelBtn.textContent='🗑 Eliminar';
    pdelBtn.onclick=async function(){
      if(!confirm('¿Eliminar la función '+fmtPerfDate(perf.starts_at)+'? Solo se puede si no tiene boletos activos (cancela antes los que haya). También se borra su historial de boletos cancelados. No se puede deshacer.')) return;
      var res = await DB.deletePerformance(perf.id);
      if(!res.ok){ flash(res.error,'d'); return; }
      flash('Función eliminada.','s');
    };
    prow.appendChild(dtI);prow.appendChild(label);prow.appendChild(psaveBtn);prow.appendChild(pdelBtn);
    perfWrap.appendChild(prow);
  });
  if(!perfs.length){
    var empty=document.createElement('div');empty.className='empty-note';empty.textContent='Sin funciones todavía.';
    perfWrap.appendChild(empty);
  }

  var newRow=document.createElement('div');newRow.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px';
  var newDtI=document.createElement('input');newDtI.type='datetime-local';newDtI.className='form-c';newDtI.style.cssText='flex:1;min-width:180px';
  var newLabel=document.createElement('label');newLabel.style.cssText='display:flex;align-items:center;gap:6px;font-size:12px;color:var(--t2);cursor:pointer';
  var newOnSaleChk=document.createElement('input');newOnSaleChk.type='checkbox';
  newLabel.appendChild(newOnSaleChk);newLabel.appendChild(document.createTextNode('En venta'));
  var addBtn=document.createElement('button');addBtn.className='btn btn-a btn-sm';addBtn.textContent='➕ Nueva función';
  addBtn.onclick=async function(){
    var iso = newDtI.value ? new Date(newDtI.value).toISOString() : null;
    if(!iso && newOnSaleChk.checked){ flash('Una función sin fecha no puede ponerse en venta.','d'); return; }
    var res = await DB.createPerformance(prod.id, {startsAt: iso, venue: null, onSale: newOnSaleChk.checked});
    if(!res.ok){ flash(res.error,'d'); return; }
    newDtI.value='';newOnSaleChk.checked=false;
    flash('Función agregada.','s');
  };
  newRow.appendChild(newDtI);newRow.appendChild(newLabel);newRow.appendChild(addBtn);
  perfWrap.appendChild(newRow);
  card.appendChild(perfWrap);

  return card;
}
function renderSalesBars(){
  var wrap = document.getElementById('salesBarsWrap');
  if(!wrap) return;
  var prods = DB.getProductions();
  if(!prods.showman || !prods.mm || !prods.hsm) return;
  var showmanApproved = showmanSold;
  var SCALE = Math.max(prods.showman.capacity, prods.mm.attendeesHistoric, prods.hsm.attendeesHistoric, 600);
  var rows = [
    {label:'Showman — en vivo', n:showmanApproved, cls:null, color:'var(--showman-gold)', live:true},
    {label:'Mamma Mia! 2026', n:prods.mm.attendeesHistoric, cls:null, color:'var(--mm-blue)'},
    {label:'High School Musical 2025', n:prods.hsm.attendeesHistoric, cls:null, color:'var(--hsm-red)'}
  ];
  clearEl(wrap);
  rows.forEach(function(r){
    var pct = Math.min(100, Math.round((r.n/SCALE)*100));
    var row=document.createElement('div');row.className='sales-row';
    var meta=document.createElement('div');meta.className='sales-meta';
    var span1=document.createElement('span');span1.textContent=r.label+' — '+r.n+' asistentes';
    meta.appendChild(span1);
    var barWrap=document.createElement('div');barWrap.className='progress-bar-wrap';
    var fill=document.createElement('div');fill.className='progress-bar-fill'+(r.cls?' '+r.cls:'');
    fill.style.width=pct+'%'; if(r.color) fill.style.background=r.color;
    barWrap.appendChild(fill);
    row.appendChild(meta);row.appendChild(barWrap);
    wrap.appendChild(row);
  });
}
DB.subscribe(DB.KEYS.orders, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderSalesBars(); });

function staffSeatStateClass(state){
  if(state==='usado') return 'usado';
  if(state==='aprobado') return 'ap';
  if(state==='pendiente') return 'pend';
  if(state==='bloqueado') return 'bloq';
  return 'disp';
}
async function toggleShowmanOnSale(checked){
  const ok = await DB.setProductionOnSale(SHOWMAN_ID, checked);
  if(!ok){ flash('No se pudo actualizar el estado de venta.','d'); return; }
  flash(checked?'Venta de Showman activada.':'Venta de Showman desactivada.', 'i');
  // DB.setProductionOnSale ya disparó renderBoletajeProductions() vía la suscripción a productions.
}

// ─── SEAT MAP (Supabase) ───────────────────────────────
var smapState={perf:null,prod:null,seats:[],blocked:{},tickets:{},prices:{},loading:false,error:null,selected:{}};

async function smapLoad(prodId,perfId){
  if(!sb||!perfId){smapState.seats=[];smapState.error=null;renderSeatMap();return;}
  smapState.loading=true;smapState.error=null;
  smapState.prod=prodId;smapState.perf=perfId;
  smapState.selected={};
  renderSeatMap();
  var seatsRes=await sb.from('seats').select('id,seat_label,seat_row,seat_number,section,lado,price_category_id,is_active').eq('production_id',prodId).limit(2000);
  var blockedRes=await sb.from('blocked_seats').select('seat_id').eq('performance_id',perfId).limit(2000);
  var ticketsRes=await sb.from('tickets').select('id,seat_id,checked_in_at,orders(status,buyer_nombre,order_code)').eq('performance_id',perfId).eq('is_active',true).not('seat_id','is',null).limit(2000);
  var pricesRes=await sb.from('performance_price_categories').select('price_category_id,price,price_categories(nombre)').eq('performance_id',perfId);
  // Si el usuario cambió de función mientras cargaba, descartar este resultado.
  if(smapState.perf!==perfId) return;
  smapState.loading=false;
  var err=seatsRes.error||blockedRes.error||ticketsRes.error||pricesRes.error;
  if(err){smapState.error='No se pudo cargar el mapa: '+err.message;smapState.seats=[];renderSeatMap();return;}
  smapState.seats=seatsRes.data||[];
  smapState.blocked={};(blockedRes.data||[]).forEach(function(b){smapState.blocked[b.seat_id]=true;});
  smapState.tickets={};(ticketsRes.data||[]).forEach(function(t){
    smapState.tickets[t.seat_id]={ticket_id:t.id,status:t.orders?t.orders.status:null,checked_in_at:t.checked_in_at,buyer_nombre:t.orders?t.orders.buyer_nombre:'',order_code:t.orders?t.orders.order_code:''};
  });
  smapState.prices={};(pricesRes.data||[]).forEach(function(p){
    smapState.prices[p.price_category_id]={price:Number(p.price),nombre:p.price_categories?p.price_categories.nombre:''};
  });
  renderSeatMap();
}

function smapSeatState(seat){
  var t=smapState.tickets[seat.id];
  if(t){
    if(t.checked_in_at) return 'usado';
    if(t.status==='aprobado') return 'ap';
    return 'pend';
  }
  if(smapState.blocked[seat.id]) return 'bloq';
  return 'disp';
}

function smapCounts(){
  var c={total:0,vendidos:0,bloqueados:0,disponibles:0};
  smapState.seats.forEach(function(s){
    if(!s.is_active) return;
    c.total++;
    var st=smapSeatState(s);
    if(st==='disp') c.disponibles++;
    else if(st==='bloq') c.bloqueados++;
    else c.vendidos++;
  });
  return c;
}

function smapIsAdmin(){return AuthService.session.rol==='admin';}

async function smapBlock(seatIds){
  if(!smapIsAdmin()) return {ok:false,error:'Solo un admin puede bloquear asientos.'};
  var rows=seatIds.map(function(id){return {performance_id:smapState.perf,seat_id:id};});
  var r=await sb.from('blocked_seats').upsert(rows,{onConflict:'performance_id,seat_id',ignoreDuplicates:true});
  return r.error?{ok:false,error:r.error.message}:{ok:true};
}
async function smapRelease(seatIds){
  if(!smapIsAdmin()) return {ok:false,error:'Solo un admin puede liberar asientos.'};
  var r=await sb.from('blocked_seats').delete().eq('performance_id',smapState.perf).in('seat_id',seatIds);
  return r.error?{ok:false,error:r.error.message}:{ok:true};
}
async function smapSell(seatIds,nombre,tel,seller){
  var r=await sb.rpc('admin_create_seated_order',{target_performance_id:smapState.perf,target_buyer_nombre:nombre,target_buyer_telefono:tel,target_seat_ids:seatIds,target_seller_codigo:seller||null});
  return r.error?{ok:false,error:r.error.message}:{ok:true,data:r.data};
}
async function smapCancelTicket(ticketId){
  var r=await sb.rpc('admin_cancel_ticket',{target_ticket_id:ticketId});
  return r.error?{ok:false,error:r.error.message}:{ok:true,data:r.data};
}

var SMAP_ZONES={'Exclusivo':'z-exclusivo','VIP':'z-vip','Preferente':'z-preferente','General':'z-general','Discapacitados':'z-discapacitados'};
var SMAP_STATE_LABELS=[['disp','Disponible','#1565C0'],['sel','Seleccionado','#EC4899'],['pend','Pendiente','#D4A017'],['ap','Comprado','#E5445A'],['usado','Usado','#22c55e'],['bloq','Bloqueado','#7a7a7a']];
var SMAP_ZONE_LABELS=[['Exclusivo','#8B5CF6'],['VIP','#14B8A6'],['Preferente','#F97316'],['General','#84CC16'],['Discapacitados','#A0724A']];

function smapCategoryName(seat){
  var p=smapState.prices[seat.price_category_id];
  return p?p.nombre:'';
}
function smapTooltip(seat){
  var parts=[seat.seat_label];
  var p=smapState.prices[seat.price_category_id];
  if(p) parts.push(p.nombre+' · $'+p.price);
  var t=smapState.tickets[seat.id];
  if(t) parts.push((t.checked_in_at?'Usado':(t.status==='aprobado'?'Comprado':'Pendiente'))+(t.buyer_nombre?': '+t.buyer_nombre:''));
  else if(smapState.blocked[seat.id]) parts.push('Bloqueado');
  return parts.join(' — ');
}

function smapBlockEl(seats,ctx){
  var b=document.createElement('div');b.className='smap-block';
  seats.forEach(function(s){
    var d=document.createElement('div');
    d.className='smap-seat '+(SMAP_ZONES[ctx.catName(s)]||'')+' '+ctx.stateOf(s);
    d.textContent=s.seat_number;
    d.title=ctx.titleOf(s);
    if(ctx.onClick) d.onclick=function(){ctx.onClick(s);};
    b.appendChild(d);
  });
  return b;
}

// Mapa por filas (A cerca del escenario → X al fondo), compartido por staff y checkout público.
// ctx: {stateOf(seat)→clase, titleOf(seat), catName(seat), onClick(seat)|null}
function smapBuildMap(seats,ctx){
  var rows={};
  seats.forEach(function(s){(rows[s.seat_row]=rows[s.seat_row]||[]).push(s);});
  var order=Object.keys(rows).sort();
  var wrap=document.createElement('div');wrap.className='smap-wrap';
  var map=document.createElement('div');map.className='smap'+(ctx.onClick?' is-admin':'');
  var stage=document.createElement('div');stage.className='smap-stage';stage.textContent='Escenario';map.appendChild(stage);
  order.forEach(function(rname){
    var list=rows[rname].slice().sort(function(a,b){return a.seat_number-b.seat_number;});
    var row=document.createElement('div');row.className='smap-row';
    var lab=document.createElement('div');lab.className='smap-row-label';lab.textContent=rname;row.appendChild(lab);
    // Fila J mezcla Discapacitados (izq/der) y Preferente (central): se agrupa por `lado`, no por zona.
    ['izquierda','central','derecha'].forEach(function(lado,i){
      var part=list.filter(function(s){return s.lado===lado;});
      if(i>0){var a=document.createElement('div');a.className='smap-aisle';row.appendChild(a);}
      row.appendChild(smapBlockEl(part,ctx));
    });
    var lab2=document.createElement('div');lab2.className='smap-row-label';lab2.textContent=rname;row.appendChild(lab2);
    map.appendChild(row);
  });
  wrap.appendChild(map);
  return wrap;
}

// states: [[clase,etiqueta,color],…]; zonas: SMAP_ZONE_LABELS
function smapLegendEls(states){
  var l1=document.createElement('div');l1.className='smap-legends';
  states.forEach(function(x){var it=document.createElement('span');it.className='smap-legend-item';var sw=document.createElement('span');sw.className='smap-sw';sw.style.background=x[2];it.appendChild(sw);it.appendChild(document.createTextNode(x[1]));l1.appendChild(it);});
  var l2=document.createElement('div');l2.className='smap-legends';
  SMAP_ZONE_LABELS.forEach(function(x){var it=document.createElement('span');it.className='smap-legend-item';var sw=document.createElement('span');sw.className='smap-sw';sw.style.background=x[1];it.appendChild(sw);it.appendChild(document.createTextNode('Zona '+x[0]));l2.appendChild(it);});
  return [l1,l2];
}

function renderSeatMap(){
  var root=document.getElementById('smapRoot');
  if(!root) return;
  clearEl(root);
  if(smapState.loading){var l=document.createElement('div');l.className='empty-note';l.textContent='Cargando mapa…';root.appendChild(l);return;}
  if(smapState.error){var e=document.createElement('div');e.className='empty-note';e.textContent=smapState.error;root.appendChild(e);return;}
  if(!smapState.seats.length){var n=document.createElement('div');n.className='empty-note';n.textContent='Esta función no tiene asientos cargados.';root.appendChild(n);return;}

  // Contadores + Actualizar
  var c=smapCounts();
  var bar=document.createElement('div');bar.className='smap-counts';
  [['Total',c.total],['Vendidos',c.vendidos],['Bloqueados',c.bloqueados],['Disponibles',c.disponibles]].forEach(function(x){
    var s=document.createElement('span');s.textContent=x[0]+': ';var b=document.createElement('b');b.textContent=x[1];s.appendChild(b);bar.appendChild(s);
  });
  var rf=document.createElement('button');rf.className='btn btn-o btn-sm';rf.textContent='Actualizar';
  rf.onclick=function(){smapLoad(smapState.prod,smapState.perf);};
  bar.appendChild(rf);root.appendChild(bar);

  root.appendChild(smapBuildMap(smapState.seats,{
    catName:smapCategoryName,
    stateOf:function(seat){return smapState.selected[seat.id]?'sel':smapSeatState(seat);},
    titleOf:smapTooltip,
    onClick:smapIsAdmin()?function(seat){smapToggle(seat.id);}:null
  }));
  smapLegendEls(SMAP_STATE_LABELS).forEach(function(el){root.appendChild(el);});

  renderSeatPanel();
}

function smapToggle(seatId){
  if(!smapIsAdmin()) return;
  if(smapState.selected[seatId]) delete smapState.selected[seatId]; else smapState.selected[seatId]=true;
  renderSeatMap();
}

function smapSelectedSeats(){
  return smapState.seats.filter(function(s){return smapState.selected[s.id];});
}

async function smapAfterAction(res,okMsg){
  if(res.ok) flash(okMsg,'s'); else flash(res.error,'d');
  await smapLoad(smapState.prod,smapState.perf);
}

async function smapDoBlock(){
  var sel=smapSelectedSeats();
  if(sel.some(function(s){return smapState.tickets[s.id];})){flash('Algunos asientos están vendidos: cancela primero el boleto.','d');return;}
  var res=await smapBlock(sel.map(function(s){return s.id;}));
  await smapAfterAction(res,'Asientos bloqueados.');
}

async function smapDoRelease(){
  var sel=smapSelectedSeats();
  var sold=sel.filter(function(s){return smapState.tickets[s.id];});
  var blockedOnly=sel.filter(function(s){return !smapState.tickets[s.id] && smapState.blocked[s.id];});
  if(sold.length){
    var names=sold.map(function(s){return s.seat_label+' ('+(smapState.tickets[s.id].buyer_nombre||'sin nombre')+')';}).join(', ');
    if(!confirm('Estos asientos están vendidos: '+names+'.\n¿Cancelar los boletos y liberar los asientos?')) return;
    for(var i=0;i<sold.length;i++){
      var r=await smapCancelTicket(smapState.tickets[sold[i].id].ticket_id);
      if(!r.ok){await smapAfterAction(r,'');return;}
    }
  }
  if(blockedOnly.length){
    var r2=await smapRelease(blockedOnly.map(function(s){return s.id;}));
    if(!r2.ok){await smapAfterAction(r2,'');return;}
  }
  await smapAfterAction({ok:true},'Asientos liberados.');
}

async function smapDoSell(){
  var sel=smapSelectedSeats();
  if(sel.some(function(s){return smapSeatState(s)!=='disp';})){flash('Solo puedes generar boleto de asientos disponibles.','d');return;}
  var fm=smapState.form||{};
  var nombre=(fm.nombre||'').trim();
  var tel=(fm.tel||'').trim();
  var seller=(fm.seller||'').trim();
  if(!nombre||!tel){flash('Nombre y teléfono del comprador son obligatorios.','d');return;}
  var res=await smapSell(sel.map(function(s){return s.id;}),nombre,tel,seller);
  if(res.ok){
    smapLastSale=res.data;
    smapState.form={nombre:'',tel:'',seller:''};
    flash('Boleto generado: '+res.data.order_code+' · $'+res.data.total,'s');
  } else flash(res.error,'d');
  await smapLoad(smapState.prod,smapState.perf);
}
var smapLastSale=null;

function renderSeatPanel(){
  var root=document.getElementById('smapRoot');
  if(!root||!smapIsAdmin()) return;
  var sel=smapSelectedSeats();
  if(smapLastSale){
    var done=document.createElement('div');done.className='smap-panel';
    var h=document.createElement('div');h.style.cssText='font-weight:800;color:#fff;margin-bottom:6px';
    h.textContent='Orden '+smapLastSale.order_code+' · Total $'+smapLastSale.total;done.appendChild(h);
    (smapLastSale.tickets||[]).forEach(function(t){
      var l=document.createElement('div');l.style.cssText='font-size:12px;color:var(--t2)';
      l.textContent=t.seat_label+' — QR: '+t.qr_token;done.appendChild(l);
    });
    var x=document.createElement('button');x.className='btn btn-o btn-sm';x.style.marginTop='8px';x.textContent='Cerrar';
    x.onclick=function(){smapLastSale=null;renderSeatMap();};done.appendChild(x);
    root.appendChild(done);
  }
  if(!sel.length) return;
  var p=document.createElement('div');p.className='smap-panel';
  var total=0;sel.forEach(function(s){var pr=smapState.prices[s.price_category_id];if(pr)total+=pr.price;});
  var info=document.createElement('div');info.style.cssText='font-size:13px;color:var(--t2);margin-bottom:8px';
  info.textContent=sel.length+' asiento(s): '+sel.map(function(s){return s.seat_label;}).join(', ')+' · Total informativo $'+total;
  p.appendChild(info);
  smapState.form=smapState.form||{nombre:'',tel:'',seller:''};
  [['nombre','Nombre del comprador'],['tel','Teléfono del comprador'],['seller','Código de vendedor (opcional)']].forEach(function(f){
    var i=document.createElement('input');i.type='text';i.className='form-c';i.placeholder=f[1];
    i.value=smapState.form[f[0]]||'';
    i.oninput=function(){smapState.form[f[0]]=i.value;};
    p.appendChild(i);
  });
  var acts=document.createElement('div');acts.className='smap-actions';
  [['Bloquear','btn btn-o btn-sm',smapDoBlock],['Liberar','btn btn-o btn-sm',smapDoRelease],['Generar Boleto','btn btn-a btn-sm',smapDoSell]].forEach(function(b){
    var el=document.createElement('button');el.className=b[1];el.textContent=b[0];el.onclick=b[2];acts.appendChild(el);
  });
  var cl=document.createElement('button');cl.className='btn btn-o btn-sm';cl.textContent='Limpiar selección';
  cl.onclick=function(){smapState.selected={};renderSeatMap();};acts.appendChild(cl);
  p.appendChild(acts);root.appendChild(p);
}

// ── BASES DE DATOS: compradores y estadísticas (Supabase, solo lectura) ──
var dbSel={prod:null,perf:'all'};
var dbState={key:null,loading:false,error:null,tickets:[],seats:[],blocked:[],search:''};
var dbOpen={buyers:false,stats:false};
function fmtMoney(n){ return '$'+Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:0,maximumFractionDigits:2}); }
async function dbLoad(){
  var perfs=DB.getPerformancesForProduction(dbSel.prod);
  var ids=dbSel.perf==='all'?perfs.map(function(p){return p.id;}):[dbSel.perf];
  var key=dbSel.prod+'|'+dbSel.perf;
  dbState.key=key;dbState.loading=true;dbState.error=null;renderDataPanels();
  if(!sb||!ids.length){dbState.tickets=[];dbState.seats=[];dbState.blocked=[];dbState.loading=false;renderDataPanels();return;}
  var r=await Promise.all([
    sb.from('tickets').select('id,is_active,checked_in_at,unit_price,performance_id,seat_id,seats(seat_label,section),orders(order_code,status,buyer_nombre,buyer_telefono,created_at,sellers(nombre,codigo))').in('performance_id',ids),
    sb.from('seats').select('id,section,is_active,price_categories(nombre)').eq('production_id',dbSel.prod).limit(2000),
    sb.from('blocked_seats').select('performance_id,seat_id').in('performance_id',ids)
  ]);
  if(dbState.key!==key) return; // la selección cambió mientras cargaba
  dbState.loading=false;
  var err=r[0].error||r[1].error||r[2].error;
  if(err){dbState.error='No se pudieron cargar los datos: '+err.message;dbState.tickets=[];dbState.seats=[];dbState.blocked=[];}
  else{dbState.tickets=r[0].data||[];dbState.seats=r[1].data||[];dbState.blocked=r[2].data||[];}
  renderDataPanels();
}
function dbTicketState(t){
  if(!t.is_active) return 'Cancelado';
  if(t.orders&&t.orders.status==='rechazado') return 'Rechazado';
  if(t.checked_in_at) return 'Usado';
  return t.orders&&t.orders.status==='pendiente'?'Pendiente':'Vigente';
}
function dbBuildTable(headers,rows,totalRow){
  var table=document.createElement('table');table.className='tickets-db-table';
  var thead=document.createElement('thead');var trh=document.createElement('tr');
  headers.forEach(function(h){var th=document.createElement('th');th.textContent=h;trh.appendChild(th);});
  thead.appendChild(trh);table.appendChild(thead);
  var tbody=document.createElement('tbody');
  rows.concat(totalRow?[totalRow]:[]).forEach(function(r,i){
    var tr=document.createElement('tr');
    if(totalRow&&i===rows.length) tr.className='db-total';
    r.forEach(function(v){var td=document.createElement('td');td.textContent=v;tr.appendChild(td);});
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}
function dbRenderBuyers(box){
  var perfs=DB.getPerformancesForProduction(dbSel.prod);
  var perfDate={};perfs.forEach(function(p){perfDate[p.id]=fmtPerfDate(p.starts_at);});
  var list=dbState.tickets.slice().sort(function(a,b){
    var da=a.orders?a.orders.created_at:'',db=b.orders?b.orders.created_at:'';
    return da<db?1:da>db?-1:0;
  });
  var q=dbState.search.trim().toLowerCase();
  var rows=list.map(function(t){
    var o=t.orders||{},s=t.seats||{},sl=o.sellers;
    return [o.order_code||'—',o.buyer_nombre||'—',o.buyer_telefono||'—',s.seat_label||'—',s.section||'—',
      fmtMoney(t.unit_price),dbTicketState(t),sl?sl.nombre:'—',perfDate[t.performance_id]||'—'];
  }).filter(function(r){return !q||r.join(' ').toLowerCase().indexOf(q)>-1;});
  var bar=document.createElement('div');bar.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px';
  var inp=document.createElement('input');inp.type='text';inp.className='form-c';inp.placeholder='Buscar por nombre, teléfono, orden o asiento';inp.value=dbState.search;inp.style.cssText='flex:1;min-width:220px';
  inp.oninput=function(){dbState.search=inp.value;var pos=inp.selectionStart;renderDataPanels();var n=document.getElementById('dbBuyersSearch');if(n){n.focus();n.setSelectionRange(pos,pos);}};
  inp.id='dbBuyersSearch';
  var cnt=document.createElement('span');cnt.style.cssText='font-size:12px;color:var(--t3)';cnt.textContent=rows.length+' de '+list.length+' boletos';
  bar.appendChild(inp);bar.appendChild(cnt);box.appendChild(bar);
  if(!rows.length){var e=document.createElement('div');e.className='empty-note';e.textContent=list.length?'Sin resultados para la búsqueda.':'Todavía no hay boletos generados.';box.appendChild(e);return;}
  box.appendChild(dbBuildTable(['Orden','Comprador','Teléfono','Asiento','Zona','Precio','Estado','Vendido por','Función'],rows));
}
function dbRenderStats(box){
  var perfs=DB.getPerformancesForProduction(dbSel.prod);
  var nPerf=dbSel.perf==='all'?perfs.length:1;
  var secOf={},cat={},order=[],bySec={};
  dbState.seats.forEach(function(s){
    secOf[s.id]=s.section;
    if(!bySec[s.section]){bySec[s.section]={cap:0,sold:0,rev:0,blk:0};order.push(s.section);cat[s.section]=s.price_categories?s.price_categories.nombre:'';}
    if(s.is_active) bySec[s.section].cap+=nPerf;
  });
  var soldKey={};
  dbState.tickets.forEach(function(t){
    if(!t.is_active||(t.orders&&t.orders.status==='rechazado')) return;
    var sec=t.seats&&t.seats.section;if(!bySec[sec]) return;
    soldKey[t.performance_id+'|'+t.seat_id]=1;
    bySec[sec].sold++;bySec[sec].rev+=Number(t.unit_price)||0;
  });
  dbState.blocked.forEach(function(b){
    var sec=secOf[b.seat_id];
    if(sec&&!soldKey[b.performance_id+'|'+b.seat_id]) bySec[sec].blk++;
  });
  var tot={cap:0,sold:0,rev:0,blk:0};
  var rows=order.map(function(sec){
    var d=bySec[sec];
    ['cap','sold','rev','blk'].forEach(function(k){tot[k]+=d[k];});
    return [sec+(cat[sec]?' · '+cat[sec]:''),d.cap,d.sold,fmtMoney(d.rev),Math.max(0,d.cap-d.sold-d.blk),d.blk];
  });
  if(!rows.length){var e=document.createElement('div');e.className='empty-note';e.textContent='Esta producción no tiene asientos configurados.';box.appendChild(e);return;}
  box.appendChild(dbBuildTable(['Zona','Capacidad','Boletos vendidos','Ingresos','Boletos disponibles','Bloqueados'],rows,
    ['TOTAL',tot.cap,tot.sold,fmtMoney(tot.rev),Math.max(0,tot.cap-tot.sold-tot.blk),tot.blk]));
  var hint=document.createElement('div');hint.style.cssText='font-size:12px;color:var(--t3);margin-top:8px';
  hint.textContent='Vendidos = boletos activos (incluye usados); no cuenta cancelados. Disponibles = capacidad − vendidos − bloqueados.'+(dbSel.perf==='all'?' Vista de todas las funciones sumadas.':'');
  box.appendChild(hint);
}
function dbPanel(root,key,title,fill){
  var d=document.createElement('details');d.className='adm-folder';d.open=dbOpen[key];
  d.ontoggle=function(){dbOpen[key]=d.open;};
  var sm=document.createElement('summary');sm.textContent=title;d.appendChild(sm);
  var body=document.createElement('div');body.style.cssText='margin-top:12px';
  if(dbState.loading){var l=document.createElement('div');l.className='empty-note';l.textContent='Cargando…';body.appendChild(l);}
  else if(dbState.error){var e=document.createElement('div');e.className='empty-note';e.textContent=dbState.error;body.appendChild(e);}
  else fill(body);
  d.appendChild(body);root.appendChild(d);
}
function renderDataPanels(){
  var root=document.getElementById('dbPanels');
  if(!root) return;
  clearEl(root);
  var prods=DB.getProductions();var ids=Object.keys(prods);
  if(!ids.length){var n=document.createElement('div');n.className='empty-note';n.textContent='No hay producciones.';root.appendChild(n);return;}
  if(!dbSel.prod||ids.indexOf(dbSel.prod)<0){
    dbSel.prod=ids.filter(function(i){return !prods[i].concluded;})[0]||ids[0];dbSel.perf='all';
  }
  var perfs=DB.getPerformancesForProduction(dbSel.prod);
  if(dbSel.perf!=='all'&&!perfs.some(function(p){return p.id===dbSel.perf;})){ dbSel.perf='all'; dbState.key=null; }
  var row=document.createElement('div');row.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px';
  var ps=document.createElement('select');ps.className='form-c';ps.style.cssText='flex:1;min-width:200px';ps.setAttribute('aria-label','Producción');
  ids.forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=prods[id].nombre+(prods[id].concluded?' (concluida)':'');if(id===dbSel.prod)o.selected=true;ps.appendChild(o);});
  ps.onchange=function(){dbSel.prod=ps.value;dbSel.perf='all';dbLoad();};
  var fs=document.createElement('select');fs.className='form-c';fs.style.cssText='flex:1;min-width:240px';fs.setAttribute('aria-label','Función');
  var oa=document.createElement('option');oa.value='all';oa.textContent='Todas las funciones';fs.appendChild(oa);
  perfs.forEach(function(pf){var o=document.createElement('option');o.value=pf.id;o.textContent=fmtPerfDate(pf.starts_at);if(pf.id===dbSel.perf)o.selected=true;fs.appendChild(o);});
  if(dbSel.perf==='all') oa.selected=true;
  fs.onchange=function(){dbSel.perf=fs.value;dbLoad();};
  var rb=document.createElement('button');rb.className='btn btn-o btn-sm';rb.textContent='↻ Actualizar';rb.onclick=function(){dbLoad();};
  row.appendChild(ps);row.appendChild(fs);row.appendChild(rb);root.appendChild(row);
  dbPanel(root,'buyers','📋 Base de datos de compradores',dbRenderBuyers.bind(null));
  dbPanel(root,'stats','📈 Estadísticas de venta',dbRenderStats.bind(null));
  if(dbState.key===null) dbLoad();
}
DB.subscribe(DB.KEYS.performances, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderDataPanels(); });

// ── SOLICITUDES PENDIENTES (apartan asientos hasta aprobar/rechazar) ──
var pendingState={list:[],loading:false,error:null};
async function loadPendingOrders(){
  var box=document.getElementById('pendingOrders');
  if(!box||!sb) return;
  pendingState.loading=true;pendingState.error=null;renderPendingOrders();
  var r=await sb.from('orders')
    .select('id,order_code,buyer_nombre,buyer_telefono,total,created_at,performance_id,sellers(nombre),tickets(is_active,seats(seat_label))')
    .eq('status','pendiente').order('created_at');
  pendingState.loading=false;
  if(r.error){pendingState.error='No se pudieron cargar las solicitudes: '+r.error.message;pendingState.list=[];}
  else pendingState.list=r.data||[];
  renderPendingOrders();
}
async function pendingAct(order,fn,okMsg){
  var r=await sb.rpc(fn,{target_order_id:order.id});
  if(r.error) flash(r.error.message,'d'); else flash(okMsg+' '+order.order_code,'s');
  await loadPendingOrders();
  if(smapState.perf) smapLoad(smapState.prod,smapState.perf);
}
function renderPendingOrders(){
  var box=document.getElementById('pendingOrders');
  if(!box) return;
  clearEl(box);
  var title=document.createElement('div');title.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;color:var(--t2)';
  title.textContent='Solicitudes pendientes'+(pendingState.list.length?' ('+pendingState.list.length+')':'');
  box.appendChild(title);
  if(pendingState.loading){var l=document.createElement('div');l.className='empty-note';l.textContent='Cargando…';box.appendChild(l);return;}
  if(pendingState.error){var e=document.createElement('div');e.className='empty-note';e.textContent=pendingState.error;box.appendChild(e);return;}
  if(!pendingState.list.length){var n=document.createElement('div');n.className='empty-note';n.textContent='No hay solicitudes pendientes.';box.appendChild(n);return;}
  var isAdmin=AuthService.session.rol==='admin';
  pendingState.list.forEach(function(o){
    var perf=DB.getPerformances().filter(function(p){return p.id===o.performance_id;})[0];
    var labels=(o.tickets||[]).filter(function(t){return t.is_active;}).map(function(t){return t.seats?t.seats.seat_label:'—';});
    var row=document.createElement('div');row.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;background:var(--g2);border:1px solid var(--g3);border-radius:var(--r8);padding:12px 14px;margin-bottom:8px';
    var info=document.createElement('div');info.style.cssText='font-size:13px;color:var(--t2);line-height:1.5';
    var l1=document.createElement('div');l1.style.cssText='color:#fff;font-weight:700';l1.textContent=o.order_code+' · '+o.buyer_nombre+' · '+o.buyer_telefono;
    var l2=document.createElement('div');l2.textContent=(perf?fmtPerfDate(perf.starts_at):'')+' · '+(labels.join(', ')||'sin asientos')+' · '+money(o.total)+(o.sellers?' · Vendedor: '+o.sellers.nombre:'');
    info.appendChild(l1);info.appendChild(l2);row.appendChild(info);
    if(isAdmin){
      var acts=document.createElement('div');acts.style.cssText='display:flex;gap:8px';
      var ok=document.createElement('button');ok.className='btn btn-a btn-sm';ok.textContent='Aprobar';
      ok.onclick=function(){ pendingAct(o,'approve_order','Solicitud aprobada:'); };
      var no=document.createElement('button');no.className='btn btn-o btn-sm';no.textContent='Rechazar';
      no.onclick=function(){ if(confirm('¿Rechazar la solicitud '+o.order_code+'? Se liberan sus asientos.')) pendingAct(o,'reject_order','Solicitud rechazada:'); };
      acts.appendChild(ok);acts.appendChild(no);row.appendChild(acts);
    }
    box.appendChild(row);
  });
}

// Conteo "en vivo" de Showman para Ventas de Cartelera (boletos activos, aprobados o apartados).
var showmanSold=0;
async function loadShowmanSold(){
  if(!sb) return;
  var ids=DB.getPerformancesForProduction(SHOWMAN_ID).map(function(p){return p.id;});
  if(!ids.length){showmanSold=0;renderSalesBars();return;}
  var r=await sb.from('tickets').select('id',{count:'exact',head:true}).in('performance_id',ids).eq('is_active',true);
  if(!r.error){showmanSold=r.count||0;renderSalesBars();}
}

var boletajeSel={prod:null,perf:null};
function fmtPerfDate(iso){
  if(!iso) return 'Fecha por definir';
  try{return new Date(iso).toLocaleString('es-MX',{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return iso;}
}
function renderBoletajeProductions(){
  // Selector de producción + función y mapa real de asientos (Supabase) de la función elegida.
  var list=document.getElementById('boletajeProdList');
  if(!list) return;
  clearEl(list);
  var prods=DB.getProductions();
  var ids=Object.keys(prods).filter(function(id){return !prods[id].concluded;});
  if(!ids.length){
    var none=document.createElement('div');none.className='empty-note';none.textContent='No hay producciones activas.';
    list.appendChild(none);return;
  }
  if(!boletajeSel.prod||ids.indexOf(boletajeSel.prod)<0) boletajeSel.prod=ids[0];
  var perfs=DB.getPerformancesForProduction(boletajeSel.prod);
  if(!perfs.some(function(p){return p.id===boletajeSel.perf;})) boletajeSel.perf=perfs.length?perfs[0].id:null;

  var row=document.createElement('div');row.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px';
  var prodSel=document.createElement('select');prodSel.className='form-c';prodSel.style.cssText='flex:1;min-width:200px';prodSel.setAttribute('aria-label','Producción');
  ids.forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=prods[id].nombre;if(id===boletajeSel.prod)o.selected=true;prodSel.appendChild(o);});
  prodSel.onchange=function(){boletajeSel.prod=prodSel.value;boletajeSel.perf=null;renderBoletajeProductions();};
  var perfSel=document.createElement('select');perfSel.className='form-c';perfSel.style.cssText='flex:1;min-width:240px';perfSel.setAttribute('aria-label','Función');
  if(!perfs.length){var o0=document.createElement('option');o0.textContent='Sin funciones';perfSel.appendChild(o0);perfSel.disabled=true;}
  perfs.forEach(function(pf){var o=document.createElement('option');o.value=pf.id;o.textContent=fmtPerfDate(pf.starts_at)+(pf.on_sale?' · en venta':'');if(pf.id===boletajeSel.perf)o.selected=true;perfSel.appendChild(o);});
  perfSel.onchange=function(){boletajeSel.perf=perfSel.value;renderBoletajeProductions();};
  row.appendChild(prodSel);row.appendChild(perfSel);list.appendChild(row);

  var root=document.createElement('div');root.id='smapRoot';list.appendChild(root);
  if(boletajeSel.prod && boletajeSel.perf){
    if(smapState.perf!==boletajeSel.perf) smapLoad(boletajeSel.prod,boletajeSel.perf); else renderSeatMap();
  } else {
    var none2=document.createElement('div');none2.className='empty-note';
    none2.textContent='Esta producción aún no tiene funciones. Créalas en Gestión de Producciones.';
    root.appendChild(none2);
  }
}
DB.subscribe(DB.KEYS.productions, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderBoletajeProductions(); });
DB.subscribe(DB.KEYS.performances, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderBoletajeProductions(); });

DB.subscribe(DB.KEYS.sellers, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderSellersPanel(); });

function closeAccessModal(){
  var m=document.getElementById('accessModal');
  if(m) m.remove();
}
function showAccessModal(productionId, order, seat, code, startsAt){
  closeAccessModal();
  var prod = DB.getProduction(productionId) || {};
  var backdrop=document.createElement('div');backdrop.className='access-modal-backdrop';backdrop.id='accessModal';
  backdrop.onclick=function(e){ if(e.target===backdrop) closeAccessModal(); };
  var modal=document.createElement('div');modal.className='access-modal';
  modal.style.background=TICKET_BG[productionId]||'var(--g2)';
  var closeBtn=document.createElement('button');closeBtn.className='access-modal-close';closeBtn.textContent='✕';
  closeBtn.onclick=closeAccessModal;
  // Boleto digital "bonito": logo DARF chico arriba, logo de la producción grande y centrado,
  // QR debajo de los logos, y al final los datos del evento. Las producciones aún no tienen
  // un campo "hora" (ni Showman define fecha/venue todavía) — se muestra '—' mientras se define.
  var darfLogo=document.createElement('img');darfLogo.className='access-modal-darf';darfLogo.src=DARF_LOGO;darfLogo.alt='DARF Productions';
  var logo=document.createElement('img');logo.className='access-modal-logo';logo.src=TICKET_LOGOS[productionId]||'';logo.alt=prod.nombre||'';
  var nombre=document.createElement('div');nombre.className='access-modal-name';nombre.textContent=order.buyerNombre||order.userId||'Comprador';
  var img=document.createElement('img');img.className='access-modal-qr';img.alt='QR '+seat;
  qrDataUrl(code, function(url){ if(url) img.src=url; });
  var detail=document.createElement('div');detail.className='access-modal-detail';
  detail.textContent=(startsAt?fmtPerfDate(startsAt):(prod.fecha||'—'))+' · '+(prod.venue||'—')+' · Asiento '+seat;
  modal.appendChild(closeBtn);modal.appendChild(darfLogo);modal.appendChild(logo);modal.appendChild(nombre);modal.appendChild(img);modal.appendChild(detail);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
}

// ─── ESCÁNER QR (cámara real + fallback manual) ───────
let qrScannerInstance = null;
function startQrScanner(){
  if(!window.Html5Qrcode){ flash('El lector de cámara no cargó. Usa la validación manual.','d'); return; }
  if(qrScannerInstance){ return; }
  qrScannerInstance = new Html5Qrcode('qrReaderBox');
  qrScannerInstance.start(
    {facingMode:'environment'},
    {fps:10, qrbox:function(w,h){var m=Math.floor(Math.min(w,h)*0.7);return {width:m,height:m};}},
    function(decodedText){ handleQrResult(decodedText); },
    function(){ /* frame sin QR, ignorar */ }
  ).then(function(){
    var fr=document.getElementById('qrFrame'); if(fr) fr.classList.add('is-live');
  }).catch(function(err){
    flash('No se pudo acceder a la cámara: '+err+'. Usa la validación manual.','d');
    qrScannerInstance=null;
  });
}
function stopQrScanner(){
  if(qrScannerInstance){
    qrScannerInstance.stop().then(function(){ qrScannerInstance.clear(); qrScannerInstance=null; }).catch(function(){ qrScannerInstance=null; });
  }
  var fr=document.getElementById('qrFrame'); if(fr) fr.classList.remove('is-live');
}
function manualCheckIn(){
  var input=document.getElementById('qrManualInput');
  var code=(input.value||'').trim();
  if(!code){flash('Escribe o pega el código del boleto.','d');return;}
  handleQrResult(code);
  input.value='';
}
async function handleQrResult(code){
  var f=document.getElementById('qrFrameText');
  var show=function(txt,kind){ if(f){ clearEl(f); f.className='qr-scanner-text'+(kind?' '+kind:''); f.textContent=txt; } };
  if(!sb){flash('No hay conexión con el servidor.','d');return;}
  var r=await sb.rpc('check_in_ticket',{target_qr_token:String(code||'')});
  if(r.error){flash(r.error.message,'d');show('❌ Error','bad');return;}
  var d=r.data||{};
  var who=d.buyer_nombre||'Comprador';
  var seat=d.seat_label?('Asiento '+d.seat_label):'';
  if(d.result==='ok'){
    flash('ACCESO — '+who+(seat?' · '+seat:''),'s');
    if(f){
      clearEl(f); f.className='qr-scanner-text ok';
      var l1=document.createElement('div');l1.textContent='✅ '+who;
      f.appendChild(l1);
      if(seat){var l2=document.createElement('div');l2.textContent=seat;f.appendChild(l2);}
    }
    if(document.getElementById('smapRoot') && smapState.perf) smapLoad(smapState.prod,smapState.perf);
  } else if(d.result==='ya_usado'){
    flash('Este boleto ya fue utilizado.'+(seat?' ('+seat+')':''),'d');show('⚠️ Ya utilizado','bad');
  } else if(d.result==='cancelado'){
    flash('Este boleto fue cancelado.','d');show('❌ Cancelado','bad');
  } else {
    flash('Código no reconocido.','d');show('❌ No reconocido','bad');
  }
  setTimeout(function(){ show('Esperando código QR…'); },3000);
}

// ─── URL DIRECTA ──────────────────────────────────────
AuthService.restoreSession();
(function(){var p=new URLSearchParams(window.location.search).get('v');if(p&&VIEWS_MAP[p])nav(p);})();
window.addEventListener('popstate', function(){
  var p=new URLSearchParams(window.location.search).get('v');
  nav((p&&VIEWS_MAP[p])?p:'home', true);
});

// ─── PRODUCCIONES CONCLUIDAS: ocultar de Cartelera ────
function applyConcludedVisibility(){
  var prods=DB.getProductions();
  var card=document.getElementById('cartCard-showman');
  if(card) card.style.display=(prods[SHOWMAN_ID]&&prods[SHOWMAN_ID].concluded)?'none':'';
}
DB.subscribe(DB.KEYS.productions, applyConcludedVisibility);
