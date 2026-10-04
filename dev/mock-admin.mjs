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
  const unanswered = total - answered - (h.id % 3);
  return { hall_id: h.id, total, answered, unanswered, cancelled: Math.floor(unanswered / 3), busy: h.id % 2, failed: h.id % 3 === 0 ? 1 : 0 };
});

function days(from, to, hall) {
  const out = [];
  for (const d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.getUTCDate();
    if (k % 4 === 0) continue;
    const c = 10 + k * 3;
    out.push({ day: d.toISOString().slice(0, 10), calls: hall ? 0 : c, reached: hall ? Math.floor(c / 4) : Math.floor(c * 0.8),
      answered: hall ? Math.floor(c / 6) : Math.floor(c * 0.5), unanswered: hall ? Math.floor(c / 12) : Math.floor(c * 0.2),
      cancelled: Math.floor(c / 14), busy: k % 3 === 0 ? 2 : 0, failed: k % 5 === 0 ? 1 : 0 });
  }
  return out;
}

const calls = Array.from({ length: 500 }, (_, i) => {
  const h = i % 7 === 0 ? null : halls[(i * 3) % halls.length];
  const answered = h ? (i % 3 === 0 ? false : i % 11 === 0 ? null : true) : null;
  return { id: i, created_at: new Date(Date.now() - i * 3600e3 * 2.3).toISOString(),
    caller_phone: i % 13 === 0 ? '' : `05${i % 5}${String(1000000 + i * 137).slice(0, 7)}`,
    hall_id: h?.id ?? null, answered, dial_status: answered === false ? ['CANCEL', 'BUSY', 'CONGESTION'][i % 3] : answered && i % 17 !== 0 ? 'ANSWER' : null,
    duration_sec: answered ? 30 + (i % 300) : null, answer_sec: answered && i % 17 !== 0 ? 10 + (i % 200) : null };
});

// הודעות קוליות מדומות (בזיכרון: סימון "טופל" ומחיקה עובדים עד הפעלה מחדש)
const makeVoicemails = () => Array.from({ length: 8 }, (_, i) => ({
  id: i + 1, created_at: new Date(Date.now() - i * 3600e3 * 7).toISOString(),
  caller_phone: i % 4 === 3 ? '' : `05${i % 5}${String(2000000 + i * 311).slice(0, 7)}`,
  yemot_path: `ivr2:/8/vm_${i}.wav`, handled: i % 3 === 0 && i > 0 }));
let voicemails = makeVoicemails();
const makePronunciations = () => [{ word: 'ירושלים', nikud: 'יְרוּשָׁלַיִם' }, { word: 'אולם', nikud: 'אוּלָם' }, { word: 'שמחה', nikud: 'שִׂמְחָה' }];
let pronunciations = makePronunciations();
const mails = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1, hall_id: i + 1, created_at: new Date(Date.now() - i * 3600e3 * 5).toISOString(), hall_name: `אולם ${['שמחה', 'גן עדן', 'היכל', 'פאר', 'נוף', 'כתר'][i]}`,
  to_email: i === 4 ? '' : `hall${i}@example.com`, caller_phone: i === 2 ? '' : `052${1000000 + i * 4111}`, answered: i % 2 === 0,
  status: i === 4 ? 'no_email' : i === 3 ? 'failed' : 'sent', error: i === 3 ? '401 {"message":"Key not found"}' : '' }));
// WAV של חצי שנייה שקט (8kHz, 16 סיביות), לבדיקת הנגן
const silentWav = (() => {
  const samples = 4000, data = Buffer.alloc(samples * 2), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(8000, 24); h.writeUInt32LE(16000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
})();

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (data) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };

  if (url.pathname === '/__reset') { voicemails = makeVoicemails(); pronunciations = makePronunciations(); return json({ ok: true }); } // מחזיר את הנתונים המשתנים למצב ההתחלתי
  if (url.pathname === '/admin/api/pronunciations' || url.pathname === '/admin/api/pronunciations/suggest') {
    if (req.method === 'GET') return json(pronunciations);
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    return req.on('end', () => {
      const data = JSON.parse(body || '{}');
      if (url.pathname.endsWith('/suggest')) { // שתי אפשרויות לכל שם (שונות מהקודמות)
        const marks = ['\u05B8', '\u05B6', '\u05B4', '\u05B7', '\u05B5', '\u05B9'];
        return setTimeout(() => json({ suggestions: Object.fromEntries(data.items.map((i) => {
          const seen = data.previous?.[i.text] ?? [];
          const list = marks.map((m) => `${i.text}${m}`).filter((x) => !seen.includes(x)).slice(0, 2);
          return [i.text, list];
        })) }), 300); // השהיה קצרה, כדי לראות את חיווי הטעינה
      }
      pronunciations = pronunciations.filter((p) => p.word !== data.word);
      if (data.nikud) pronunciations.push({ word: data.word, nikud: data.nikud });
      return json({ word: data.word, nikud: data.nikud ?? '' });
    });
  }
  if (url.pathname === '/admin/api/mails') return json(mails);

  const vm = /^\/admin\/api\/voicemails(?:\/(\d+)(\/audio)?)?$/.exec(url.pathname);
  if (vm) {
    const id = Number(vm[1]);
    if (vm[2]) { res.setHeader('content-type', 'audio/wav'); return res.end(silentWav); }
    if (req.method === 'GET') return json(voicemails);
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    return req.on('end', () => {
      if (req.method === 'PUT') { const row = voicemails.find((v) => v.id === id); row.handled = Boolean(JSON.parse(body).handled); return json(row); }
      voicemails = voicemails.filter((v) => v.id !== id);
      return json({ ok: true });
    });
  }

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
