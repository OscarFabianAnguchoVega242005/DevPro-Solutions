/* desk-menu.js — desplegable de usuario de la topbar (admin.html y panel.html)
   Solo abre/cierra #deskUserMenu. El cierre de sesión de #logout lo gestiona
   admin.js / panel.js. */
(() => {
  'use strict';
  const btn = document.getElementById('deskUserBtn');
  const menu = document.getElementById('deskUserMenu');
  if (!btn || !menu) return;

  const FOCUSABLE = 'a[href], button:not([disabled])';
  const visible = () => [...menu.querySelectorAll(FOCUSABLE)].filter(el => !el.hidden && el.offsetParent !== null);
  const isOpen = () => menu.classList.contains('open');
  const setExp = on => btn.setAttribute('aria-expanded', on ? 'true' : 'false');

  function open() {
    menu.classList.add('open'); setExp(true);
    const first = visible()[0]; if (first) first.focus();
  }
  function close(restore = true) {
    if (!isOpen()) return;
    menu.classList.remove('open'); setExp(false);
    if (restore) btn.focus();
  }

  btn.addEventListener('click', e => { e.stopPropagation(); isOpen() ? close() : open(); });
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && !isOpen()) { e.preventDefault(); open(); } });

  /* Cerrar al elegir un enlace o acción (sin devolver foco: se navega) */
  menu.addEventListener('click', e => { if (e.target.closest('a, button')) close(false); });

  /* Cerrar al hacer clic fuera */
  document.addEventListener('click', e => {
    if (isOpen() && !e.target.closest('#deskUserMenu') && !e.target.closest('#deskUserBtn')) close(false);
  });

  /* Teclado: Escape y navegación con flechas dentro del menú */
  document.addEventListener('keydown', e => {
    if (isOpen() && e.key === 'Escape') { close(); return; }
    if (!isOpen() || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = visible(); if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    let n = i;
    if (e.key === 'ArrowDown') n = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') n = 0;
    else n = items.length - 1;
    items[n].focus();
  });
})();
