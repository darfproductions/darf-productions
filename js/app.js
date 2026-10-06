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
        onSale: row.on_sale, attendeesHistoric: row.attendees_historic
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
    if(!fields.startsAt) return {ok:false, error:'Escribe la fecha y hora de la función.'};
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
  function blockSeats(productionId, seats){
    const all = read(KEYS.blocked, {});
    const cur = Object.assign({}, all[productionId]||{});
    (seats||[]).forEach(function(s){ cur[s]=true; });
    all[productionId]=cur;
    write(KEYS.blocked, all);
  }
  function releaseSeats(productionId, seats){
    const all = read(KEYS.blocked, {});
    const cur = Object.assign({}, all[productionId]||{});
    (seats||[]).forEach(function(s){ delete cur[s]; });
    all[productionId]=cur;
    write(KEYS.blocked, all);
  }
  function releaseSeatsFromOrders(productionId, seats){
    // "Liberar" en el panel de staff también debe soltar asientos ocupados (pendiente/aprobado),
    // no solo los del mapa de bloqueados — si no, un asiento rojo (aprobado) se queda "liberado"
    // en apariencia pero sigue tomado porque su estado real vive en la orden, no en `blocked`.
    const set = {}; (seats||[]).forEach(function(s){ set[s]=true; });
    const orders = getOrders();
    let changed = false;
    orders.forEach(function(o){
      if(o.productionId!==productionId) return;
      if(o.status!=='pendiente' && o.status!=='aprobado') return;
      const remaining = (o.seats||[]).filter(function(s){ return !set[s]; });
      if(remaining.length===(o.seats||[]).length) return;
      changed = true;
      o.seats = remaining;
      if(o.seatQrs){ Object.keys(set).forEach(function(s){ delete o.seatQrs[s]; }); }
      if(o.checkedInSeats){ Object.keys(set).forEach(function(s){ delete o.checkedInSeats[s]; }); }
      const prod = getProduction(productionId);
      if(prod) o.total = remaining.length * prod.price;
      if(remaining.length===0) o.status='rechazado';
    });
    if(changed) saveOrders(orders);
  }
  function getApprovedCount(productionId){
    let n=0;
    getOrders().forEach(function(o){
      if(o.productionId===productionId && o.status==='aprobado') n += (o.seats||[]).length;
    });
    return n;
  }
  function checkInByQr(code){
    const orders = getOrders();
    const order = orders.find(function(o){
      return o.qrCode===code || (o.seatQrs && Object.values(o.seatQrs).indexOf(code)>-1);
    });
    if(!order) return {ok:false, reason:'no-encontrado'};
    if(order.status!=='aprobado') return {ok:false, reason:'no-aprobado', order};
    var seat = null;
    if(order.seatQrs){
      Object.keys(order.seatQrs).forEach(function(s){ if(order.seatQrs[s]===code) seat=s; });
    }
    var checkedInSeats = order.checkedInSeats || {};
    if(seat){
      if(checkedInSeats[seat]) return {ok:false, reason:'ya-usado', order, seat};
      checkedInSeats = Object.assign({}, checkedInSeats);
      checkedInSeats[seat]=true;
      var allSeatsUsed = (order.seats||[]).every(function(s){ return checkedInSeats[s]; });
      updateOrder(order.id, {checkedInSeats: checkedInSeats, checkedIn: allSeatsUsed});
      return {ok:true, order, seat};
    }
    // fallback: código legacy de orden completa (sin seatQrs)
    if(order.checkedIn) return {ok:false, reason:'ya-usado', order};
    updateOrder(order.id, {checkedIn:true});
    return {ok:true, order};
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
    loadProductions, getProductions, getProduction, setProductionOnSale, createProduction, updateProduction,
    loadPerformances, getPerformances, getPerformancesForProduction, createPerformance, updatePerformance,
    getOrders, createOrder, updateOrder, approveOrder, rejectOrder,
    getPendingOrders, getPendingOrdersFor, getOrdersForUser, getOrdersForProduction,
    getSeatsTaken, getApprovedCount, checkInByQr,
    loadContactMessages, getContactMessages, createContactMessage, deleteContactMessage,
    getBlockedSeats, blockSeats, releaseSeats, releaseSeatsFromOrders,
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
  if(key==='checkout'){setTimeout(renderCheckout,0);}
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
  if(tab==='boletos'){ renderMisBoletos(); }
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
document.getElementById('navProdBtn').addEventListener('click',function(e){if(window.matchMedia('(max-width:1180px)').matches){e.stopPropagation();document.getElementById('navProdMenu').classList.toggle('mob-open');}});

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

// ─── CHECKOUT PÚBLICO (dinámico, producción en venta) ──
function currentOnSaleProduction(){
  var prods = DB.getProductions();
  return prods[SHOWMAN_ID] && prods[SHOWMAN_ID].onSale ? prods[SHOWMAN_ID] : null;
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
function renderCheckout(){
  var prod = currentOnSaleProduction();
  var wrap = document.querySelector('#v-checkout .checkout-layout');
  var notice = document.getElementById('checkoutNotOnSale');
  if(!prod){
    if(wrap) wrap.style.display='none';
    if(notice) notice.style.display='block';
    return;
  }
  if(wrap) wrap.style.display='';
  if(notice) notice.style.display='none';

  document.getElementById('cartShowName').textContent = prod.nombre;
  document.getElementById('cartShowDate').textContent = prod.venue||'';
  document.getElementById('cartPricePerSeat').textContent = 'Precio por boleto: '+money(prod.price);

  var taken = DB.getSeatsTaken(prod.id);
  var map = document.getElementById('seatMap');
  var selected = Array.from(map.querySelectorAll('.seat.selected')).map(function(s){return s.dataset.seat;});
  clearEl(map);
  allSeatIds().forEach(function(seatId){
    // Mismos lineamientos de color que el mapa de staff (staffSeatStateClass): el comprador
    // ve el mismo significado de colores, solo que aquí ningún asiento tomado es seleccionable.
    var stateClass = staffSeatStateClass(taken[seatId]);
    var div=document.createElement('div');
    div.dataset.seat=seatId;
    div.textContent=seatId;
    if(stateClass==='disp'){
      var isSel = selected.indexOf(seatId)>-1;
      div.className='seat disp'+(isSel?' selected':'');
      div.onclick=function(){ selectSeat(this); };
    } else {
      div.className='seat '+stateClass;
    }
    map.appendChild(div);
  });
  updateCart();
}
DB.subscribe(DB.KEYS.orders, function(){ if(document.getElementById('v-checkout').classList.contains('active')) renderCheckout(); });
DB.subscribe(DB.KEYS.productions, function(){ if(document.getElementById('v-checkout').classList.contains('active')) renderCheckout(); });

function selectSeat(el){
  if(!el.classList.contains('disp'))return;
  el.classList.toggle('selected');
  updateCart();
}
function updateCart(){
  var prod = currentOnSaleProduction();
  var seats=document.querySelectorAll('#seatMap .seat.selected');
  var price= prod?prod.price:0;
  var total=(seats.length*price).toFixed(2);
  var list=Array.from(seats).map(function(s){return s.dataset.seat;}).join(', ');
  var items=document.getElementById('cartItems');
  if(items){
    clearEl(items);
    if(seats.length>0){
      var row=document.createElement('div');row.className='cart-item';
      var label=document.createElement('span');label.textContent='Asientos: ';label.style.cssText='font-size:13px;color:var(--t2)';
      var val=document.createElement('span');val.textContent=list;val.style.cssText='font-size:13px;font-weight:700;color:#fff';
      row.appendChild(label);row.appendChild(val);items.appendChild(row);
    } else {
      var empty=document.createElement('span');empty.style.cssText='font-size:13px;color:var(--t3)';empty.textContent='Ningún asiento seleccionado';
      items.appendChild(empty);
    }
  }
  var totalEl=document.getElementById('cartTotalPrice');
  if(totalEl)totalEl.textContent='$'+total+' MXN';
}
function proceedToPayment(){
  var prod = currentOnSaleProduction();
  if(!prod){flash('Los boletos aún no están a la venta.','d');return;}
  if(!AuthService.session.usuario){nav('login');return;}
  var seats=Array.from(document.querySelectorAll('#seatMap .seat.selected')).map(function(s){return s.dataset.seat;});
  if(!seats.length){flash('Selecciona al menos un asiento.','d');return;}
  var phoneEl=document.getElementById('buyerPhone');
  var phone=(phoneEl&&phoneEl.value||'').trim();
  if(!phone){flash('Escribe tu número de teléfono.','d');return;}
  var sellerEl=document.getElementById('buyerSellerCode');
  var sellerCodeRaw=(sellerEl&&sellerEl.value||'').trim();
  var vendedorCodigo=null;
  if(sellerCodeRaw){
    var seller=DB.getSellerByCode(sellerCodeRaw);
    if(!seller){flash('El código de vendedor no existe. Verifícalo o déjalo en blanco.','d');return;}
    vendedorCodigo=seller.codigo;
  }
  var total = seats.length*prod.price;
  var order = DB.createOrder({
    userId: AuthService.session.usuario,
    buyerNombre: AuthService.session.nombre,
    productionId: prod.id,
    seats: seats,
    total: total,
    telefono: phone,
    vendedorCodigo: vendedorCodigo
  });
  var msg = 'Hola, quiero pagar mi solicitud de boletos para '+prod.nombre+
    ' — Código de orden: '+order.codigoOrden+
    ' — Asientos: '+seats.join(', ')+' — Total: '+money(total)+
    ' — Teléfono: '+phone+
    '. Mi solicitud ya quedó guardada en mi cuenta DARF, en espera de aprobación.';
  flash('Solicitud guardada. Te redirigimos a WhatsApp para el pago…','s');
  window.open('https://wa.me/4465220560?text='+encodeURIComponent(msg), '_blank');
  if(phoneEl) phoneEl.value='';
  if(sellerEl) sellerEl.value='';
  nav('cuenta');
}

// ─── MIS BOLETOS (cuenta del fan) ─────────────────────
const misBoletosOpen={};
function toggleMisBoletos(orderId){
  misBoletosOpen[orderId]=!misBoletosOpen[orderId];
  renderMisBoletos();
}
function renderMisBoletos(){
  var box=document.getElementById('cp-boletos-list');
  if(!box) return;
  var orders = AuthService.session.usuario ? DB.getOrdersForUser(AuthService.session.usuario) : [];
  clearEl(box);
  if(!orders.length){
    var empty=document.createElement('div');
    empty.className='empty-note';
    empty.textContent='Todavía no tienes boletos. Cuando compres, aparecerán aquí.';
    box.appendChild(empty);
    return;
  }
  orders.slice().reverse().forEach(function(o){
    var prod = DB.getProduction(o.productionId) || {nombre:o.productionId};
    var card=document.createElement('div');
    card.className='ticket-card';
    var main=document.createElement('div');main.className='ticket-main';
    var info=document.createElement('div');
    var show=document.createElement('div');show.className='ticket-show';show.textContent=prod.nombre;
    var d0=document.createElement('div');d0.className='ticket-detail';d0.textContent='Código de orden: '+(o.codigoOrden||'—');
    var d1=document.createElement('div');d1.className='ticket-detail';d1.textContent=(prod.venue||'')+' · Asientos: '+(o.seats||[]).join(', ');
    var d2=document.createElement('div');d2.className='ticket-detail';d2.textContent='Total: '+money(o.total);
    var pill=document.createElement('span');pill.className='status-pill status-'+o.status;pill.textContent=o.status;
    info.appendChild(show);info.appendChild(d0);info.appendChild(d1);info.appendChild(d2);
    var pillWrap=document.createElement('div');pillWrap.style.marginTop='6px';pillWrap.appendChild(pill);info.appendChild(pillWrap);
    main.appendChild(info);
    var qrBlock=document.createElement('div');qrBlock.className='ticket-qr-block';
    if(o.status==='aprobado' && o.seatQrs && (o.seats||[]).length>1){
      var open=!!misBoletosOpen[o.id];
      var dd=document.createElement('div');dd.className='ticket-dropdown';
      var ddHdr=document.createElement('div');ddHdr.className='ticket-dropdown-hdr';
      var ddLabel=document.createElement('span');ddLabel.textContent=(o.seats||[]).length+' boletos';
      var ddChev=document.createElement('span');ddChev.className='ticket-dropdown-chevron';ddChev.textContent='▾';
      ddHdr.appendChild(ddLabel);ddHdr.appendChild(ddChev);
      ddHdr.onclick=function(){ toggleMisBoletos(o.id); };
      var ddBody=document.createElement('div');ddBody.className='ticket-dropdown-body';ddBody.style.display=open?'flex':'none';
      if(open){
        (o.seats||[]).forEach(function(seatId){
          var code = o.seatQrs[seatId];
          if(!code) return;
          var one=document.createElement('div');one.style.cssText='display:flex;flex-direction:column;align-items:center;gap:4px';
          var img=document.createElement('img');img.className='qr-img';img.alt='QR '+seatId;
          qrDataUrl(code, function(url){ if(url) img.src=url; });
          var codeLbl=document.createElement('div');codeLbl.className='ticket-code';codeLbl.textContent='Asiento '+seatId;
          var verBtn=document.createElement('button');verBtn.className='btn btn-o btn-sm';verBtn.textContent='Ver boleto →';verBtn.style.marginTop='2px';
          verBtn.onclick=function(){ showAccessModal(o.productionId, o, seatId, code); };
          one.appendChild(img);one.appendChild(codeLbl);one.appendChild(verBtn);
          ddBody.appendChild(one);
        });
      }
      dd.appendChild(ddHdr);dd.appendChild(ddBody);
      qrBlock.appendChild(dd);
    } else if(o.status==='aprobado' && o.seatQrs){
      (o.seats||[]).forEach(function(seatId){
        var code = o.seatQrs[seatId];
        if(!code) return;
        var one=document.createElement('div');one.style.cssText='display:flex;flex-direction:column;align-items:center;gap:4px';
        var img=document.createElement('img');img.className='qr-img';img.alt='QR '+seatId;
        qrDataUrl(code, function(url){ if(url) img.src=url; });
        var codeLbl=document.createElement('div');codeLbl.className='ticket-code';codeLbl.textContent='Asiento '+seatId;
        var verBtn=document.createElement('button');verBtn.className='btn btn-o btn-sm';verBtn.textContent='Ver boleto →';verBtn.style.marginTop='2px';
        verBtn.onclick=function(){ showAccessModal(o.productionId, o, seatId, code); };
        one.appendChild(img);one.appendChild(codeLbl);one.appendChild(verBtn);
        qrBlock.appendChild(one);
      });
    } else if(o.status==='aprobado' && o.qrCode){
      var img2=document.createElement('img');img2.className='qr-img';img2.alt='QR boleto';
      qrDataUrl(o.qrCode, function(url){ if(url) img2.src=url; });
      var code2=document.createElement('div');code2.className='ticket-code';code2.textContent=o.qrCode.slice(0,10).toUpperCase();
      var verBtn2=document.createElement('button');verBtn2.className='btn btn-o btn-sm';verBtn2.textContent='Ver boleto →';verBtn2.style.marginTop='2px';
      var soleSeat=(o.seats||[])[0]||'—';
      verBtn2.onclick=function(){ showAccessModal(o.productionId, o, soleSeat, o.qrCode); };
      qrBlock.appendChild(img2);qrBlock.appendChild(code2);qrBlock.appendChild(verBtn2);
    } else if(o.status==='pendiente'){
      var wait=document.createElement('div');wait.style.cssText='font-size:11px;color:var(--t2);text-align:center;max-width:100px';wait.textContent='En espera de aprobación';
      qrBlock.appendChild(wait);
    } else {
      var rej=document.createElement('div');rej.style.cssText='font-size:11px;color:var(--rojo);text-align:center;max-width:100px';rej.textContent='Solicitud rechazada';
      qrBlock.appendChild(rej);
    }
    card.appendChild(main);card.appendChild(qrBlock);
    box.appendChild(card);
  });
}
DB.subscribe(DB.KEYS.orders, function(){ if(document.getElementById('v-cuenta').classList.contains('active')) renderMisBoletos(); });

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
const staffAccExpanded={};
const staffDbOpen={};
const staffLastGenerated={};
async function renderStaff(){
  renderSalesBars();
  renderBoletajeProductions();
  renderContactInbox();
  renderAdminProductions();
  await Promise.all([DB.loadSellers(), DB.loadContactMessages(), DB.loadPerformances()]);
  renderBoletajeProductions();
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
  Object.keys(prods).forEach(function(id){
    box.appendChild(buildAdminProdCard(prods[id]));
  });
}
DB.subscribe(DB.KEYS.productions, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderAdminProductions(); });
DB.subscribe(DB.KEYS.performances, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderAdminProductions(); });

