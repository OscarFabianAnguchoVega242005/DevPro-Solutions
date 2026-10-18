/* core.js — helpers compartidos: cliente Supabase, DOM seguro, sesión y fondo aurora */
(() => {
  'use strict';
  const cfg = window.CONFIG;
  if (!cfg) { document.body.textContent = 'Falta config.js (copia config.example.js)'; throw new Error('CONFIG missing'); }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  const $ = (s, r = document) => r.querySelector(s);

  /* Crea elementos sin HTML crudo: el texto siempre se inserta como texto (anti-XSS) */
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...kids.flat().filter(x => x != null && x !== false));
    return el;
  };

  /* Solo URLs https; el avatar solo desde dominios de Google */
  const safeHttp = u => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; } };
  const safeAvatar = u => { const s = safeHttp(u); return s && new URL(s).hostname.endsWith('.googleusercontent.com') ? s : ''; };

  const info = u => {
    const m = u.user_metadata || {};
    const name = m.full_name || m.name || u.email.split('@')[0];
    return { name, photo: safeAvatar(m.avatar_url || m.picture), isAdmin: u.email === cfg.ADMIN_EMAIL };
  };

  let tt;
  const toast = (msg, type = '') => {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.className = `toast ${type} show`;
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3500);
  };

  /* Avisa solo cuando cambia el usuario (evita ejecuciones duplicadas) */
  const onUser = cb => {
    let last;
    sb.auth.onAuthStateChange((_, s) => {
      const u = s?.user || null;
      if ((u?.id || 0) === last) return;
      last = u?.id || 0;
      setTimeout(() => cb(u), 0);
    });
  };

  window.App = { sb, cfg, $, h, toast, safeHttp, info, onUser };

  /* Scroll: progreso, hero que se desvanece, barra que se contrae */
  const bar = $('#bar'), hero = $('.hero'), nav = $('#topnav');
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    if (hero) hero.style.setProperty('--hp', Math.min(1, scrollY / (innerHeight * .8)).toFixed(3));
    if (nav) nav.classList.toggle('scrolled', scrollY > 24);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Brillo que sigue al cursor */
  document.addEventListener('pointermove', e => {
    const c = e.target.closest?.('[data-spot]'); if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('in')), { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ---------------------------------------------------------------------------
     Fondo: galaxia (nebulosas, auroras, rejilla hex, constelaciones, estrellas
     fugaces). Un solo canvas #bg.
     - Se pausa con document.hidden; con prefers-reduced-motion dibuja un fotograma.
     - Animación independiente de los FPS (delta time).
     - Elementos con parallax se reciclan (wrap) para no salir nunca de pantalla.
     - La rejilla hex se pinta una sola vez en un canvas aparte.
     --------------------------------------------------------------------------- */
  const cv = $('#bg'); if (!cv) return;
  const x = cv.getContext('2d', { alpha: false });
  const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const lowQ = innerWidth < 760;
  const COLORS = ['#a855f7', '#06b6d4', '#ec4899', '#7c3aed', '#f0f4ff'];
  const rand = (a, b) => Math.random() * (b - a) + a;

  /* Sprites de brillo pre-renderizados: evita crear gradientes radiales cada frame
     (era el mayor coste del fondo). */
  const SPR = {};
  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
  const glow = rgb => {
    const R = 64, c = document.createElement('canvas'); c.width = c.height = R * 2;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(R, R, 0, R, R, R);
    grd.addColorStop(0, `rgba(${rgb},1)`); grd.addColorStop(.4, `rgba(${rgb},.5)`); grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd; g.fillRect(0, 0, R * 2, R * 2);
    return c;
  };
  for (const h of COLORS) SPR[h] = glow(hexRgb(h));
  for (const s of ['168,85,247', '6,182,212', '236,72,153', '124,58,237']) SPR[s] = glow(s);

  const stars = Array.from({ length: lowQ ? 90 : 200 }, () => ({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + .4,
    o: Math.random() * .6 + .4, ts: Math.random() * .02 + .005, to: rand(0, 6.28),
    d: Math.random() * 3 + 1, c: COLORS[Math.floor(Math.random() * 5)], px: 0, py: 0,
    vx: (Math.random() - .5) * .00024, vy: (Math.random() - .5) * .00024
  }));
  const nebulas = [
    { x: .15, y: .2, rx: 460, ry: 340, c: '168,85,247', a: .10, ph: 0, sp: .0003 },
    { x: .85, y: .7, rx: 520, ry: 380, c: '6,182,212', a: .085, ph: 2.1, sp: .0004 },
    { x: .5, y: .45, rx: 420, ry: 460, c: '236,72,153', a: .075, ph: 4.2, sp: .00035 },
    { x: .2, y: .8, rx: 340, ry: 280, c: '124,58,237', a: .09, ph: 1.05, sp: .00025 },
    { x: .8, y: .15, rx: 430, ry: 300, c: '6,182,212', a: .07, ph: 3.3, sp: .00045 }
  ];
  const ribbons = [
    { y: .1, amp: 80, f: .003, c: '168,85,247', sp: .0008 },
    { y: .35, amp: 60, f: .004, c: '6,182,212', sp: .001 },
    { y: .65, amp: 70, f: .0035, c: '236,72,153', sp: .0009 },
    { y: .85, amp: 50, f: .005, c: '124,58,237', sp: .0007 }
  ];
  const floaters = Array.from({ length: lowQ ? 12 : 28 }, () => ({
    x: rand(-.5, 1.5), y: Math.random(), vx: (Math.random() - .5) * .0003,
    vy: -(Math.random() * .0003 + .0001), r: Math.random() * 2.5 + .5,
    o: Math.random() * .4 + .3, c: COLORS[Math.floor(Math.random() * 3)],
    ph: rand(0, 6.28), ps: Math.random() * .03 + .01
  }));
  const shooters = [];

  const TAU = 6.2832, HH = 45 * Math.sqrt(3);
  let W = 1, H = 1, dpr = 1, sx = 0, mx = -1e4, my = -1e4, t = 0, raf = 0, last = 0;
  let hexCv = null, lastW = 0, lastH = 0;

  const spawnShooter = () => {
    if (shooters.length > 3) return;
    shooters.push({ x: rand(0, W), y: rand(0, H * .4), vx: rand(4, 10) * (Math.random() > .5 ? 1 : -1), vy: rand(2, 5), life: 1, len: rand(60, 140), c: COLORS[Math.floor(Math.random() * 4)] });
  };

  /* Da la vuelta un valor dentro de [-m, H+m] para que nada desaparezca al hacer scroll */
  const wrap = (v, m) => { const r = H + 2 * m; return (((v + m) % r) + r) % r - m; };

  /* Rejilla hexagonal: se pinta UNA vez en un canvas aparte con degradado de desvanecido */
  const buildHex = () => {
    if (lowQ) { hexCv = null; return; }
    const s = 45, ch = Math.ceil(H + HH * 2);
    hexCv = document.createElement('canvas'); hexCv.width = W; hexCv.height = ch;
    const g = hexCv.getContext('2d');
    g.strokeStyle = 'rgba(168,85,247,1)'; g.lineWidth = .6; g.beginPath();
    for (let col = -1; col < W / (s * 1.5) + 2; col++) {
      for (let row = -1; row < ch / HH + 2; row++) {
        const px = col * s * 1.5, py = row * HH + (col % 2 === 0 ? 0 : HH / 2);
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const hx = px + s * .92 * Math.cos(a), hy = py + s * .92 * Math.sin(a);
          if (i === 0) g.moveTo(hx, hy); else g.lineTo(hx, hy);
        }
        g.closePath();
      }
    }
    g.stroke();
    g.globalCompositeOperation = 'destination-in';
    const f = g.createRadialGradient(W / 2, ch / 2, 0, W / 2, ch / 2, Math.hypot(W, H) / 2);
    f.addColorStop(0, 'rgba(0,0,0,.10)'); f.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = f; g.fillRect(0, 0, W, ch);
  };

  const size = () => {
    W = Math.max(1, cv.clientWidth || innerWidth);
    H = Math.max(1, cv.clientHeight || innerHeight);
    dpr = lowQ ? .9 : 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    lastW = W; lastH = H;
    buildHex();
  };

  const draw = ts => {
    if (ts && last && ts - last < (lowQ ? 33 : 20)) { raf = requestAnimationFrame(draw); return; }
    const dt = last ? Math.min(3, (ts - last) / 16.67) : 1; last = ts;
    t += .016 * dt;
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#07090f'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter';

    /* Nebulosas (sprite pre-renderizado) */
    for (const n of nebulas) {
      n.ph += n.sp * dt;
      const cx = n.x * W + Math.sin(n.ph) * 60;
      const cy = wrap(n.y * H + Math.cos(n.ph * .7) * 40 - sx * .08, n.ry);
      const pulse = 1 + Math.sin(n.ph * 2) * .15;
      const rx = n.rx * pulse, ry = n.ry * pulse;
      x.globalAlpha = n.a * 1.5;
      x.drawImage(SPR[n.c], cx - rx, cy - ry, rx * 2, ry * 2);
    }
    x.globalAlpha = 1;

    /* Auroras */
    for (const r of ribbons) {
      const baseY = wrap(r.y * H - sx * .15, 100);
      const g = x.createLinearGradient(0, baseY - 40, 0, baseY + 40);
      g.addColorStop(0, `rgba(${r.c},0)`); g.addColorStop(.5, `rgba(${r.c},0.13)`); g.addColorStop(1, `rgba(${r.c},0)`);
      x.fillStyle = g; x.beginPath(); x.moveTo(0, baseY);
      for (let px = 0; px <= W + 8; px += 8) {
        x.lineTo(px, baseY + Math.sin(px * r.f + t * r.sp * 1000) * r.amp + Math.sin(px * r.f * 1.7 + t * r.sp * 800 + 1) * r.amp * .4);
      }
      x.lineTo(W, baseY + 60); x.lineTo(0, baseY + 60); x.closePath(); x.fill();
    }

    /* Rejilla hex (una sola imagen precalculada) */
    if (hexCv) x.drawImage(hexCv, 0, -((sx * .08) % HH));

    /* Posiciones de estrellas: se calculan UNA vez y las reutilizan líneas y puntos */
    const mv = still ? 0 : dt;
    for (const s of stars) {
      s.to += s.ts * dt;
      s.x += s.vx * mv; s.y += s.vy * mv;
      if (s.x < 0 || s.x > 1) s.vx *= -1;
      if (s.y < 0 || s.y > 1) s.vy *= -1;
      s.px = s.x * W; s.py = wrap(s.y * H - sx * .02 * s.d, 0);
    }

    /* Constelaciones */
    if (!lowQ) {
      x.lineWidth = .7;
      const N = 60;
      let edge = 0;
      for (let i = 0; i < N; i++) {
        const a = stars[i];
        for (let j = i + 1; j < N; j++) {
          const b = stars[j], dx = a.px - b.px, dy = a.py - b.py, d2 = dx * dx + dy * dy;
          if (d2 < 40000) {
            const d = Math.sqrt(d2), al = (1 - d / 200) * .35;
            x.strokeStyle = `rgba(168,85,247,${Math.max(0, al)})`;
            x.beginPath(); x.moveTo(a.px, a.py); x.lineTo(b.px, b.py); x.stroke();
            if (!still && edge++ % 3 === 0) {   /* punto de luz que recorre la línea */
              const p = (t * .25 + ((i * 7 + j * 13) % 10) / 10) % 1;
              x.globalAlpha = Math.min(1, al * 3); x.fillStyle = a.c;
              x.beginPath(); x.arc(a.px + (b.px - a.px) * p, a.py + (b.py - a.py) * p, 1.8, 0, TAU); x.fill();
              x.globalAlpha = 1;
            }
          }
        }
      }
    }

    /* Estrellas */
    for (const s of stars) {
      const tw = Math.sin(s.to) * .4 + .6;
      x.globalAlpha = s.o * tw; x.fillStyle = s.c;
      x.beginPath(); x.arc(s.px, s.py, s.r * tw, 0, TAU); x.fill();
      if (s.r > 1.2) {
        x.globalAlpha = s.o * tw * .35;
        const rr = s.r * 4;
        x.drawImage(SPR[s.c], s.px - rr, s.py - rr, rr * 2, rr * 2);
      }
    }

    /* Partículas flotantes */
    for (const f of floaters) {
      f.x += f.vx * dt; f.y += f.vy * dt; f.ph += f.ps * dt;
      if (f.y < -.05) { f.y = 1.05; f.x = rand(-.1, 1.1); }
      if (f.x < -.1 || f.x > 1.1) f.vx *= -1;
      x.globalAlpha = f.o * (.7 + Math.sin(f.ph) * .3); x.fillStyle = f.c;
      x.beginPath(); x.arc(f.x * W, wrap(f.y * H - sx * .05, 10), f.r, 0, TAU); x.fill();
    }
    x.globalAlpha = 1;

    /* Estrellas fugaces */
    if (Math.random() < .004 * dt) spawnShooter();
    for (let i = shooters.length - 1; i >= 0; i--) {
      const s = shooters[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= .018 * dt;
      if (s.life <= 0) { shooters.splice(i, 1); continue; }
      const k = s.len / (Math.hypot(s.vx, s.vy) || 1);
      x.globalAlpha = s.life * .8;
      const g = x.createLinearGradient(s.x, s.y, s.x - s.vx * k, s.y - s.vy * k);
      g.addColorStop(0, s.c); g.addColorStop(1, 'transparent');
      x.strokeStyle = g; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(s.x, s.y); x.lineTo(s.x - s.vx * k, s.y - s.vy * k); x.stroke();
    }
    x.globalAlpha = 1;

    /* Brillo del cursor (el canvas es fixed: sin sumar scroll) */
    if (!lowQ && mx > -1e3) {
      x.globalAlpha = .12;
      x.drawImage(SPR['168,85,247'], mx - 200, my - 200, 400, 400);
      x.globalAlpha = 1;
    }

    x.globalCompositeOperation = 'source-over';
    if (!still && !document.hidden) raf = requestAnimationFrame(draw);
  };

  addEventListener('resize', () => {
    /* ignora los cambios de altura de la barra del navegador en móvil */
    if (cv.clientWidth === lastW && Math.abs(cv.clientHeight - lastH) < 160) return;
    size(); if (still) draw(performance.now());
  }, { passive: true });
  addEventListener('scroll', () => { sx = scrollY; if (still) draw(performance.now()); }, { passive: true });
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || still) return;
    last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
  });
  size(); draw(performance.now());
})();