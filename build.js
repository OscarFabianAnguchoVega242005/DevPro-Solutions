/**
 * build.js — Se ejecuta en el build de Cloudflare Pages.
 * Genera js/config.js a partir de variables de entorno para no subir
 * credenciales al repositorio (js/config.js está en .gitignore).
 *
 * Requeridas en Cloudflare Pages → Settings → Environment variables
 * (en Production Y Preview):
 *   SUPABASE_URL  (o SUPABASE_PROJECT_URL / VITE_SUPABASE_URL)
 *   SUPABASE_KEY  (o SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY)
 *   ADMIN_EMAIL
 *
 * Acepta alias de nombre para evitar el error de "variable vacía".
 */
const fs = require('fs');
const path = require('path');

const pick = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return '';
};

const cfg = {
  SUPABASE_URL: pick('SUPABASE_URL', 'SUPABASE_PROJECT_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL'),
  SUPABASE_KEY: pick('SUPABASE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLIC_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
  ADMIN_EMAIL: pick('ADMIN_EMAIL', 'ADMIN_MAIL')
};

const missing = Object.keys(cfg).filter(k => !cfg[k]);
if (missing.length) {
  const seen = Object.keys(process.env).filter(k => /SUPABASE|ADMIN/i.test(k));
  console.error('FALTAN variables de entorno: ' + missing.join(', '));
  console.error('Variables SUPABASE/ADMIN detectadas en este build: ' + (seen.length ? seen.join(', ') : '(ninguna)'));
  console.error('Ve a Settings → Environment variables (Production y Preview) y usa exactamente esos nombres.');
  process.exit(1);
}

if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(cfg.SUPABASE_URL.replace(/\/$/, '') + '')) {
  console.warn('Aviso: SUPABASE_URL no parece una https://<proyecto>.supabase.co');
}

const out = path.join(__dirname, 'js', 'config.js');
const body =
  '/* Generado por build.js en Cloudflare Pages. No editar ni subir a Git. */\n' +
  'window.CONFIG = Object.freeze({\n' +
  '  SUPABASE_URL: ' + JSON.stringify(cfg.SUPABASE_URL) + ',\n' +
  '  SUPABASE_KEY: ' + JSON.stringify(cfg.SUPABASE_KEY) + ',\n' +
  '  ADMIN_EMAIL: ' + JSON.stringify(cfg.ADMIN_EMAIL) + '\n' +
  '});\n';

fs.writeFileSync(out, body, 'utf8');
console.log('Generado ' + out + ' (URL y email presentes, key con ' + cfg.SUPABASE_KEY.length + ' caracteres)');
