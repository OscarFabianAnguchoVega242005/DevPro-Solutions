/* index.js — lógica de la página pública */
(() => {
  'use strict';
  const { sb, $, h, toast, safeHttp, info, onUser } = App;
  let me = null;

  /* Hero: revelado palabra por palabra (cada span lleva --i para el retraso escalonado) */
  (() => {
    const title = $('.hero h1');
    if (!title) return;
    const words = [];
    title.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/\s+/).filter(Boolean).forEach(w => words.push(h('span', { class: 'w', text: w })));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        words.push(h('span', { class: 'w' }, h(node.tagName.toLowerCase(), { text: node.textContent })));
      }
    });
    title.replaceChildren();
    words.forEach((w, i) => {
      w.style.setProperty('--i', String(i));
      title.append(w);
      if (i < words.length - 1) title.append(' ');
    });
  })();

  async function login() {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) toast('No se pudo iniciar sesión', 'err');
  }
  const logout = async () => { await sb.auth.signOut(); toast('Sesión cerrada'); };
  $('#login').addEventListener('click', login);
  $('#login2').addEventListener('click', login);
  $('#loginM').addEventListener('click', login);
  $('#logout').addEventListener('click', logout);
  $('#logoutM').addEventListener('click', logout);

  onUser(u => {
    me = u;
    /* Escritorio: un solo control (login o avatar) */
    $('#login').hidden = !!u; $('#user').hidden = !u;
    /* Móvil: acciones dentro del menú */
    $('#loginM').hidden = !!u; $('#userM').hidden = !u; $('#logoutM').hidden = !u;
    $('#locked').hidden = !!u; $('#form-wrap').hidden = !u;
    if (!u) return;
    const i = info(u), letter = i.name.charAt(0).toUpperCase();
    $('#uName').textContent = i.name; $('#uNameM').textContent = i.name;
    $('#fUser').textContent = `${i.name} · ${u.email}`;
    const ph = $('#uPhoto'), phM = $('#uPhotoM'), fb = $('#uFb'), fbM = $('#uFbM');
    if (i.photo) {
      ph.src = i.photo; ph.hidden = false; fb.hidden = true;
      phM.src = i.photo; phM.hidden = false; fbM.hidden = true;
    } else {
      ph.hidden = true; fb.hidden = false; fb.textContent = letter;
      phM.hidden = true; fbM.hidden = false; fbM.textContent = letter;
    }
    $('#aAdmin').hidden = !i.isAdmin; $('#aAdminM').hidden = !i.isAdmin;
    $('#aPanel').hidden = i.isAdmin; $('#aPanelM').hidden = i.isAdmin;
  });

  /* ---------------------------------------------------------------------------
     Navegación — menú de usuario (escritorio) y menú móvil desplegable
     --------------------------------------------------------------------------- */
  (() => {
    const nav = $('#topnav'), toggle = $('#navToggle'), menu = $('#navMenu');
    const userBtn = $('#userBtn'), userMenu = $('#userMenu');
    if (!nav || !toggle || !menu || !userBtn || !userMenu) return;
    const mq = matchMedia('(max-width: 900px)');
    const FOCUSABLE = 'a[href], button:not([disabled])';
    const visible = root => [...root.querySelectorAll(FOCUSABLE)].filter(el => !el.hidden && el.offsetParent !== null);
    const setExp = (btn, on) => btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    const isOpen = el => el.classList.contains('open');

    const placeMenu = () => document.documentElement.style.setProperty('--nm-top', `${Math.round(nav.getBoundingClientRect().bottom)}px`);

    function openMobile() {
      placeMenu();
      menu.classList.add('open'); toggle.classList.add('open');
      setExp(toggle, true); toggle.setAttribute('aria-label', 'Cerrar menú');
      document.body.classList.add('scroll-lock');
      const first = visible(menu)[0]; if (first) first.focus();
    }
    function closeMobile(restore = true) {
      if (!isOpen(menu)) return;
      menu.classList.remove('open'); toggle.classList.remove('open');
      setExp(toggle, false); toggle.setAttribute('aria-label', 'Abrir menú');
      document.body.classList.remove('scroll-lock');
      if (restore) toggle.focus();
    }
    function openUser() {
      userMenu.classList.add('open'); setExp(userBtn, true);
      const first = visible(userMenu)[0]; if (first) first.focus();
    }
    function closeUser(restore = true) {
      if (!isOpen(userMenu)) return;
      userMenu.classList.remove('open'); setExp(userBtn, false);
      if (restore) userBtn.focus();
    }

    toggle.addEventListener('click', () => isOpen(menu) ? closeMobile() : openMobile());
    userBtn.addEventListener('click', e => {
      e.stopPropagation();
      isOpen(userMenu) ? closeUser() : openUser();
    });
    userBtn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' && !isOpen(userMenu)) { e.preventDefault(); openUser(); }
    });

    /* Cerrar al elegir un enlace o acción (sin devolver foco: se navega) */
    menu.addEventListener('click', e => { if (e.target.closest('a, button')) closeMobile(false); });
    userMenu.addEventListener('click', e => { if (e.target.closest('a, button')) closeUser(false); });

    /* Cerrar al hacer clic fuera */
    document.addEventListener('click', e => {
      if (isOpen(userMenu) && !e.target.closest('#userMenu') && !e.target.closest('#userBtn')) closeUser(false);
      if (isOpen(menu) && !e.target.closest('#navMenu') && !e.target.closest('#navToggle')) closeMobile(false);
    });

    /* Teclado: Escape, flechas en el desplegable y Tab atrapado en el menú móvil */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (isOpen(menu)) closeMobile();
        else if (isOpen(userMenu)) closeUser();
        return;
      }
      if (isOpen(userMenu) && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End')) {
        const items = visible(userMenu); if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        let n = i;
        if (e.key === 'ArrowDown') n = (i + 1) % items.length;
        else if (e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length;
        else if (e.key === 'Home') n = 0;
        else n = items.length - 1;
        items[n].focus();
        return;
      }
      if (e.key === 'Tab' && isOpen(userMenu)) { closeUser(false); return; }
      if (e.key === 'Tab' && isOpen(menu)) {
        const items = [toggle, ...visible(menu)];
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    /* Reposicionar el panel si cambia el tamaño; cerrar todo al cruzar el breakpoint */
    addEventListener('resize', () => { if (isOpen(menu)) placeMenu(); }, { passive: true });
    mq.addEventListener('change', () => { closeMobile(false); closeUser(false); });
  })();

  /* ---------------------------------------------------------------------------
     Signal Form — chips de servicio, validación en línea y contador del mensaje
     --------------------------------------------------------------------------- */
  const svcGroup = $('#svcGroup'), svcField = $('#servicio');
  const msg = $('#msg'), count = $('#msgCount');
  const MAX = 4000;

  const setErr = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text || ''; };

  if (svcGroup && svcField) {
    svcGroup.addEventListener('change', () => {
      const r = svcGroup.querySelector('input[name="servicio"]:checked');
      svcField.value = r ? r.value : '';
      if (r) setErr('srvErr', '');
    });
  }

  if (msg && count) {
    const upd = () => { count.textContent = `${msg.value.length} / ${MAX}`; };
    upd(); msg.addEventListener('input', upd);
  }

  $('#form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!me) return login();
    setErr('srvErr', ''); setErr('msgErr', '');
    const servicio = svcField ? svcField.value : '';
    const texto = msg ? msg.value.trim() : '';
    let bad = false;
    if (!servicio) { setErr('srvErr', 'Elige el servicio que necesitas'); bad = true; }
    if (texto.length < 10) { setErr('msgErr', 'Cuéntame un poco más (mín. 10 caracteres)'); bad = true; }
    if (bad) { if (!servicio) svcGroup?.querySelector('input')?.focus(); else msg?.focus(); return; }

    const b = $('#send'), lbl = b.querySelector('.send-label');
    b.disabled = true; b.classList.add('is-loading'); b.classList.remove('is-sent');
    if (lbl) lbl.textContent = 'Enviando…';
    const i = info(me), n = $('#tel').value.replace(/\D/g, '').replace(/^0+/, '');
    const { error } = await sb.from('mensajes').insert({
      user_id: me.id, nombre: i.name, email: me.email, foto: i.photo,
      telefono: n ? $('#pais').value + n : '', servicio,
      mensaje: texto, estado: 'pendiente', leido: false, respondido: false,
      created_at: new Date().toISOString()
    });
    b.disabled = false; b.classList.remove('is-loading');
    if (error) { if (lbl) lbl.textContent = 'Enviar solicitud →'; toast('No se pudo enviar. Intenta de nuevo.', 'err'); return; }
    b.classList.add('is-sent'); if (lbl) lbl.textContent = '¡Enviado!';
    e.target.reset(); if (svcField) svcField.value = ''; if (count) count.textContent = `0 / ${MAX}`;
    toast('¡Solicitud enviada! Te respondo pronto.');
    setTimeout(() => { b.classList.remove('is-sent'); if (lbl) lbl.textContent = 'Enviar solicitud →'; }, 2600);
  });

  /* Año del footer y disponibilidad */
  sb.from('configuracion').select('clave,valor').in('clave', ['footer_año', 'disponible']).then(({ data }) => {
    (data || []).forEach(r => {
      if (r.clave === 'footer_año') $('#year').textContent = r.valor;
      else {
        const ok = r.valor === 'true';
        $('#dot').classList.toggle('off', !ok);
        $('#avail').textContent = ok ? 'Disponible para nuevos proyectos' : 'No disponible actualmente';
      }
    });
  });

  /* ---------------------------------------------------------------------------
     Spotlight Carousel — mini apps (todo el contenido se inserta como texto)
     --------------------------------------------------------------------------- */
  (async () => {
    const track = $('#appsTrack'), prev = $('#appsPrev'), next = $('#appsNext'), wrap = $('#appsCarousel');
    if (!track) return;
    const { data } = await sb.from('apps').select('*').order('created_at', { ascending: false });
    const rows = (data || []).filter(a => a && a.nombre);
    if (!rows.length) {
      track.replaceChildren(h('p', { class: 'note', text: 'Próximamente apps disponibles.' }));
      wrap.classList.add('is-grid');
      if (prev) prev.hidden = true;
      if (next) next.hidden = true;
      return;
    }
    track.replaceChildren(...rows.map(a => {
      const img = safeHttp(a.icono), url = safeHttp(a.apk_url);
      return h('article', { class: 'spot-card', role: 'listitem' },
        h('div', { class: 'ico' }, img ? h('img', { src: img, alt: '', loading: 'lazy' }) : (a.emoji || '📱')),
        h('h3', { text: a.nombre }), h('p', { text: a.descripcion || '' }),
        url ? h('a', { class: 'btn main', href: url, rel: 'noopener noreferrer', text: '⬇ Descargar APK' })
            : h('span', { class: 'note', text: 'Descarga no disponible' }));
    }));

    if (rows.length <= 3) {
      wrap.classList.add('is-grid');
      if (prev) prev.hidden = true;
      if (next) next.hidden = true;
      return;
    }
    if (prev) prev.hidden = false;
    if (next) next.hidden = false;

    const gap = () => parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = () => {
      const c = track.querySelector('.spot-card');
      return c ? c.getBoundingClientRect().width + gap() : track.clientWidth;
    };
    const go = dir => track.scrollBy({ left: dir * step(), behavior: 'smooth' });
    if (prev) prev.addEventListener('click', () => go(-1));
    if (next) next.addEventListener('click', () => go(1));
    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    });

    /* Resalta la tarjeta centrada y atenúa las flechas en los extremos */
    let raf = 0;
    const reflect = () => {
      const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
      let best = null, bd = Infinity;
      track.querySelectorAll('.spot-card').forEach(c => {
        const r = c.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < bd) { bd = d; best = c; }
      });
      track.querySelectorAll('.spot-card.active').forEach(c => c.classList.remove('active'));
      if (best) best.classList.add('active');
      const max = track.scrollWidth - track.clientWidth;
      if (prev) prev.classList.toggle('dim', track.scrollLeft <= 1);
      if (next) next.classList.toggle('dim', track.scrollLeft >= max - 1);
    };
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(reflect); }, { passive: true });
    addEventListener('resize', reflect, { passive: true });

    /* Arrastre solo con ratón (pointer capture); el tacto usa el scroll nativo */
    let down = false, sx = 0, sl = 0, pid = null;
    track.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.target.closest('a, button')) return;
      down = true; sx = e.clientX; sl = track.scrollLeft; pid = e.pointerId;
      track.setPointerCapture(pid); track.classList.add('dragging');
    });
    track.addEventListener('pointermove', e => { if (down) track.scrollLeft = sl - (e.clientX - sx); });
    const end = () => {
      if (!down) return;
      down = false;
      if (pid != null && track.hasPointerCapture(pid)) track.releasePointerCapture(pid);
      pid = null; track.classList.remove('dragging');
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);

    reflect();
  })();
})();