function buildAdminProdCard(prod){
  var card=document.createElement('div');card.style.cssText='background:var(--g2);border:1px solid var(--g3);border-radius:var(--r8);padding:16px;margin-bottom:14px';

  var row=document.createElement('div');row.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center';
  var idLabel=document.createElement('div');idLabel.style.cssText='font-size:11px;color:var(--t3);min-width:70px';idLabel.textContent=prod.id;
  var nombreI=document.createElement('input');nombreI.type='text';nombreI.className='form-c';nombreI.value=prod.nombre||'';nombreI.placeholder='Nombre';nombreI.style.cssText='flex:1;min-width:140px';
  var venueI=document.createElement('input');venueI.type='text';venueI.className='form-c';venueI.value=prod.venue||'';venueI.placeholder='Venue';venueI.style.cssText='flex:1;min-width:140px';
  var fechaI=document.createElement('input');fechaI.type='text';fechaI.className='form-c';fechaI.value=prod.fecha||'';fechaI.placeholder='Fecha';fechaI.style.cssText='flex:1;min-width:100px';
  var priceI=document.createElement('input');priceI.type='number';priceI.className='form-c';priceI.value=prod.price||0;priceI.placeholder='Precio';priceI.style.cssText='flex:1;min-width:90px';
  var capI=document.createElement('input');capI.type='number';capI.className='form-c';capI.value=prod.capacity||'';capI.placeholder='Capacidad';capI.style.cssText='flex:1;min-width:100px';
  var saveBtn=document.createElement('button');saveBtn.className='btn btn-a btn-sm';saveBtn.textContent='Guardar';
  saveBtn.onclick=async function(){
    var ok = await DB.updateProduction(prod.id, {
      nombre: nombreI.value, venue: venueI.value, fecha: fechaI.value,
      price: priceI.value, capacity: capI.value
    });
    if(!ok){ flash('No se pudo actualizar la producción.','d'); return; }
    flash('Producción actualizada: '+nombreI.value,'s');
  };
  row.appendChild(idLabel);row.appendChild(nombreI);row.appendChild(venueI);row.appendChild(fechaI);row.appendChild(priceI);row.appendChild(capI);row.appendChild(saveBtn);
  card.appendChild(row);

  var perfWrap=document.createElement('div');perfWrap.style.cssText='margin-top:14px;padding-top:14px;border-top:1px solid #252525';
  var perfTitle=document.createElement('div');perfTitle.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;color:var(--t2)';perfTitle.textContent='Funciones';
  perfWrap.appendChild(perfTitle);
  var perfs = DB.getPerformancesForProduction(prod.id);
  perfs.forEach(function(perf){
    var prow=document.createElement('div');prow.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px';
    var dtI=document.createElement('input');dtI.type='datetime-local';dtI.className='form-c';dtI.value=toDatetimeLocalValue(perf.starts_at);dtI.style.cssText='flex:1;min-width:180px';
    var pvenueI=document.createElement('input');pvenueI.type='text';pvenueI.className='form-c';pvenueI.value=perf.venue||'';pvenueI.placeholder='Venue (opcional)';pvenueI.style.cssText='flex:1;min-width:140px';
    var label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:6px;font-size:12px;color:var(--t2);cursor:pointer';
    var onSaleChk=document.createElement('input');onSaleChk.type='checkbox';onSaleChk.checked=!!perf.on_sale;
    label.appendChild(onSaleChk);label.appendChild(document.createTextNode('En venta'));
    var psaveBtn=document.createElement('button');psaveBtn.className='btn btn-o btn-sm';psaveBtn.textContent='Guardar';
    psaveBtn.onclick=async function(){
      var iso = dtI.value ? new Date(dtI.value).toISOString() : null;
      if(!iso){ flash('Escribe la fecha y hora de la función.','d'); return; }
      var ok = await DB.updatePerformance(perf.id, {startsAt: iso, venue: pvenueI.value, onSale: onSaleChk.checked});
      if(!ok){ flash('No se pudo actualizar la función.','d'); return; }
      flash('Función actualizada.','s');
    };
    prow.appendChild(dtI);prow.appendChild(pvenueI);prow.appendChild(label);prow.appendChild(psaveBtn);
    perfWrap.appendChild(prow);
  });
  if(!perfs.length){
    var empty=document.createElement('div');empty.className='empty-note';empty.textContent='Sin funciones todavía.';
    perfWrap.appendChild(empty);
  }

  var newRow=document.createElement('div');newRow.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px';
  var newDtI=document.createElement('input');newDtI.type='datetime-local';newDtI.className='form-c';newDtI.style.cssText='flex:1;min-width:180px';
  var newVenueI=document.createElement('input');newVenueI.type='text';newVenueI.className='form-c';newVenueI.placeholder='Venue (opcional)';newVenueI.style.cssText='flex:1;min-width:140px';
  var newLabel=document.createElement('label');newLabel.style.cssText='display:flex;align-items:center;gap:6px;font-size:12px;color:var(--t2);cursor:pointer';
  var newOnSaleChk=document.createElement('input');newOnSaleChk.type='checkbox';
  newLabel.appendChild(newOnSaleChk);newLabel.appendChild(document.createTextNode('En venta'));
  var addBtn=document.createElement('button');addBtn.className='btn btn-a btn-sm';addBtn.textContent='➕ Nueva función';
  addBtn.onclick=async function(){
    var iso = newDtI.value ? new Date(newDtI.value).toISOString() : null;
    if(!iso){ flash('Escribe la fecha y hora de la función.','d'); return; }
    var res = await DB.createPerformance(prod.id, {startsAt: iso, venue: newVenueI.value, onSale: newOnSaleChk.checked});
    if(!res.ok){ flash(res.error,'d'); return; }
    newDtI.value='';newVenueI.value='';newOnSaleChk.checked=false;
    flash('Función agregada.','s');
  };
  newRow.appendChild(newDtI);newRow.appendChild(newVenueI);newRow.appendChild(newLabel);newRow.appendChild(addBtn);
  perfWrap.appendChild(newRow);
  card.appendChild(perfWrap);

  return card;
}
async function createProductionFromAdmin(){
  var nombreEl=document.getElementById('newProdNombre');
  var venueEl=document.getElementById('newProdVenue');
  var fechaEl=document.getElementById('newProdFecha');
  var priceEl=document.getElementById('newProdPrice');
  var capEl=document.getElementById('newProdCapacity');
  var res = await DB.createProduction({
    nombre: nombreEl.value, venue: venueEl.value, fecha: fechaEl.value,
    price: priceEl.value, capacity: capEl.value
  });
  if(!res.ok){ flash(res.error,'d'); return; }
  nombreEl.value='';venueEl.value='';fechaEl.value='';priceEl.value='';capEl.value='';
  flash('Producción creada: '+res.id,'s');
}
function renderSalesBars(){
  var wrap = document.getElementById('salesBarsWrap');
  if(!wrap) return;
  var prods = DB.getProductions();
  if(!prods.showman || !prods.mm || !prods.hsm) return;
  var showmanApproved = DB.getApprovedCount(SHOWMAN_ID);
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
function renderStaffSeatMap(productionId){
  var map = document.getElementById('staffSeatMap-'+productionId);
  if(!map) return;
  var taken = DB.getSeatsTaken(productionId);
  var selected = Array.from(map.querySelectorAll('.staff-seat.sel')).map(function(s){return s.dataset.seat;});
  clearEl(map);
  allSeatIds().forEach(function(seatId){
    var stateClass = staffSeatStateClass(taken[seatId]);
    var isSel = selected.indexOf(seatId)>-1;
    var div=document.createElement('div');
    div.dataset.seat=seatId;
    div.textContent=seatId;
    // El staff debe poder seleccionar cualquier asiento (disponible, pendiente, comprado,
    // usado o bloqueado) para poder bloquearlo/liberarlo/generar su boleto — por eso todos
    // los estados quedan clicables, no solo disp/bloq como antes.
    div.className='staff-seat '+stateClass+(isSel?' sel':'');
    div.onclick=function(){ div.classList.toggle('sel'); };
    map.appendChild(div);
  });
}

function getSelectedStaffSeats(productionId){
  return Array.from(document.querySelectorAll('#staffSeatMap-'+productionId+' .staff-seat.sel')).map(function(s){return s.dataset.seat;});
}
function clearStaffSelection(productionId){
  // Los asientos seleccionados que están a punto de cambiar de estado (bloquear/liberar/generar)
  // deben soltar la clase "sel" ANTES del write a DB: el write dispara el rebuild síncrono de
  // renderStaffSeatMap, que toma una foto de ".sel" del mapa actual — si no la limpiamos aquí,
  // el asiento se repinta rosa (seleccionado) en vez de con su nuevo color de estado real.
  var map = document.getElementById('staffSeatMap-'+productionId);
  if(!map) return;
  Array.from(map.querySelectorAll('.staff-seat.sel')).forEach(function(el){ el.classList.remove('sel'); });
}
function blockSelectedSeats(productionId){
  var seats = getSelectedStaffSeats(productionId);
  if(!seats.length){flash('Selecciona al menos un asiento.','d');return;}
  clearStaffSelection(productionId);
  DB.blockSeats(productionId, seats);
  flash('Asientos bloqueados: '+seats.join(', '),'i');
}
function releaseSelectedSeats(productionId){
  var seats = getSelectedStaffSeats(productionId);
  if(!seats.length){flash('Selecciona al menos un asiento.','d');return;}
  clearStaffSelection(productionId);
  DB.releaseSeats(productionId, seats);
  DB.releaseSeatsFromOrders(productionId, seats);
  flash('Asientos liberados: '+seats.join(', '),'i');
}
function createStaffTicket(productionId){
  var nameEl=document.getElementById('staffBuyerName-'+productionId);
  var phoneEl=document.getElementById('staffBuyerPhone-'+productionId);
  var sellerEl=document.getElementById('staffSellerCode-'+productionId);
  var name=(nameEl.value||'').trim();
  var phone=(phoneEl.value||'').trim();
  var sellerCodeRaw=(sellerEl&&sellerEl.value||'').trim();
  if(!name){flash('Escribe el nombre del comprador.','d');return;}
  if(!phone){flash('Escribe el teléfono del comprador.','d');return;}
  var vendedorCodigo=null;
  if(sellerCodeRaw){
    var seller=DB.getSellerByCode(sellerCodeRaw);
    if(!seller){flash('El código de vendedor no existe. Verifícalo o déjalo en blanco.','d');return;}
    vendedorCodigo=seller.codigo;
  }
  var seats = getSelectedStaffSeats(productionId);
  if(!seats.length){flash('Selecciona al menos un asiento.','d');return;}
  var prod = DB.getProduction(productionId);
  clearStaffSelection(productionId);
  var order = DB.createOrder({
    userId: null, buyerNombre: name, telefono: phone, productionId: productionId,
    seats: seats, total: seats.length*prod.price, vendedorCodigo: vendedorCodigo
  });
  var approved = DB.approveOrder(order.id);
  nameEl.value='';
  phoneEl.value='';
  if(sellerEl) sellerEl.value='';
  flash('Boleto generado y aprobado para '+name+' — asientos '+seats.join(', '),'s');
  // Guardar el último lote generado en estado persistente (como staffAccExpanded/staffDbOpen):
  // si otra generación u orden dispara un nuevo rebuild completo de la tarjeta antes de que este
  // QR se termine de pintar, renderBoletajeProductions lo vuelve a pintar en vez de perderlo.
  staffLastGenerated[productionId] = approved;
  renderGeneratedTickets(productionId, approved);
}

function renderGeneratedTickets(productionId, order){
  var box=document.getElementById('staffGeneratedTickets-'+productionId);
  if(!box || !order || !order.seatQrs) return;
  clearEl(box);
  (order.seats||[]).forEach(function(seatId){
    var code = order.seatQrs[seatId];
    if(!code) return;
    var card=document.createElement('div');card.className='gen-qr-card';
    var img=document.createElement('img');img.alt='QR '+seatId;
    qrDataUrl(code, function(url){ if(url) img.src=url; });
    var name=document.createElement('div');name.className='gen-qr-name';name.textContent=order.buyerNombre||'Comprador';
    var seat=document.createElement('div');seat.className='gen-qr-seat';seat.textContent='Asiento '+seatId;
    card.appendChild(img);card.appendChild(name);card.appendChild(seat);
    box.appendChild(card);
  });
}

function renderPendingOrders(productionId){
  var box=document.getElementById('pendingOrdersList-'+productionId);
  if(!box) return;
  var pending = DB.getPendingOrdersFor(productionId);
  clearEl(box);
  if(!pending.length){
    var empty=document.createElement('div');empty.className='empty-note';empty.textContent='Sin solicitudes pendientes.';
    box.appendChild(empty);
    return;
  }
  pending.forEach(function(o){
    var prod = DB.getProduction(o.productionId)||{nombre:o.productionId};
    var card=document.createElement('div');card.className='order-card';
    var info=document.createElement('div');info.className='order-card-info';
    var title=document.createElement('div');title.className='order-card-title';title.textContent=(o.buyerNombre||o.userId||'Sin nombre')+' — '+prod.nombre;
    var meta=document.createElement('div');meta.className='order-card-meta';meta.textContent='Código: '+(o.codigoOrden||'—')+' · Asientos: '+(o.seats||[]).join(', ')+' · Total: '+money(o.total);
    info.appendChild(title);info.appendChild(meta);
    var actions=document.createElement('div');actions.className='order-card-actions';
    var approveBtn=document.createElement('button');approveBtn.className='btn btn-a btn-sm';approveBtn.textContent='Aprobar';
    approveBtn.onclick=function(){
      var approved = DB.approveOrder(o.id);
      flash('Orden aprobada.','s');
      staffLastGenerated[productionId] = approved;
      renderGeneratedTickets(productionId, approved);
    };
    var rejectBtn=document.createElement('button');rejectBtn.className='btn btn-o btn-sm';rejectBtn.textContent='Rechazar';
    rejectBtn.onclick=function(){ DB.rejectOrder(o.id); flash('Orden rechazada.','i'); };
    actions.appendChild(approveBtn);actions.appendChild(rejectBtn);
    card.appendChild(info);card.appendChild(actions);
    box.appendChild(card);
  });
}

function renderSalesControl(productionId){
  var box=document.getElementById('salesControlBoxes-'+productionId);
  if(!box) return;
  var orders = DB.getOrdersForProduction(productionId);
  var approved = orders.filter(function(o){ return o.status==='aprobado'; });
  var pending = orders.filter(function(o){ return o.status==='pendiente'; });
  var ingresos = approved.reduce(function(sum,o){ return sum+o.total; },0);
  var seatsVendidos = approved.reduce(function(sum,o){ return sum+(o.seats||[]).length; },0);
  var boxes=[
    {v:seatsVendidos, l:'Boletos vendidos'},
    {v:pending.length, l:'Solicitudes pendientes'},
    {v:money(ingresos), l:'Ingresos confirmados'}
  ];
  clearEl(box);
  boxes.forEach(function(b){
    var d=document.createElement('div');d.className='sales-control-box';
    var v=document.createElement('div');v.className='sales-control-v';v.textContent=b.v;
    var l=document.createElement('div');l.className='sales-control-l';l.textContent=b.l;
    d.appendChild(v);d.appendChild(l);box.appendChild(d);
  });
}

async function toggleShowmanOnSale(checked){
  const ok = await DB.setProductionOnSale(SHOWMAN_ID, checked);
  if(!ok){ flash('No se pudo actualizar el estado de venta.','d'); return; }
  flash(checked?'Venta de Showman activada.':'Venta de Showman desactivada.', 'i');
  // DB.setProductionOnSale ya disparó renderBoletajeProductions() vía la suscripción a productions.
}

// ─── BOLETAJE: acordeón por producción ────────────────
function toggleBoletajeAcc(productionId){
  staffAccExpanded[productionId]=!staffAccExpanded[productionId];
  renderBoletajeProductions();
}
function renderBoletajeProductions(){
  var list=document.getElementById('boletajeProdList');
  if(!list) return;
  var ids=[SHOWMAN_ID];
  clearEl(list);
  ids.forEach(function(id){
    list.appendChild(buildBoletajeProdCard(id));
  });
  ids.forEach(function(id){
    if(staffAccExpanded[id]){
      renderStaffSeatMap(id); renderPendingOrders(id); renderSalesControl(id); renderSellersTable(id);
      if(staffDbOpen[id]) renderTicketsDatabase(id);
      if(staffLastGenerated[id]) renderGeneratedTickets(id, staffLastGenerated[id]);
    }
  });
}
function buildBoletajeProdCard(productionId){
  var prod=DB.getProduction(productionId);
  if(!prod) return document.createElement('div');
  var open=!!staffAccExpanded[productionId];
  var card=document.createElement('div');
  card.className='prod-acc-card'+(open?' open':'');
  card.id='boletajeCard-'+productionId;

  var hdr=document.createElement('div');hdr.className='prod-acc-hdr';
  hdr.onclick=function(){ toggleBoletajeAcc(productionId); };
  var logo=document.createElement('img');logo.className='prod-acc-logo';logo.src=PROD_LOGOS[productionId]||'';logo.alt=prod.nombre;
  var info=document.createElement('div');info.className='prod-acc-info';
  var name=document.createElement('div');name.className='prod-acc-name';name.textContent=prod.nombre;
  var meta=document.createElement('div');meta.className='prod-acc-meta';meta.textContent=(prod.fecha||'—')+' · '+(prod.venue||'—');
  info.appendChild(name);info.appendChild(meta);

  var soldSeats=DB.getOrdersForProduction(productionId).filter(function(o){return o.status==='aprobado';}).reduce(function(s,o){return s+(o.seats||[]).length;},0);
  var totalSeats=allSeatIds().length;
  var availableSeats=totalSeats-soldSeats;
  var stats=document.createElement('div');stats.className='prod-acc-stats';
  [{v:totalSeats, l:'Boletos totales'},{v:soldSeats, l:'Boletos vendidos'},{v:availableSeats, l:'Boletos disponibles'}].forEach(function(s){
    var st=document.createElement('div');st.className='prod-acc-stat';
    var v=document.createElement('div');v.className='prod-acc-stat-v';v.textContent=s.v;
    var l=document.createElement('div');l.className='prod-acc-stat-l';l.textContent=s.l;
    st.appendChild(v);st.appendChild(l);stats.appendChild(st);
  });
  var chev=document.createElement('div');chev.className='prod-acc-chevron';chev.textContent='▾';
  hdr.appendChild(logo);hdr.appendChild(info);hdr.appendChild(stats);hdr.appendChild(chev);

  var body=document.createElement('div');body.className='prod-acc-body';

  var mapTitle=document.createElement('div');mapTitle.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;color:var(--t2)';mapTitle.textContent='Mapa de Asientos en Vivo';
  var map=document.createElement('div');map.className='staff-seatmap';map.id='staffSeatMap-'+productionId;
  var legend=document.createElement('div');legend.className='seat-legend';legend.style.marginTop='10px';
  [['background:#1565C0','Disponible'],['background:#EC4899','Seleccionado'],['background:#E5445A','Comprado/Ocupado'],['background:#22c55e','Usado'],['background:#7a7a7a','Bloqueado'],['background:#D4A017','Pendiente']].forEach(function(pair){
    var item=document.createElement('span');item.className='legend-item';
    var sq=document.createElement('span');sq.className='legend-seat';sq.style.cssText=pair[0];
    item.appendChild(sq);item.appendChild(document.createTextNode(pair[1]));
    legend.appendChild(item);
  });

  if(productionId===SHOWMAN_ID){
    var toggleWrap=document.createElement('div');toggleWrap.style.cssText='margin-top:16px;padding-top:16px;border-top:1px solid #252525;display:flex;align-items:center;gap:10px';
    var label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--t2)';
    var chk=document.createElement('input');chk.type='checkbox';chk.checked=!!prod.onSale;
    chk.onchange=function(){ toggleShowmanOnSale(chk.checked); };
    label.appendChild(chk);label.appendChild(document.createTextNode('Activar venta de boletos de Showman'));
    toggleWrap.appendChild(label);
    body.appendChild(toggleWrap);
  }

  var genWrap=document.createElement('div');genWrap.style.cssText='margin-top:20px;padding-top:16px;border-top:1px solid #252525';
  var genTitle=document.createElement('div');genTitle.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;color:var(--t2)';genTitle.textContent='Acciones sobre Asientos Seleccionados';
  var genRow=document.createElement('div');genRow.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center';
  var nameInput=document.createElement('input');nameInput.type='text';nameInput.id='staffBuyerName-'+productionId;nameInput.className='form-c';nameInput.placeholder='Nombre del comprador (para generar boleto)';nameInput.style.cssText='flex:1;min-width:200px';
  var phoneInput=document.createElement('input');phoneInput.type='tel';phoneInput.id='staffBuyerPhone-'+productionId;phoneInput.className='form-c';phoneInput.placeholder='Teléfono del comprador';phoneInput.style.cssText='flex:1;min-width:160px';
  var sellerInput=document.createElement('input');sellerInput.type='text';sellerInput.id='staffSellerCode-'+productionId;sellerInput.className='form-c';sellerInput.placeholder='Código de vendedor (opcional)';sellerInput.style.cssText='flex:1;min-width:160px';
  var blockBtn=document.createElement('button');blockBtn.className='btn btn-o btn-sm';blockBtn.textContent='🔒 Bloquear';
  blockBtn.onclick=function(){ blockSelectedSeats(productionId); };
  var genBtn=document.createElement('button');genBtn.className='btn btn-a btn-sm';genBtn.textContent='Generar Boleto';
  genBtn.onclick=function(){ createStaffTicket(productionId); };
  var releaseBtn=document.createElement('button');releaseBtn.className='btn btn-o btn-sm';releaseBtn.textContent='🔓 Liberar';
  releaseBtn.onclick=function(){ releaseSelectedSeats(productionId); };
  genRow.appendChild(nameInput);genRow.appendChild(phoneInput);genRow.appendChild(sellerInput);genRow.appendChild(blockBtn);genRow.appendChild(genBtn);genRow.appendChild(releaseBtn);
  var genHint=document.createElement('div');genHint.style.cssText='font-size:12px;color:var(--t3);margin-top:8px';genHint.textContent='Selecciona asientos en el mapa de arriba: Bloquear los aparta sin vender, Generar Boleto los vende (requiere nombre), Liberar quita un bloqueo.';
  var genTickets=document.createElement('div');genTickets.className='gen-qr-grid';genTickets.id='staffGeneratedTickets-'+productionId;
  genWrap.appendChild(genTitle);genWrap.appendChild(genRow);genWrap.appendChild(genHint);genWrap.appendChild(genTickets);

  var pendWrap=document.createElement('div');pendWrap.style.cssText='margin-top:20px;padding-top:16px;border-top:1px solid #252525';
  var pendTitle=document.createElement('div');pendTitle.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;color:var(--t2)';pendTitle.textContent='Solicitudes Pendientes';
  var pendList=document.createElement('div');pendList.id='pendingOrdersList-'+productionId;
  pendWrap.appendChild(pendTitle);pendWrap.appendChild(pendList);

  var ctrlWrap=document.createElement('div');ctrlWrap.style.cssText='margin-top:20px;padding-top:16px;border-top:1px solid #252525';
  var ctrlTitle=document.createElement('div');ctrlTitle.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;color:var(--t2)';ctrlTitle.textContent='Control de Ventas';
  var ctrlBoxes=document.createElement('div');ctrlBoxes.className='sales-control-grid';ctrlBoxes.id='salesControlBoxes-'+productionId;
  ctrlWrap.appendChild(ctrlTitle);ctrlWrap.appendChild(ctrlBoxes);

  var dbWrap=document.createElement('div');dbWrap.style.cssText='margin-top:20px;padding-top:16px;border-top:1px solid #252525';
  var dbBtn=document.createElement('button');dbBtn.className='btn btn-o btn-sm';dbBtn.textContent='📋 Ver base de datos de boletos';
  dbBtn.onclick=function(){ staffDbOpen[productionId]=!staffDbOpen[productionId]; if(staffDbOpen[productionId]) renderTicketsDatabase(productionId); var t=document.getElementById('ticketsDb-'+productionId); if(t) t.style.display=staffDbOpen[productionId]?'block':'none'; };
  var dbTable=document.createElement('div');dbTable.id='ticketsDb-'+productionId;dbTable.style.cssText='margin-top:14px;display:'+(staffDbOpen[productionId]?'block':'none');
  dbWrap.appendChild(dbBtn);dbWrap.appendChild(dbTable);

  var sellWrap=document.createElement('div');sellWrap.style.cssText='margin-top:20px;padding-top:16px;border-top:1px solid #252525';
  var sellTitle=document.createElement('div');sellTitle.style.cssText='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;color:var(--t2)';sellTitle.textContent='Vendedores / Códigos de Registro';
  var sellForm=document.createElement('div');sellForm.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center';
  var sellNameInput=document.createElement('input');sellNameInput.type='text';sellNameInput.id='sellerName-'+productionId;sellNameInput.className='form-c';sellNameInput.placeholder='Nombre del vendedor';sellNameInput.style.cssText='flex:1;min-width:180px';
  var sellCodeInput=document.createElement('input');sellCodeInput.type='text';sellCodeInput.id='sellerCode-'+productionId;sellCodeInput.className='form-c';sellCodeInput.placeholder='Código de registro';sellCodeInput.style.cssText='flex:1;min-width:140px';
  var sellAddBtn=document.createElement('button');sellAddBtn.className='btn btn-a btn-sm';sellAddBtn.textContent='➕ Agregar';
  sellAddBtn.onclick=function(){ addSellerFromStaff(productionId); };
  sellForm.appendChild(sellNameInput);sellForm.appendChild(sellCodeInput);sellForm.appendChild(sellAddBtn);
  var sellTable=document.createElement('div');sellTable.id='sellersTable-'+productionId;sellTable.style.cssText='margin-top:14px';
  sellWrap.appendChild(sellTitle);sellWrap.appendChild(sellForm);sellWrap.appendChild(sellTable);

  body.appendChild(mapTitle);body.appendChild(map);body.appendChild(legend);
  body.appendChild(genWrap);body.appendChild(pendWrap);body.appendChild(ctrlWrap);body.appendChild(dbWrap);body.appendChild(sellWrap);

  card.appendChild(hdr);card.appendChild(body);
  return card;
}
DB.subscribe(DB.KEYS.orders, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderBoletajeProductions(); });
DB.subscribe(DB.KEYS.productions, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderBoletajeProductions(); });
DB.subscribe(DB.KEYS.blocked, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderBoletajeProductions(); });
DB.subscribe(DB.KEYS.blocked, function(){ if(document.getElementById('v-checkout').classList.contains('active')) renderCheckout(); });

