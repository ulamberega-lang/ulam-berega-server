// שרת דמה לאתר הניהול: מגיש את public/admin ועונה ל-/admin/api/* עם נתונים מדומים (בלי Supabase).
// הרצה: node dev/mock-admin.mjs   (פורט 4173, או MOCK_PORT). הכתובת: http://localhost:4173/admin/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'admin');
const port = Number(process.env.MOCK_PORT) || 4173;

// 20 אולמות בחמש ערים; שלוחות 102 עד 121; שניים מושבתים
const cities = [['ירושלים', ['גאולה', 'רמות', 'בית וגן', 'הר נוף']], ['בני ברק', ['זכרון מאיר', 'פרדס כץ']],
  ['בית שמש', ['רמה ב', 'רמה א']], ['אלעד', ['']], ['מודיעין עילית', ['']]];
const names = ['פאר', 'היכל', 'גן עדן', 'נווה', 'שמחה', 'אור'];
const halls = [];
let id = 1;
for (const [city, hoods] of cities) {
  for (const hood of hoods) {
    for (let i = 0; i < 2; i++) {
      halls.push({
        id: id++, name: `אולם ${names[id % 6]} ${id}`, city_name: city, neighborhood_name: hood, address: `רחוב ${id} ${id}`,
        max_guests: 150 + id * 20, extension: String(100 + id), gabbai_phone: `05270${String(10000 + id * 7)}`.slice(0, 10),
        gabbai_email: '', is_active: id % 9 !== 0,
      });
    }
  }
}

const rnd = (n) => ((n * 9301 + 49297) % 233280) / 233280; // "אקראי" קבוע, כדי שהבדיקות יהיו יציבות
const stats = halls.filter((h) => h.id % 5 !== 0).map((h) => {
  const total = Math.floor(rnd(h.id) * 60) + 1;
  const answered = Math.floor(total * rnd(h.id + 3));
  return { hall_id: h.id, total, answered, unanswered: total - answered - (h.id % 3), last_call: total ? new Date(Date.now() - h.id * 3600e3 * 7).toISOString() : null };
});

function days(from, to, hall) {
  const out = [];
  for (const d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.getUTCDate();
    if (k % 4 === 0) continue;
    const c = 10 + k * 3;
    out.push({ day: d.toISOString().slice(0, 10), calls: hall ? 0 : c, reached: hall ? Math.floor(c / 4) : Math.floor(c * 0.8),
      answered: hall ? Math.floor(c / 6) : Math.floor(c * 0.5), unanswered: hall ? Math.floor(c / 12) : Math.floor(c * 0.2) });
  }
  return out;
}

const calls = Array.from({ length: 500 }, (_, i) => {
  const h = i % 7 === 0 ? null : halls[(i * 3) % halls.length];
  const answered = h ? (i % 3 === 0 ? false : i % 11 === 0 ? null : true) : null;
  return { id: i, created_at: new Date(Date.now() - i * 3600e3 * 2.3).toISOString(),
    caller_phone: i % 13 === 0 ? '' : `05${i % 5}${String(1000000 + i * 137).slice(0, 7)}`,
    hall_id: h?.id ?? null, answered, dial_status: answered === false ? ['CANCEL', 'BUSY', 'CONGESTION'][i % 3] : null,
    duration_sec: answered ? 30 + (i % 300) : null };
});

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (data) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };

  // שמירת אולם: מחזיר את מה שנשלח, אחרי השהיה קצרה (כדי לראות את מצב "שומר...")
  if (req.method !== 'GET' && url.pathname.startsWith('/admin/api/halls')) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => setTimeout(() => json(JSON.parse(body || '{}')), 300));
    return;
  }
  if (url.pathname === '/admin/api/halls') return json(halls);
  if (url.pathname === '/admin/api/stats/halls') return json(stats);
  if (url.pathname === '/admin/api/stats/days') return json(days(url.searchParams.get('from'), url.searchParams.get('to'), url.searchParams.get('hall')));
  if (url.pathname === '/admin/api/calls') {
    const hall = url.searchParams.get('hall');
    return json(calls.filter((c) => !hall || String(c.hall_id) === hall));
  }

  const file = path.join(root, url.pathname.replace(/^\/admin\/?/, '') || 'index.html');
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    return res.end('not found');
  }
  res.setHeader('content-type', types[path.extname(file)] || 'text/plain');
  res.end(fs.readFileSync(file));
}).listen(port, () => console.log(`http://localhost:${port}/admin/`));
