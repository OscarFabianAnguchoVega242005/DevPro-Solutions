/* panel.js — Client Desk del usuario (DOM construido con nodos de texto) */
(() => {
  'use strict';
  const { sb, $, h, toast, info, onUser } = App;

  let me = null, rows = [], bootId = null;
  const desk = () => $('#dash');

  const fmt = iso => iso
    ? new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const EMAP = {
    pendiente: { cls: 'estado-pendiente', txt: 'Pendiente' },
    proceso: { cls: 'estado-proceso', txt: 'En proceso' },
    completado: { cls: 'estado-completado', txt: 'Completado' }
  };
  const badge = e => { const x = EMAP[e] || EMAP.pendiente; return h('span', { class: `estado ${x.cls}`, text: x.txt }); };

  async function load() {
    if (!me) return;
    const { data, error } = await sb.from('mensajes').select('*').eq('user_id', me.id).order('created_at', { ascending: false });
    if (error) {
      toast('No se pudieron cargar tus solicitudes', 'err');
      $('#solList').replaceChildren(h('div', { class: 'empty-list', text: 'No se pudieron cargar tus solicitudes.' }));
      return;
    }
    rows = data || [];
    render();
  }

  const weekStart = d => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - day); return x; };
  function series(n) {
    const cur = weekStart(new Date()), arr = [];
    for (let i = n - 1; i >= 0; i--) { const s = new Date(cur); s.setDate(s.getDate() - 7 * i); arr.push({ start: s, count: 0 }); }
    const idx = new Map(arr.map((w, i) => [w.start.getTime(), i]));
    for (const m of rows) {
      if (!m.created_at) continue;
      const k = weekStart(new Date(m.created_at)).getTime();
      if (idx.has(k)) arr[idx.get(k)].count++;
    }
    return arr;
  }

  const pad = n => String(n).padStart(2, '0');
  function renderStats() {
    const total = rows.length;
    const proceso = rows.filter(s => s.estado === 'proceso').length;
    const comp = rows.filter(s => s.estado === 'completado').length;
    const espera = rows.filter(s => !s.estado || s.estado === 'pendiente').length;
    $('#statTotal').textContent = total;
    $('#statProceso').textContent = proceso;
    $('#statCompletado').textContent = comp;
    $('#statEspera').textContent = espera;

    const w = series(8), last = w[w.length - 1].count, prev = w[w.length - 2].count, diff = last - prev;
    const t = $('#statTotalChip');
    t.className = 'kpi-chip' + (diff > 0 ? ' up' : diff < 0 ? ' down' : '');
    t.textContent = diff > 0 ? `▲ +${diff} esta semana` : diff < 0 ? `▼ ${diff} esta semana` : '＝ sin cambios';
    $('#statProcesoChip').textContent = `${proceso} activo${proceso === 1 ? '' : 's'}`;
    const c = $('#statCompletadoChip');
    c.className = 'kpi-chip' + (comp ? ' up' : '');
    c.textContent = total ? `${Math.round(comp / total * 100)}% del total` : '—';
    $('#statEsperaChip').textContent = `${espera} sin iniciar`;
  }

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

  function render() {
    renderStats(); renderChart();
    const list = $('#solList');
    if (!rows.length) {
      list.replaceChildren(h('div', { class: 'empty-state' },
        h('div', { class: 'empty-icon', text: '📭' }),
        h('h3', { text: 'Aún no tienes solicitudes' }),
        h('p', { text: 'Envía tu primera solicitud y podrás ver el progreso aquí.' })));
      return;
    }
    list.replaceChildren(...rows.map(card));
  }

  function card(s) {
    const el = h('div', { class: 'sol-card' },
      h('div', { class: 'sol-top' },
        h('div', {},
          h('div', { class: 'sol-servicio', text: s.servicio || 'Solicitud general' }),
          h('div', { class: 'sol-fecha', text: fmt(s.created_at) })),
        badge(s.estado || 'pendiente')),
      h('div', { class: 'sol-mensaje', text: s.mensaje || 'Sin descripción' }),
      h('div', { class: 'sol-footer' },
        h('span', { class: 'sol-respondido' + (s.respondido ? ' si' : ''), text: s.respondido ? '✓ Ya te contactaron' : '⏳ Esperando respuesta' }),
        h('span', { class: 'sol-ver', text: 'Ver detalle →' })));
    el.addEventListener('click', () => openDetail(s));
    return el;
  }

  function timeline(estado) {
    const steps = [
      { t: 'Pendiente', d: 'Recibimos tu solicitud' },
      { t: 'En proceso', d: 'Estamos trabajando en tu proyecto' },
      { t: 'Completado', d: 'Proyecto entregado y soporte activo' }
    ];
    const idx = { pendiente: 0, proceso: 1, completado: 2 }[estado] ?? 0;
    return h('div', { class: 'tl' }, steps.map((s, i) => h('div', { class: 'tl-step' + (i <= idx ? ' done' : '') },
      h('div', { class: 'tl-dot', text: String(i + 1) }),
      h('div', { class: 'tl-body' }, h('b', { text: s.t }), h('span', { text: s.d })))));
  }

  function openDetail(s) {
    $('#mServicio').textContent = s.servicio || 'Solicitud general';
    $('#mEstado').replaceChildren(badge(s.estado || 'pendiente'));
    $('#mTimeline').replaceChildren(timeline(s.estado || 'pendiente'));
    $('#mFecha').textContent = fmt(s.created_at);
    $('#mTel').textContent = s.telefono || '—';
    $('#mTelWrap').hidden = !s.telefono;
    $('#mMensaje').textContent = s.mensaje || 'Sin mensaje';
    const r = $('#mRespondido');
    r.textContent = s.respondido
      ? '✅ El equipo ya se ha puesto en contacto contigo.'
      : '⏳ Aún no te han contactado. Te responderán pronto.';
    r.classList.toggle('ok', !!s.respondido);
    $('#detail').showModal();
  }

  function openNew() {
    if (!me) return;
    const i = info(me);
    $('#fmName').textContent = i.name;
    $('#fmEmail').textContent = me.email;
    const ph = $('#fmPhoto'), fb = $('#fmFallback');
    if (i.photo) { ph.src = i.photo; ph.hidden = false; fb.hidden = true; }
    else { ph.hidden = true; fb.hidden = false; fb.textContent = i.name.charAt(0).toUpperCase(); }
    const d = $('#newDialog');
    if (!d.open) d.showModal();
  }

  function closeNew() {
    $('#newForm').reset();
    $('#newDialog').close();
  }

  $('#newForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!me) return;
    const btn = $('#btnEnviar');
    btn.disabled = true; btn.textContent = 'Enviando…';
    const i = info(me);
    const n = $('#ns-telefono').value.replace(/\D/g, '').replace(/^0+/, '');
    const tel = n ? $('#ns-pais').value + n : '';
    const { error } = await sb.from('mensajes').insert({
      user_id: me.id, nombre: i.name, email: me.email, foto: i.photo,
      telefono: tel, servicio: $('#ns-servicio').value,
      mensaje: $('#ns-mensaje').value.trim(), estado: 'pendiente', leido: false, respondido: false,
      created_at: new Date().toISOString()
    });
    btn.disabled = false; btn.textContent = 'Enviar solicitud →';
    if (error) { toast('No se pudo enviar. Intenta de nuevo.', 'err'); return; }
    closeNew();
    toast('¡Solicitud enviada! Te responderemos pronto.');
    load();
  });

  $('#logout').addEventListener('click', async () => { await sb.auth.signOut(); location.href = 'index.html'; });
  $('#btnNew').addEventListener('click', openNew);
  $('#sideNew').addEventListener('click', () => { closeSide(); openNew(); });
  $('#newClose').addEventListener('click', closeNew);
  $('#detailClose').addEventListener('click', () => $('#detail').close());

  const nd = $('#newDialog');
  nd.addEventListener('click', e => { if (e.target === nd) closeNew(); });
  const dd = $('#detail');
  dd.addEventListener('click', e => { if (e.target === dd) dd.close(); });

  const openSide = () => { desk().classList.add('side-open'); $('#sideToggle').setAttribute('aria-expanded', 'true'); };
  const closeSide = () => { desk().classList.remove('side-open'); $('#sideToggle').setAttribute('aria-expanded', 'false'); };
  $('#sideToggle').addEventListener('click', () => desk().classList.contains('side-open') ? closeSide() : openSide());
  $('#sideScrim').addEventListener('click', closeSide);

  onUser(u => {
    if (!u) { location.href = 'index.html'; return; }
    if (bootId === u.id) return;
    bootId = u.id; me = u;
    const i = info(u);
    $('#userName').textContent = i.name;
    const ph = $('#userPhoto'), fb = $('#userFallback');
    if (i.photo) { ph.src = i.photo; ph.hidden = false; fb.hidden = true; }
    else { ph.hidden = true; fb.hidden = false; fb.textContent = i.name.charAt(0).toUpperCase(); }
    $('#dash').hidden = false;
    load();
  });
})();