function renderTicketsDatabase(productionId){
  var box=document.getElementById('ticketsDb-'+productionId);
  if(!box) return;
  clearEl(box);
  var orders = DB.getOrdersForProduction(productionId).filter(function(o){ return o.status==='aprobado'; });
  var rows=[];
  orders.forEach(function(o){
    var seller = o.vendedorCodigo ? DB.getSellerByCode(o.vendedorCodigo) : null;
    var vendidoPor = seller ? seller.nombre : 'NA';
    (o.seats||[]).forEach(function(seatId){
      var code = (o.seatQrs && o.seatQrs[seatId]) || o.qrCode || '—';
      var usado = o.checkedInSeats && o.checkedInSeats[seatId];
      rows.push({code:code, ordenCodigo:o.codigoOrden||'—', nombre:o.buyerNombre||'—', cuenta:o.userId||'Taquilla', tel:o.telefono||'—', seat:seatId, estado:usado?'Usado':'Vigente', vendidoPor:vendidoPor, order:o, productionId:productionId});
    });
  });
  if(!rows.length){
    var empty=document.createElement('div');empty.className='empty-note';empty.textContent='Sin boletos aprobados todavía.';
    box.appendChild(empty);
    return;
  }
  var table=document.createElement('table');table.className='tickets-db-table';
  var thead=document.createElement('thead');
  var trh=document.createElement('tr');
  ['Código de orden','Código QR','Comprador','Cuenta','Teléfono','Asiento','Estado','Vendido por','Acceso'].forEach(function(h){ var th=document.createElement('th');th.textContent=h;trh.appendChild(th); });
  thead.appendChild(trh);
  var tbody=document.createElement('tbody');
  rows.forEach(function(r){
    var tr=document.createElement('tr');
    [r.ordenCodigo, r.code.slice(0,10).toUpperCase(), r.nombre, r.cuenta, r.tel, r.seat, r.estado, r.vendidoPor].forEach(function(v){
      var td=document.createElement('td');td.textContent=v;tr.appendChild(td);
    });
    var tdBtn=document.createElement('td');
    var accBtn=document.createElement('button');accBtn.className='btn btn-o btn-sm';accBtn.textContent='Ver boleto';
    accBtn.onclick=function(){ showAccessModal(r.productionId, r.order, r.seat, r.code); };
    tdBtn.appendChild(accBtn);tr.appendChild(tdBtn);
    tbody.appendChild(tr);
  });
  table.appendChild(thead);table.appendChild(tbody);
  box.appendChild(table);
}

