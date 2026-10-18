/* admin.js — Client Desk de administración (todo el DOM se construye con nodos de texto) */
(() => {
  'use strict';
  const { sb, $, h, toast, safeHttp, info, onUser } = App;

  let all = [], filter = 'todos', search = '', curId = null, apps = [], bootId = null, channel = null, wired = false;
  const mq = matchMedia('(max-width: 900px)');
  const desk = () => $('#dash');
  const modal = () => $('#modal');

  /* Foto de cliente: solo https y hostname terminado en .googleusercontent.com */
  const avatarUrl = u => {
    const s = safeHttp(u);
    if (!s) return '';
    try { return new URL(s).hostname.endsWith('.googleusercontent.com') ? s : ''; } catch { return ''; }
  };
  const avatarEl = (foto, nombre) => {
    const u = avatarUrl(foto);
    return u
      ? h('img', { class: 'ava', src: u, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
      : h('div', { class: 'ava-fb', text: (nombre || '?').charAt(0).toUpperCase() });
  };

  const fmt = iso => {
    if (!iso) return '—';
    const d = new Date(iso), diff = Math.floor((Date.now() - d) / 60000);
    if (diff < 1) return 'ahora';
    if (diff < 60) return `hace ${diff} min`;
    if (diff < 1440) return `hace ${Math.floor(diff / 60)} h`;
    return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' });
  };
  const fmtFull = iso => iso
    ? new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const EMAP = {
    pendiente: { cls: 'eb-pendiente', txt: '⏳ Pendiente' },
    proceso: { cls: 'eb-proceso', txt: '⚙️ En proceso' },
    completado: { cls: 'eb-completado', txt: '✅ Completado' }
  };
  const badge = e => { const x = EMAP[e] || EMAP.pendiente; return h('span', { class: `estado-badge ${x.cls}`, text: x.txt }); };

  /* ── datos ── */
  async function loadMsgs() {
    const { data, error } = await sb.from('mensajes').select('*').order('created_at', { ascending: false });
    if (error) {
      toast('No se pudieron cargar las solicitudes', 'err');
      $('#cardGrid').replaceChildren(h('div', { class: 'empty-list', text: 'No se pudieron cargar las solicitudes.' }));
      return;
    }
    all = data || [];
    render();
  }

  /* Serie de solicitudes por semana (8 semanas) */
  const weekStart = d => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - day); return x; };
  function series(n) {
    const cur = weekStart(new Date()), arr = [];
    for (let i = n - 1; i >= 0; i--) { const s = new Date(cur); s.setDate(s.getDate() - 7 * i); arr.push({ start: s, count: 0 }); }
    const idx = new Map(arr.map((w, i) => [w.start.getTime(), i]));
    for (const m of all) {
      if (!m.created_at) continue;
      const k = weekStart(new Date(m.created_at)).getTime();
      if (idx.has(k)) arr[idx.get(k)].count++;
    }
    return arr;
  }

  function renderKpis() {
    const total = all.length;
    const unread = all.filter(m => !m.leido).length;
    const proceso = all.filter(m => m.estado === 'proceso').length;
    const comp = all.filter(m => m.estado === 'completado').length;
    $('#sTotal').textContent = total; $('#sSinLeer').textContent = unread;
    $('#sProceso').textContent = proceso; $('#sCompletado').textContent = comp;

    const w = series(8), last = w[w.length - 1].count, prev = w[w.length - 2].count, diff = last - prev;
    const t = $('#cTotal');
    t.className = 'kpi-chip' + (diff > 0 ? ' up' : diff < 0 ? ' down' : '');
    t.textContent = diff > 0 ? `▲ +${diff} esta semana` : diff < 0 ? `▼ ${diff} esta semana` : '＝ sin cambios';
    $('#cSinLeer').textContent = total ? `${Math.round(unread / total * 100)}% del total` : '—';
    $('#cProceso').textContent = `${proceso} en curso`;
    const c = $('#cCompletado');
    c.className = 'kpi-chip' + (comp ? ' up' : '');
    c.textContent = total ? `${Math.round(comp / total * 100)}% del total` : '—';
  }

  const pad = n => String(n).padStart(2, '0');
  function renderChart() {
    const el = $('#chart'); if (!el) return;
    const w = series(8), max = Math.max(1, ...w.map(x => x.count));
    el.replaceChildren(...w.map((x, i) => {
      const bar = h('div', { class: 'chart-bar' });
      bar.style.setProperty('--h', String(Math.round(x.count / max * 100)));
      bar.title = `${x.count} solicitud${x.count === 1 ? '' : 'es'}`;
      return h('div', { class: 'chart-col' + (i === w.length - 1 ? ' now' : '') },
        h('div', { class: 'chart-track' }, bar),
        h('div', { class: 'chart-x', text: `${pad(x.start.getDate())}/${pad(x.start.getMonth() + 1)}` }));
    }));
    $('#chartSub').textContent = `Total: ${w.reduce((a, b) => a + b.count, 0)} en 8 semanas`;
  }

  const filtered = () => all.filter(m => {
    const okF = filter === 'todos'
      || (filter === 'no_leidos' && !m.leido)
      || (filter === 'pendiente' && (m.estado || 'pendiente') === 'pendiente')
      || (filter === 'proceso' && m.estado === 'proceso')
      || (filter === 'completado' && m.estado === 'completado');
    const q = search.toLowerCase();
    const okS = !q || (m.nombre && m.nombre.toLowerCase().includes(q)) || (m.email && m.email.toLowerCase().includes(q));
    return okF && okS;
  });

  function render() {
    renderKpis(); renderChart();
    const list = $('#cardGrid'), msgs = filtered();
    if (!msgs.length) { list.replaceChildren(h('div', { class: 'empty-list', text: 'No hay solicitudes que coincidan.' })); return; }
    list.replaceChildren(...msgs.map(buildReq));
  }

  function buildReq(m) {
    const el = h('button', { type: 'button', class: 'req' + (m.leido ? '' : ' unread') + (m.id === curId ? ' sel' : '') },
      h('div', { class: 'req-top' }, avatarEl(m.foto, m.nombre),
        h('div', { class: 'req-info' },
          h('div', { class: 'req-name', text: m.nombre || 'Sin nombre' }),
          h('div', { class: 'req-mail', text: m.email || '—' }))),
      h('div', { class: 'req-srv', text: '📋 ' + (m.servicio || 'Sin servicio') }),
      h('div', { class: 'req-prev', text: m.mensaje || 'Sin mensaje' }),
      h('div', { class: 'req-foot' }, badge(m.estado || 'pendiente'), h('span', { class: 'req-time', text: fmt(m.created_at) })));
    el.addEventListener('click', () => selectReq(m.id));
    return el;
  }

  /* ── detalle ── */
  function ebtn(cls, icon, label, val, active) {
    return h('button', { type: 'button', class: 'ebtn ' + cls + (active ? ' active' : ''), onclick: () => setEstado(val) },
      h('span', { class: 'ebtn-icon', text: icon }), label);
  }

  function buildDetail(m) {
    const head = h('div', { class: 'detail-head' }, avatarEl(m.foto, m.nombre),
      h('div', { class: 'dh-info' },
        h('div', { class: 'detail-name', text: m.nombre || 'Sin nombre' }),
        h('div', { class: 'detail-mail', text: m.email || '—' }),
        h('div', { class: 'detail-date', text: fmtFull(m.created_at) })),
      h('button', { type: 'button', class: 'detail-x', 'aria-label': 'Cerrar detalle', title: 'Cerrar', text: '✕', onclick: closeDetail }));

    const grid = h('div', { class: 'd-grid2' },
      h('div', { class: 'd-fld' }, h('span', { class: 'd-lab', text: 'Servicio' }), h('div', { class: 'd-val', text: m.servicio || '—' })),
      h('div', { class: 'd-fld' }, h('span', { class: 'd-lab', text: 'WhatsApp' }), h('div', { class: 'd-val', text: m.telefono || '—' })));

    const cuerpo = h('div', { class: 'd-fld' }, h('span', { class: 'd-lab', text: 'Mensaje del cliente' }),
      h('div', { class: 'd-msg', text: m.mensaje || 'Sin mensaje' }));

    const e = m.estado || 'pendiente';
    const estado = h('div', { class: 'd-fld' }, h('span', { class: 'd-lab', text: 'Estado del proyecto' }),
      h('div', { class: 'estado-sel' },
        ebtn('ebtn-pendiente', '⏳', 'Pendiente', 'pendiente', e === 'pendiente'),
        ebtn('ebtn-proceso', '⚙️', 'En proceso', 'proceso', e === 'proceso'),
        ebtn('ebtn-completado', '✅', 'Completado', 'completado', e === 'completado')));

    const acts = h('div', { class: 'detail-acts' },
      h('button', { type: 'button', class: 'mbtn mbtn-read', text: m.leido ? '↩ Marcar sin leer' : '✓ Marcar leído', onclick: () => patch(m.id, { leido: !m.leido }) }),
      h('button', { type: 'button', class: 'mbtn mbtn-del', text: '🗑 Eliminar', onclick: del }));

    return h('div', {}, head, grid, cuerpo, estado, renderReply(m), acts);
  }

  function refreshDetail() {
    const m = all.find(x => x.id === curId);
    const inline = $('#detailPanel'), empty = $('#detailEmpty'), body = $('#modalBody');
    if (!m) {
      inline.hidden = true; inline.replaceChildren();
      if (empty) empty.hidden = false;
      if (body) body.replaceChildren();
      if (modal().open) modal().close();
      return;
    }
    const el = buildDetail(m);
    if (mq.matches) { if (body) body.replaceChildren(el); }
    else { inline.replaceChildren(el); inline.hidden = false; if (empty) empty.hidden = true; }
  }

  async function selectReq(id) {
    curId = id;
    render();
    refreshDetail();
    if (mq.matches && !modal().open) modal().showModal();
    const m = all.find(x => x.id === id);
    if (m && !m.leido) await patch(id, { leido: true }, false);
  }

  function closeDetail() {
    if (modal().open) modal().close();
    curId = null;
    render(); refreshDetail();
  }

  async function patch(id, data, showT = true) {
    const { error } = await sb.from('mensajes').update(data).eq('id', id);
    if (error) { toast('No se pudo guardar', 'err'); return; }
    const i = all.findIndex(m => m.id === id);
    if (i >= 0) all[i] = { ...all[i], ...data };
    render(); refreshDetail();
    if (showT) toast('Guardado');
  }

  async function setEstado(e) {
    if (curId == null) return;
    await patch(curId, { estado: e });
    toast('Estado: ' + { pendiente: '⏳ Pendiente', proceso: '⚙️ En proceso', completado: '✅ Completado' }[e]);
  }

  async function del() {
    const m = all.find(x => x.id === curId);
    if (!m || !confirm('¿Eliminar esta solicitud?')) return;
    const { error } = await sb.from('mensajes').delete().eq('id', m.id);
    if (error) { toast('No se pudo eliminar', 'err'); return; }
    all = all.filter(x => x.id !== m.id);
    curId = null;
    if (modal().open) modal().close();
    render(); refreshDetail(); toast('Eliminado');
  }

  /* ── respuestas (idioma por prefijo telefónico) ── */
  const IDIOMAS = {
    '+57': 'ES', '+52': 'ES', '+54': 'ES', '+56': 'ES', '+51': 'ES', '+58': 'ES', '+593': 'ES',
    '+591': 'ES', '+595': 'ES', '+598': 'ES', '+507': 'ES', '+506': 'ES', '+502': 'ES',
    '+503': 'ES', '+504': 'ES', '+505': 'ES', '+1809': 'ES', '+34': 'ES',
    '+1': 'EN', '+44': 'EN', '+61': 'EN', '+91': 'EN', '+971': 'EN', '+81': 'EN', '+82': 'EN', '+86': 'EN',
    '+55': 'PT', '+351': 'PT',
    '+33': 'FR', '+49': 'DE', '+39': 'IT', '+31': 'NL'
  };

  function detectLang(tel) {
    if (!tel) return 'ES';
    const codes = Object.keys(IDIOMAS).sort((a, b) => b.length - a.length);
    for (const c of codes) { if (tel.startsWith(c)) return IDIOMAS[c]; }
    return 'EN';
  }

  function buildMsg(lang, n, s) {
    const asesoria = s === 'No sé, necesito asesoría';
    const msgs = {
      ES: {
        wa: asesoria
          ? `¡Hola ${n}! 👋 Soy Oscar de *DevPro Solutions* y me alegra mucho que hayas dado este paso. 😊\n\nEntiendo perfectamente que a veces no se sabe exactamente qué se necesita — ¡para eso estoy yo! Cuéntame sobre tu negocio, tu idea o el problema que quieres resolver, y juntos encontraremos la solución perfecta para ti.\n\n¡Tu proyecto me importa y con gusto te guío en todo el camino! 💜🚀`
          : `¡Hola ${n}! 👋 Soy Oscar de *DevPro Solutions* y me alegra que hayas confiado en nosotros. 😊\n\nYa revisé tu solicitud de *${s}* y estoy listo para ayudarte a hacerlo realidad. Cuéntame más detalles sobre tu proyecto para poder darte la mejor propuesta a tu medida.\n\n¡Vamos a construir algo increíble juntos! 🚀✨`,
        email: asesoria
          ? `¡Hola ${n}!\n\nSoy Oscar de DevPro Solutions. Me alegra que hayas dado este paso. Entiendo que a veces no se sabe exactamente qué se necesita — para eso estoy yo. Cuéntame sobre tu negocio o idea y juntos encontramos la mejor solución.\n\n¡Con gusto te guío!`
          : `¡Hola ${n}!\n\nSoy Oscar de DevPro Solutions. Recibí tu solicitud de ${s} y estoy listo para ayudarte. Cuéntame más detalles de tu proyecto.\n\n¡Vamos a hacerlo realidad!`
      },
      EN: {
        wa: asesoria
          ? `Hey ${n}! 👋 This is Oscar from *DevPro Solutions* and I'm glad you reached out! 😊\n\nNot knowing exactly what you need is totally fine — that's what I'm here for! Tell me about your business or idea and together we'll find the perfect solution.\n\nYour project matters to me! 💜🚀`
          : `Hey ${n}! 👋 This is Oscar from *DevPro Solutions* and I'm glad you reached out! 😊\n\nI've reviewed your request for *${s}* and I'm ready to help make it happen! Tell me more about your project so I can put together the best proposal for you.\n\nLet's build something amazing! 🚀✨`,
        email: asesoria
          ? `Hey ${n}!\n\nThis is Oscar from DevPro Solutions. Not knowing what you need is totally fine — I'm here to help! Tell me about your business and we'll figure it out together.`
          : `Hey ${n}!\n\nThis is Oscar from DevPro Solutions. I received your request for ${s} and I'm ready to help. Tell me more about your project!`
      },
      PT: {
        wa: asesoria
          ? `Olá ${n}! 👋 Sou Oscar da *DevPro Solutions* e fico feliz que tenha dado esse passo! 😊\n\nNão saber exatamente o que precisa é completamente normal — estou aqui para isso! Me conte sobre o seu negócio ou ideia e juntos encontramos a solução perfeita.\n\nSeu projeto é importante para mim! 💜🚀`
          : `Olá ${n}! 👋 Sou Oscar da *DevPro Solutions* e fico feliz pela sua confiança! 😊\n\nJá analisei seu pedido de *${s}* e estou pronto para ajudar. Me conte mais detalhes do seu projeto!\n\nVamos construir algo incrível! 🚀✨`,
        email: asesoria
          ? `Olá ${n}!\n\nSou Oscar da DevPro Solutions. Não saber o que precisa é normal — estou aqui para isso! Me conte sobre o seu negócio.`
          : `Olá ${n}!\n\nSou Oscar da DevPro Solutions. Recebi seu pedido de ${s} e estou pronto para ajudar!`
      },
      FR: {
        wa: asesoria
          ? `Bonjour ${n} ! 👋 Je suis Oscar de *DevPro Solutions* et je suis ravi que vous ayez fait ce pas ! 😊\n\nNe pas savoir exactement ce dont vous avez besoin est tout à fait normal — c'est pour ça que je suis là ! Parlez-moi de votre projet.\n\nVotre projet m'importe ! 💜🚀`
          : `Bonjour ${n} ! 👋 Je suis Oscar de *DevPro Solutions* et je vous remercie de votre confiance ! 😊\n\nJ'ai reçu votre demande pour *${s}* et je suis prêt à vous aider. Donnez-moi plus de détails !\n\nConstruisons quelque chose d'incroyable ! 🚀✨`,
        email: asesoria
          ? `Bonjour ${n} !\n\nJe suis Oscar de DevPro Solutions. Ne pas savoir ce dont vous avez besoin est normal. Parlez-moi de votre projet !`
          : `Bonjour ${n} !\n\nJe suis Oscar de DevPro Solutions. J'ai reçu votre demande pour ${s}. Donnez-moi plus de détails !`
      },
      DE: {
        wa: asesoria
          ? `Hallo ${n}! 👋 Ich bin Oscar von *DevPro Solutions* und freue mich, dass Sie diesen Schritt gemacht haben! 😊\n\nNicht zu wissen, was Sie brauchen, ist völlig normal — dafür bin ich da! Erzählen Sie mir von Ihrem Projekt.\n\nIhr Projekt liegt mir am Herzen! 💜🚀`
          : `Hallo ${n}! 👋 Ich bin Oscar von *DevPro Solutions* und danke für Ihr Vertrauen! 😊\n\nIch habe Ihre Anfrage für *${s}* erhalten und bin bereit zu helfen. Erzählen Sie mir mehr!\n\nLassen Sie uns etwas Großartiges bauen! 🚀✨`,
        email: asesoria
          ? `Hallo ${n}!\n\nIch bin Oscar von DevPro Solutions. Nicht zu wissen, was Sie brauchen, ist normal. Erzählen Sie mir von Ihrem Projekt!`
          : `Hallo ${n}!\n\nIch bin Oscar von DevPro Solutions. Ich habe Ihre Anfrage für ${s} erhalten. Erzählen Sie mir mehr!`
      }
    };
    return msgs[lang] || msgs.ES;
  }

  function renderReply(m) {
    const n = m.nombre || 'cliente', s = m.servicio || 'tu proyecto';
    const lang = detectLang(m.telefono || '');
    const msg = buildMsg(lang, n, s);
    const kids = [h('div', { class: 'lang-tag' }, 'Idioma detectado: ', h('strong', { text: lang }))];

    const digits = (m.telefono || '').replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) {
      const wa = h('a', {
        class: 'btn-wa', target: '_blank', rel: 'noopener noreferrer',
        href: `https://wa.me/${digits}?text=${encodeURIComponent(msg.wa)}`
      }, 'WhatsApp (' + lang + ')');
      wa.addEventListener('click', () => patch(m.id, { respondido: true }, false));
      kids.push(wa);
    } else {
      kids.push(h('p', { class: 'reply-none', text: 'Sin número de WhatsApp válido registrado' }));
    }

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email || '')) {
      const em = h('a', {
        class: 'btn-email',
        href: `mailto:${m.email}?subject=${encodeURIComponent('Re: Tu solicitud — DevPro Solutions')}&body=${encodeURIComponent(msg.email)}`
      }, '✉️ Email (' + lang + ')');
      em.addEventListener('click', () => patch(m.id, { respondido: true }, false));
      kids.push(em);
    }
    return h('div', { class: 'reply-section' }, h('div', { class: 'reply-label', text: 'Responder al cliente' }), kids);
  }

  /* ── configuración ── */
  async function loadYear() {
    const { data } = await sb.from('configuracion').select('valor').eq('clave', 'footer_año').maybeSingle();
    if (data && data.valor) $('#inputYear').value = data.valor;
  }
  async function saveYear() {
    const val = $('#inputYear').value.trim();
    if (!val || isNaN(val)) { toast('Año inválido', 'err'); return; }
    const { error } = await sb.from('configuracion').update({ valor: val }).eq('clave', 'footer_año');
    if (error) { toast('No se pudo guardar el año', 'err'); return; }
    toast('Año actualizado a ' + val);
  }
  async function loadDisp() {
    const { data } = await sb.from('configuracion').select('valor').eq('clave', 'disponible').maybeSingle();
    const d = data ? data.valor === 'true' : false;
    $('#toggleDisponible').checked = d;
    statusDisp(d);
  }
  function statusDisp(d) {
    const s = $('#toggleStatusText');
    s.className = 'toggle-status ' + (d ? 'on' : 'off');
    s.textContent = d ? '🟢 Disponible' : '⭕ No disponible';
  }
  async function saveDisp(checked) {
    statusDisp(checked);
    await sb.from('configuracion').update({ valor: checked ? 'true' : 'false' }).eq('clave', 'disponible');
    toast(checked ? '🟢 Apareces como disponible' : '⭕ No disponible');
  }

  /* ── mini apps ── */
  async function loadApps() {
    const { data } = await sb.from('apps').select('*').order('created_at', { ascending: false });
    apps = data || [];
    renderApps();
  }
  function renderApps() {
    const c = $('#appListAdmin');
    if (!apps.length) { c.replaceChildren(h('p', { class: 'aa-note', text: 'No hay apps aún.' })); return; }
    c.replaceChildren(...apps.map(a => h('div', { class: 'app-row' },
      h('span', { class: 'app-row-name', text: (a.emoji || '📱') + ' ' + a.nombre }),
      h('button', { type: 'button', class: 'btn-del', text: 'Eliminar', onclick: () => delApp(a.id) }))));
  }
  async function addApp() {
    const nombre = $('#appName').value.trim();
    const emoji = $('#appEmoji').value.trim();
    const desc = $('#appDesc').value.trim();
    const apk = safeHttp($('#appUrl').value.trim());
    if (!nombre) { toast('El nombre es obligatorio', 'err'); return; }
    if (!apk) { toast('La URL del APK debe ser una https válida', 'err'); return; }
    const { error } = await sb.from('apps').insert({
      nombre, emoji: emoji || '📱', descripcion: desc, apk_url: apk, created_at: new Date().toISOString()
    });
    if (error) { toast('No se pudo añadir la app', 'err'); return; }
    ['#appName', '#appEmoji', '#appDesc', '#appUrl'].forEach(s => { $(s).value = ''; });
    toast('App añadida');
    loadApps();
  }
  async function delApp(id) {
    if (!confirm('¿Eliminar esta app?')) return;
    const { error } = await sb.from('apps').delete().eq('id', id);
    if (error) { toast('No se pudo eliminar la app', 'err'); return; }
    toast('App eliminada');
    loadApps();
  }

  /* ── realtime (una sola vez, solo admin) ── */
  function realtime() {
    if (channel) return;
    channel = sb.channel('msgs_rt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, p => {
      all.unshift(p.new);
      render();
      toast('📩 Nuevo mensaje de ' + (p.new.nombre || 'alguien'));
    }).subscribe();
  }

  /* ── vistas y navegación ── */
  const TITLES = {
    solicitudes: { t: 'Solicitudes', s: 'Gestiona los mensajes de tus clientes' },
    apps: { t: 'Mini Apps', s: 'Publica apps Android para tus clientes' },
    config: { t: 'Configuración', s: 'Año del footer y disponibilidad' }
  };
  function showView(v) {
    document.querySelectorAll('.view').forEach(s => { s.hidden = s.dataset.view !== v; });
    document.querySelectorAll('.side-link[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    const t = TITLES[v] || TITLES.solicitudes;
    $('#viewTitle').textContent = t.t; $('#viewSub').textContent = t.s;
    closeSide();
  }
  const openSide = () => { desk().classList.add('side-open'); $('#sideToggle').setAttribute('aria-expanded', 'true'); };
  const closeSide = () => { desk().classList.remove('side-open'); $('#sideToggle').setAttribute('aria-expanded', 'false'); };

  function wire() {
    if (wired) return;
    wired = true;
    $('#logout').addEventListener('click', async () => { await sb.auth.signOut(); location.href = 'index.html'; });
    document.querySelectorAll('.side-link[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    $('#sideToggle').addEventListener('click', () => desk().classList.contains('side-open') ? closeSide() : openSide());
    $('#sideScrim').addEventListener('click', closeSide);

    document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
      filter = b.dataset.filter;
      document.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
      render();
    }));
    $('#search').addEventListener('input', e => { search = e.target.value.trim(); render(); });
    $('#saveYear').addEventListener('click', saveYear);
    $('#toggleDisponible').addEventListener('change', e => saveDisp(e.target.checked));
    $('#addAppBtn').addEventListener('click', addApp);

    const md = modal();
    md.addEventListener('click', e => { if (e.target === md) md.close(); });
    md.addEventListener('close', () => { if (mq.matches) { curId = null; render(); refreshDetail(); } });
    mq.addEventListener('change', () => {
      if (!mq.matches && modal().open) modal().close();
      refreshDetail();
    });
  }

  async function boot(user) {
    const i = info(user);
    $('#tbName').textContent = i.name;
    const ph = $('#tbPhoto'), fb = $('#tbFallback');
    if (i.photo) { ph.src = i.photo; ph.hidden = false; fb.hidden = true; }
    else { ph.hidden = true; fb.hidden = false; fb.textContent = i.name.charAt(0).toUpperCase(); }

    $('#inputYear').value = new Date().getFullYear();
    loadMsgs(); loadYear(); loadDisp(); loadApps();
    if (i.isAdmin) realtime();
  }

  wire();
  onUser(u => {
    if (!u) { location.href = 'index.html'; return; }
    const i = info(u);
    if (!i.isAdmin) { $('#denied').hidden = false; $('#dash').hidden = true; return; }
    if (bootId === u.id) return;
    bootId = u.id;
    $('#denied').hidden = true;
    $('#dash').hidden = false;
    boot(u);
  });
})();
