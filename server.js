// Darknezz.shop — сервер без залежностей. Запуск: node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }); } catch {}
const PORT = process.env.PORT || 3000, PASS = process.env.ADMIN_PASSWORD || 'change-me';
const BOT = process.env.TELEGRAM_BOT_TOKEN, CHAT = process.env.TELEGRAM_CHAT_ID;
const DATA = path.join(__dirname, 'data'), UP = path.join(DATA, 'uploads'), PF = path.join(DATA, 'products.json'), PUB = path.join(__dirname, 'public');
fs.mkdirSync(UP, { recursive: true });
if (!fs.existsSync(PF)) fs.writeFileSync(PF, '[]');
const TOKEN = crypto.createHash('sha256').update('dk:' + PASS).digest('hex');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const clean = a => Array.isArray(a) ? a.slice(0, 500).map(p => ({
  id: +p.id || Date.now(), n: String(p.n || '').slice(0, 120), c: String(p.c || '').slice(0, 60), p: +p.p || 0, o: +p.o || null,
  e: String(p.e || '🛍️').slice(0, 8),
  bg: /^linear-gradient\([\w#%(),.\s-]+\)$/.test(p.bg) ? p.bg : 'linear-gradient(160deg,#ffd6e6,#ff9fc3)',
  t: p.t ? String(p.t).slice(0, 30) : null,
  s: (Array.isArray(p.s) && p.s.length ? p.s : ['One size']).slice(0, 20).map(x => String(x).slice(0, 20)),
  ...(typeof p.img === 'string' && /^\/uploads\/[\w.-]+$/.test(p.img) ? { img: p.img } : {})
})) : null;

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let b = '', n = 0; req.on('data', c => { n += c.length; if (n > 8e6) { no(new Error('big')); req.destroy(); } else b += c; }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } }); });
const isAdmin = req => req.headers['x-admin-token'] === TOKEN;

async function api(req, res, url) {
  if (req.method === 'GET' && url === '/api/products') return send(res, 200, JSON.parse(fs.readFileSync(PF, 'utf8')));
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const b = await body(req);
  if (url === '/api/login') return b.password === PASS ? send(res, 200, { token: TOKEN }) : send(res, 401, { error: 'Невірний пароль' });
  if (url === '/api/order') {
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 50);
    const txt = '🛍 Нове замовлення Darknezz.shop\n\n' + items.map(i => `• ${i.n} (${i.size}) × ${i.qty} — ${i.price} ₴`).join('\n') +
      `\n\nРазом: ${+b.total || 0} ₴\n${b.name}\n${b.tel}\n${b.city}, НП №${b.np}\n${b.pay}`;
    fs.appendFileSync(path.join(DATA, 'orders.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...b }) + '\n');
    if (BOT && CHAT) fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: CHAT, text: txt.slice(0, 4000) }) }).catch(e => console.error('Telegram:', e.message));
    else console.log(txt);
    return send(res, 200, { ok: true });
  }
  if (!isAdmin(req)) return send(res, 401, { error: 'Потрібен вхід адміністратора' });
  if (url === '/api/products') { const c = clean(b); if (!c) return send(res, 400, { error: 'bad data' }); fs.writeFileSync(PF, JSON.stringify(c, null, 1)); return send(res, 200, { ok: true }); }
  if (url === '/api/upload') {
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(b.data || '');
    if (!m) return send(res, 400, { error: 'Потрібне зображення' });
    const name = crypto.randomBytes(8).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
    fs.writeFileSync(path.join(UP, name), Buffer.from(m[2], 'base64'));
    return send(res, 200, { url: '/uploads/' + name });
  }
  send(res, 404, { error: 'not found' });
}

http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  try {
    if (url.startsWith('/api/')) return await api(req, res, url);
    const base = url.startsWith('/uploads/') ? UP : PUB;
    const file = path.join(base, url.startsWith('/uploads/') ? url.slice(9) : (url === '/' ? 'index.html' : url));
    if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { send(res, 500, { error: 'server error' }); }
}).listen(PORT, () => console.log(`Darknezz.shop: http://localhost:${PORT}  (адмінка: http://localhost:${PORT}/?admin)`));