async function addSellerFromStaff(productionId){
  var nameEl=document.getElementById('sellerName-'+productionId);
  var codeEl=document.getElementById('sellerCode-'+productionId);
  var res = await DB.addSeller(nameEl.value, codeEl.value);
  if(!res.ok){ flash(res.error,'d'); return; }
  nameEl.value='';
  codeEl.value='';
  flash('Vendedor agregado: '+res.seller.nombre+' ('+res.seller.codigo+')','s');
  renderSellersTable(productionId);
}
function renderSellersTable(productionId){
  var box=document.getElementById('sellersTable-'+productionId);
  if(!box) return;
  clearEl(box);
  var sellers = DB.getSellers();
  if(!sellers.length){
    var empty=document.createElement('div');empty.className='empty-note';empty.textContent='Todavía no hay vendedores registrados.';
    box.appendChild(empty);
    return;
  }
  // "Boletos vendidos" solo cuenta asientos de órdenes aprobadas de esta producción,
  // por decisión de Johann (evita que solicitudes pendientes/rechazadas infle el conteo.
  var approved = DB.getOrdersForProduction(productionId).filter(function(o){ return o.status==='aprobado'; });
  var table=document.createElement('table');table.className='tickets-db-table';
  var thead=document.createElement('thead');
  var trh=document.createElement('tr');
  ['Vendedor','Código','Boletos vendidos'].forEach(function(h){ var th=document.createElement('th');th.textContent=h;trh.appendChild(th); });
  thead.appendChild(trh);
  var tbody=document.createElement('tbody');
  sellers.forEach(function(s){
    var count=0;
    approved.forEach(function(o){ if(o.vendedorCodigo===s.codigo) count += (o.seats||[]).length; });
    var tr=document.createElement('tr');
    [s.nombre, s.codigo, count].forEach(function(v){
      var td=document.createElement('td');td.textContent=v;tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(thead);table.appendChild(tbody);
  box.appendChild(table);
}
DB.subscribe(DB.KEYS.sellers, function(){ if(document.getElementById('v-staff').classList.contains('active')) renderBoletajeProductions(); });

function closeAccessModal(){
  var m=document.getElementById('accessModal');
  if(m) m.remove();
}
function showAccessModal(productionId, order, seat, code){
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
  detail.textContent=(prod.fecha||'—')+' · '+(prod.venue||'—')+' · '+(prod.hora||'—')+' · Asiento '+seat;
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
    {fps:10, qrbox:200},
    function(decodedText){ handleQrResult(decodedText); },
    function(){ /* frame sin QR, ignorar */ }
  ).catch(function(err){
    flash('No se pudo acceder a la cámara: '+err+'. Usa la validación manual.','d');
    qrScannerInstance=null;
  });
}
function stopQrScanner(){
  if(qrScannerInstance){
    qrScannerInstance.stop().then(function(){ qrScannerInstance.clear(); qrScannerInstance=null; }).catch(function(){ qrScannerInstance=null; });
  }
}
function manualCheckIn(){
  var input=document.getElementById('qrManualInput');
  var code=(input.value||'').trim();
  if(!code){flash('Escribe o pega el código del boleto.','d');return;}
  handleQrResult(code);
  input.value='';
}
function handleQrResult(code){
  var res = DB.checkInByQr(code);
  var f=document.getElementById('qrFrameText');
  if(res.ok){
    var nombre=res.order.buyerNombre||res.order.userId||'Comprador';
    var seatTxt=res.seat?('Asiento '+res.seat):('Asientos '+(res.order.seats||[]).join(', '));
    flash('✅ ACCESO — '+nombre+' · '+seatTxt,'s');
    if(f){clearEl(f);
      var l1=document.createElement('div');l1.textContent='✅ '+nombre;
      var l2=document.createElement('div');l2.textContent=seatTxt;
      f.appendChild(l1);f.appendChild(l2);
    }
  } else if(res.reason==='ya-usado'){
    flash('⚠️ Este boleto ya fue utilizado.'+(res.seat?(' (Asiento '+res.seat+')'):''),'d');
    if(f)f.textContent='⚠️ Ya utilizado';
  } else if(res.reason==='no-aprobado'){
    flash('❌ Este boleto no está aprobado.','d');
    if(f)f.textContent='❌ No aprobado';
  } else {
    flash('❌ Código no reconocido.','d');
    if(f)f.textContent='❌ No reconocido';
  }
  if(res.order){
    var pid=res.order.productionId;
    renderSalesControl(pid);
    if(staffDbOpen[pid]) renderTicketsDatabase(pid);
    if(staffAccExpanded[pid]){ clearStaffSelection(pid); renderStaffSeatMap(pid); }
  }
  setTimeout(function(){ if(f)f.textContent='Esperando código QR...'; },3000);
}
function simulateQrScan(){
  var orders = DB.getOrders().filter(function(o){ return o.status==='aprobado'; });
  var code=null;
  orders.some(function(o){
    var checked=o.checkedInSeats||{};
    if(o.seatQrs){
      return Object.keys(o.seatQrs).some(function(s){
        if(!checked[s]){ code=o.seatQrs[s]; return true; }
        return false;
      });
    }
    if(!o.checkedIn){ code=o.qrCode; return true; }
    return false;
  });
  if(!code){flash('No hay boletos aprobados sin usar para simular.','i');return;}
  handleQrResult(code);
}

// ─── URL DIRECTA ──────────────────────────────────────
AuthService.restoreSession();
(function(){var p=new URLSearchParams(window.location.search).get('v');if(p&&VIEWS_MAP[p])nav(p);})();
window.addEventListener('popstate', function(){
  var p=new URLSearchParams(window.location.search).get('v');
  nav((p&&VIEWS_MAP[p])?p:'home', true);
});
