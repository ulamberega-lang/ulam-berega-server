import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const WAIT_SEC = 35;         // זמן המתנה למענה באולם (לפני שהתא הקולי עונה)
const NO_ANSWER_EXT = '/9';  // שלוחת "אין מענה"
const REC_MAX_SEC = 5;       // אורך הקלטה מקסימלי (ההקלטה נעצרת רק בסולמית או בזמן הזה)
const PAGE_SIZE = 5;         // כמה אולמות להקריא בכל פעם

// ---------- עזרי ימות ----------
// ApiCallId מתחלף בכל מעבר שלוחה; ApiYFCallId קבוע לאורך כל השיחה
const params = (req) => {
  const q = { ...req.query, ...req.body };
  if (q.ApiYFCallId) q.ApiCallId = q.ApiYFCallId;
  return q;
};
const last = (v) => [].concat(v ?? '').pop();
const clean = (s) => String(s ?? '').replace(/[.,\-=&"'|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
const say = (parts) => [].concat(parts).flat().filter(Boolean).map((p) => `t-${clean(p)}`).join('.');
const bye = (...parts) => `id_list_message=${say([...parts, 'לְהִתְרָאוֹת'])}&go_to_folder=hangup`;

// read בהקשה: שם,להשתמש_בקיים,מקס,מינ,שניות,השמעה,חסימת*,חסימת0,החלפה,מקשים_מותרים (כוכבית מותרת = חזרה לתפריט)
const tap = (max, sec = 7, allowed = '') => `${max},1,${sec},No,no,no,,${allowed}`;
// read בהקלטה: שם,להשתמש_בקיים,record,תיקייה,קובץ,בלי_תפריט_אישור,שמירה_בניתוק,הוספה,מינ_שניות,מקס_שניות
const REC_DIR = '/8';
const recFile = (s) => `${s.id.slice(-8)}_${s.n + 1}`; // ask() מקדם את n, לכן +1
const rec = (s) => `record,${REC_DIR},${recFile(s)},no,,,,${REC_MAX_SEC}`;

// כל שאלה מקבלת שם משתנה חדש (v1, v2...) כי ימות שולחת בכל פנייה את כל מה שנאסף
function ask(s, parts, ops) {
  s.n++;
  s.t = Date.now();
  const text = say([s.note, ...parts]);
  s.note = null;
  return `read=${text}=v${s.n},no,${ops}`;
}

// ---------- זיהוי טקסט ----------
const norm = (s) => String(s ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function bestMatch(text, options) {
  const t = norm(text);
  if (t.length < 2) return null;
  const opts = options.map((o) => [o, norm(o)]).filter(([, n]) => n);
  // 1. התאמה מדויקת
  const exact = opts.find(([, n]) => n === t);
  if (exact) return exact[0];
  // שגיאת תמלול קטנה ("רמות אשקול")
  let close = null, bestD = Infinity;
  for (const [o, n] of opts) {
    const dist = lev(t, n);
    if (dist < bestD) { bestD = dist; close = [o, n]; }
  }
  if (close && bestD > Math.max(1, Math.floor(close[1].length / 4))) close = null;
  // 2. השם מופיע בתוך מה שנאמר ("בירושלים") - הארוך ביותר, כדי ש"רמות אשכול" לא ייתפס כ"רמות"
  const inside = opts.filter(([, n]) => t.includes(n)).sort((a, b) => b[1].length - a[1].length)[0];
  if (inside) return close && close[1].length > inside[1].length ? close[0] : inside[0];
  // 3. נאמר רק חלק מהשם ("מאה") - רק אם יש אפשרות אחת כזו
  const partial = opts.filter(([, n]) => n.includes(t));
  if (partial.length === 1 && t.length >= 3) return partial[0][0];
  // 4. שגיאת תמלול קטנה
  return close ? close[0] : null;
}


// ---------- Supabase ----------
const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();

// ---------- ניקוד לשמות מה-DB (טבלת pronunciations) ----------
let nikud = new Map();
async function loadNikud() {
  const { data, error } = await supabase.from('pronunciations').select('word, nikud');
  if (error) return console.error('nikud:', error.message);
  nikud = new Map(data.map((r) => [r.word.trim(), r.nikud]));
}
loadNikud();
setInterval(loadNikud, 10 * 60 * 1000);
// ביטוי שלם ("אולם כתר"), ואם אין - מילה-מילה ("אולם" + "כתר")
const pr = (name) => (name ? nikud.get(name.trim()) ?? name.split(' ').map((w) => nikud.get(w) ?? w).join(' ') : name);

async function getCities() {
  const { data, error } = await supabase.from('halls').select('city_name').eq('is_active', true);
  if (error) throw error;
  return uniq(data.map((r) => r.city_name));
}

async function getHoods(city) {
  const { data, error } = await supabase
    .from('halls').select('neighborhood_name').eq('is_active', true).eq('city_name', city);
  if (error) throw error;
  return uniq(data.map((r) => r.neighborhood_name));
}

// חריגה מותרת: אולם קטן מכמות המוזמנים עד המרווח הזה
const margin = (g) => (g <= 100 ? 30 : g <= 250 ? 50 : g <= 500 ? 100 : 200);

async function searchHalls(s) {
  let qb = supabase.from('halls').select('*')
    .eq('is_active', true).eq('city_name', s.city)
    .gte('max_guests', s.guests - margin(s.guests))
    .not('extension', 'is', null)
    .order('max_guests').order('name');
  if (s.hood) qb = qb.eq('neighborhood_name', s.hood);
  const { data, error } = await qb;
  if (error) throw error;
  return data;
}

async function logStart(q) {
  if (!q.ApiCallId) return;
  const { error } = await supabase.from('leads_log').upsert(
    { yemot_call_id: q.ApiCallId, caller_phone: q.ApiPhone || '', source: 'phone_ivr' },
    { onConflict: 'yemot_call_id' }
  );
  if (error) console.error('logStart:', error.message);
}

async function closeCall(callId) {
  if (!callId) return;
  const { data } = await supabase
    .from('leads_log').select('created_at, answered, hall_id, caller_phone, ended_at').eq('yemot_call_id', callId).maybeSingle();
  if (!data || data.ended_at) return; // כבר נסגרה - מונע מייל כפול
  const patch = {
    ended_at: new Date().toISOString(),
    duration_sec: Math.round((Date.now() - new Date(data.created_at).getTime()) / 1000),
  };
  const answered = data.hall_id && data.answered === null; // לא חזר לשלוחת "אין מענה"
  if (answered) patch.answered = true;
  await supabase.from('leads_log').update(patch).eq('yemot_call_id', callId);
  // מייל על שיחה שלא נענתה כבר נשלח משלוחת "אין מענה"
  if (answered) await mailGabbai({ ...data, ...patch }).catch((e) => console.error('mail:', e.message));
}

// ---------- מייל לאולם (Brevo) ----------
async function mailGabbai(call) {
  if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM) return;
  const { data: hall } = await supabase.from('halls').select('name, gabbai_email').eq('id', call.hall_id).maybeSingle();
  if (!hall?.gabbai_email) return;
  const when = new Date(call.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const status = call.answered ? 'השיחה הועברה אליך' : 'השיחה לא נענתה';
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM, name: 'גמ"ח אולם ברגע' },
      to: [{ email: hall.gabbai_email }],
      subject: `${call.answered ? 'שיחה' : 'שיחה שלא נענתה'} - ${hall.name}`,
      htmlContent: `<div dir="rtl" style="font-family:Arial">
        <p>שלום,</p>
        <p>התקבלה שיחה דרך גמ"ח אולם ברגע לאולם <b>${hall.name}</b>.</p>
        <p>מספר המתקשר: <b>${call.caller_phone || 'חסוי'}</b><br>מועד: ${when}<br>${status}</p>
        ${call.answered ? '' : '<p>מומלץ לחזור למתקשר.</p>'}
      </div>`,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

// ---------- ניתוב לאולם ----------
async function routeByExt(q, ext) {
  const { data: hall } = await supabase
    .from('halls').select('*').eq('is_active', true).eq('extension', String(ext)).maybeSingle();
  if (!hall) return null;

  const s = sessions.get(q.ApiCallId);
  if (s) s.routed = true; // אם האולם לא יענה - נחזור לרשימה
  const phone = (hall.gabbai_phone || '').replace(/\D/g, '');
  await supabase.from('leads_log').upsert({
    yemot_call_id: q.ApiCallId,
    caller_phone: q.ApiPhone || '',
    source: 'phone_ivr',
    hall_id: hall.id,
    called_phone: phone,
    answered: null, // ניסיון חדש (אחרי אולם שלא ענה)
  }, { onConflict: 'yemot_call_id' });

  const info = say([
    pr(hall.name),
    hall.neighborhood_name && `שְׁכוּנַת ${pr(hall.neighborhood_name)}`,
    hall.address,
    hall.max_guests && `עַד ${hall.max_guests} אוֹרְחִים`,
    `מִסְפַּר הַשְּׁלוּחָה שֶׁל הָאוּלָם ${hall.extension}`, // כדי שבפעם הבאה יוכלו להקיש ישירות
    'מַעֲבִיר לָאוּלָם',
  ]);
  // ערכי routing לפי הסדר: 1 מספר ... 9 זמן המתנה, 10 מעבר בסיום
  const routing = [phone, '', '', '', '', '', '', '', WAIT_SEC, NO_ANSWER_EXT].join(',');
  return `id_list_message=${info}&routing=${routing}`;
}

// ---------- תמלול (OpenAI) ----------
const RECORD_STEPS = new Set(['city', 'hoodSay']);
const YEMOT_API = process.env.YEMOT_API || 'https://private.call2all.co.il/ym/api';

async function transcribe(s) {
  const t0 = Date.now();
  // רשימת השמות נטענת במקביל להורדה
  const namesP = s.step === 'city' ? getCities() : Promise.resolve(s.hoods);
  const path = `ivr2:${REC_DIR}/${s.id.slice(-8)}_${s.n}.wav`;
  const token = encodeURIComponent(process.env.YEMOT_TOKEN);
  const file = await fetch(`${YEMOT_API}/DownloadFile?token=${token}&path=${encodeURIComponent(path)}`);
  const type = file.headers.get('content-type') || '';
  if (!file.ok || type.includes('json') || type.includes('text')) {
    console.error('download:', file.status, (await file.text()).slice(0, 200));
    return null;
  }
  const audio = await file.blob();
  const t1 = Date.now();
  // מוחקים את ההקלטה מימות (לא חוסם את השיחה; נרשם בלוג אם נכשל)
  fetch(`${YEMOT_API}/FileAction?token=${token}&action=delete&what=${encodeURIComponent(path)}`)
    .then((r) => r.json()).then((j) => { if (!j.success) console.error('delete:', JSON.stringify(j).slice(0, 200)); })
    .catch((e) => console.error('delete:', e.message));

  // רשימת השמות האפשריים משפרת את הזיהוי
  const names = await namesP;
  const form = new FormData();
  form.append('file', audio, 'answer.wav');
  form.append('model', 'gpt-transcribe');
  form.append('languages[]', 'he'); // ב-gpt-transcribe מחליף את language
  form.append('prompt', `מתקשר אומר שם של ${s.step === 'city' ? 'עיר' : 'שכונה'} בישראל`);
  for (const n of names) form.append('keywords[]', n.replace(/[<>\r\n]/g, ''));
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) { console.error('openai:', res.status, await res.text()); return null; }
  const text = (await res.json()).text || '';
  console.log(`זמנים: מהשאלה ${t0 - s.t}ms | הורדה ${t1 - t0}ms | תמלול ${Date.now() - t1}ms | "${text}"`);
  return text;
}

// ---------- מצב שיחה ----------
const sessions = new Map(); // ApiCallId -> מצב
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, s] of sessions) if (s.t < cutoff) sessions.delete(k);
}, 10 * 60 * 1000);

const HOOD_PAGE = 8; // שכונות בכל עמוד (9 = עוד שכונות)
const CONFIRM = ['לְאִישּׁוּר הַקֵּשׁ 1', 'לְתִיקּוּן הַקֵּשׁ 2'];

function reset(s) {
  Object.assign(s, { step: 'menu', page: 0, hoodPage: 0, guests: null, city: null, hood: null });
}

async function prompt(s) {
  switch (s.step) {
    case 'menu':
      return ask(s, ['בְּרוּכִים הַבָּאִים לֶגְמַ״ח אוּלָם בֶּרֶגַע', 'לְחִיפּוּשׂ אוּלָם הַקֵּשׁ 1',
        'אִם יָדוּעַ לְךָ מִסְפַּר הַשְּׁלוּחָה שֶׁל הָאוּלָם הַקֵּשׁ 2'], tap(1));
    case 'extEntry':
      return ask(s, ['הַקֵּשׁ אֶת מִסְפַּר הַשְּׁלוּחָה שֶׁל הָאוּלָם וּבְסִיּוּם סוּלָמִית'], tap(4, 7));
    case 'guests': {
      // הודעה חד-פעמית על כוכבית, לפני השאלה הראשונה בחיפוש
      const hint = !s.hinted && 'בְּכָל שָׁלָב אֶפְשָׁר לַחֲזוֹר לַתַּפְרִיט הָרָאשִׁי בְּהַקָּשַׁת כּוֹכָבִית';
      s.hinted = true;
      return ask(s, [hint, 'הַקֵּשׁ אֶת כַּמּוּת הַמּוּזְמָנִים הַמְּשׁוֹעֶרֶת וּבְסִיּוּם סוּלָמִית'], tap(4, 7));
    }
    case 'guestsOk':
      return ask(s, [`הֵבַנְתִּי ${s.guests} מוּזְמָנִים`, ...CONFIRM], tap(1));
    case 'city':
      return ask(s, ['אֱמוֹר אֶת שֵׁם הָעִיר אַחֲרֵי הַצְּלִיל וּבְסִיּוּם הַקֵּשׁ סוּלָמִית'], rec(s));
    case 'cityOk':
      return ask(s, [`הֵבַנְתִּי ${pr(s.city)}`, ...CONFIRM], tap(1));
    case 'cityMenu': {
      s.cities = await getCities();
      const from = s.cityPage * HOOD_PAGE;
      s.cityMore = s.cities.length > from + HOOD_PAGE;
      return ask(s, ['בְּאֵיזוֹ עִיר',
        ...s.cities.slice(from, from + HOOD_PAGE).map((c, i) => `לְ${pr(c)} הַקֵּשׁ ${i + 1}`),
        s.cityMore && 'לְעָרִים נוֹסָפוֹת הַקֵּשׁ 9'], tap(1));
    }
    case 'hood':
      s.hoods = await getHoods(s.city);
      if (!s.hoods.length) { s.step = 'results'; s.page = 0; return prompt(s); }
      return ask(s, ['לַאֲמִירַת שֵׁם הַשְּׁכוּנָה הַקֵּשׁ 1', 'לִבְחִירַת שְׁכוּנָה מֵרְשִׁימָה הַקֵּשׁ 2',
        'לְחִיפּוּשׂ בְּכָל הָעִיר הַקֵּשׁ 0'], tap(1));
    case 'hoodSay':
      return ask(s, ['אֱמוֹר אֶת שֵׁם הַשְּׁכוּנָה אַחֲרֵי הַצְּלִיל וּבְסִיּוּם הַקֵּשׁ סוּלָמִית'], rec(s));
    case 'hoodOk':
      return ask(s, [`הֵבַנְתִּי שְׁכוּנַת ${pr(s.hood)}`, ...CONFIRM], tap(1));
    case 'hoodMenu': {
      const from = s.hoodPage * HOOD_PAGE;
      const page = s.hoods.slice(from, from + HOOD_PAGE);
      s.hoodMore = s.hoods.length > from + HOOD_PAGE;
      return ask(s, ['בְּאֵיזוֹ שְׁכוּנָה',
        ...page.map((h, i) => `לְ${pr(h)} הַקֵּשׁ ${i + 1}`),
        s.hoodMore && 'לִשְׁכוּנוֹת נוֹסָפוֹת הַקֵּשׁ 9',
        'לְכָל הָעִיר הַקֵּשׁ 0'], tap(1));
    }
    case 'noResults':
      return ask(s, [`לֹא נִמְצְאוּ אוּלַמּוֹת בְּ${pr(s.city)} לְ${s.guests} מוּזְמָנִים`,
        'לְשִׁינּוּי כַּמּוּת הַמּוּזְמָנִים הַקֵּשׁ 1', 'לְשִׁינּוּי הָעִיר הַקֵּשׁ 2',
        'לַתַּפְרִיט הָרָאשִׁי הַקֵּשׁ כּוֹכָבִית'], tap(1));
    case 'results':
      return resultsPrompt(s);
  }
}

async function resultsPrompt(s) {
  const halls = await searchHalls(s);
  if (!halls.length) {
    if (s.hood) {
      s.note = `לֹא נִמְצְאוּ אוּלַמּוֹת מַתְאִימִים בִּשְׁכוּנַת ${pr(s.hood)}`;
      s.hood = null;
      s.step = 'hood';
      return prompt(s);
    }
    s.step = 'noResults';
    return prompt(s);
  }
  const from = s.page * PAGE_SIZE;
  const page = halls.slice(from, from + PAGE_SIZE);
  s.more = halls.length > from + PAGE_SIZE;

  const parts = [];
  if (s.page === 0) parts.push(halls.length === 1 ? 'נִמְצָא אוּלָם אֶחָד' : `נִמְצְאוּ ${halls.length} אוּלַמּוֹת`);
  // כל אולם בעמוד מקבל מקש אחד (1-5) - תגובה מיידית בלי המתנה לספרות נוספות
  s.pageExts = page.map((h) => h.extension);
  page.forEach((h, i) => {
    parts.push(pr(h.name), h.neighborhood_name && `בִּשְׁכוּנַת ${pr(h.neighborhood_name)}`,
      `עַד ${h.max_guests} אוֹרְחִים`, `לְמַעֲבָר לָאוּלָם הַקֵּשׁ ${i + 1}`);
  });
  if (s.more) parts.push('לְאוּלַמּוֹת נוֹסָפִים הַקֵּשׁ 9');
  if (s.hood) parts.push('לְחִיפּוּשׂ בִּשְׁכוּנָה נוֹסֶפֶת הַקֵּשׁ 0');
  parts.push('לִשְׁמִיעָה חוֹזֶרֶת הַקֵּשׁ 8');
  return ask(s, parts, tap(1));
}

// מספר ראשון מתוך הטקסט ("בערך 1,200 או 1300" -> 1200)
function parseGuests(raw) {
  const m = String(raw ?? '').replace(/(\d)[,.](?=\d{3}\b)/g, '$1').match(/\d+/);
  return m ? Number(m[0]) : NaN;
}

async function handle(s, q, val, raw) {
  const go = (step) => { s.step = step; return prompt(s); };
  // טעות = הודעה ושאלה חוזרת, בלי הגבלה
  const fail = (note) => { s.note = note; return prompt(s); };
  const confirm = (okStep, fixStep) => (val === '1' ? go(okStep) : val === '2' ? go(fixStep) : fail('לֹא הֵבַנְתִּי'));

  // כוכבית בכל שלב = חזרה לתפריט הראשי (לא נספר כטעות)
  if (val.includes('*')) { reset(s); return prompt(s); }
  if (!val) return fail('לֹא נִשְׁמְעָה תְּשׁוּבָה');

  switch (s.step) {
    case 'menu':
      if (val === '1') return go('guests');
      if (val === '2') return go('extEntry');
      return fail('בְּחִירָה לֹא תְּקִינָה');
    case 'extEntry':
      return (await routeByExt(q, val)) ?? fail(`שְׁלוּחָה ${val} לֹא קַיֶּימֶת`);

    case 'guests': {
      const n = parseGuests(raw);
      if (!(n >= 1 && n <= 5000)) return fail('לֹא הֵבַנְתִּי אֶת הַמִּסְפָּר');
      s.guests = n;
      return go('guestsOk');
    }
    case 'guestsOk':
      return confirm('city', 'guests');

    case 'city': {
      const city = bestMatch(val, await getCities());
      if (!city) return fail(`לֹא נִמְצְאוּ אוּלַמּוֹת בְּ${val}`); // חוזרים על מה שנשמע כדי שהמתקשר ידע מה הובן
      s.city = city;
      return go('cityOk');
    }
    case 'cityOk':
      return confirm('hood', 'city');
    case 'cityMenu': {
      if (val === '9' && s.cityMore) { s.cityPage++; return go('cityMenu'); }
      const n = Number(val);
      const c = n >= 1 && n <= HOOD_PAGE ? s.cities[s.cityPage * HOOD_PAGE + n - 1] : null;
      if (!c) return fail('בְּחִירָה לֹא תְּקִינָה');
      s.city = c;
      return go('hood');
    }

    case 'hood':
      s.page = 0;
      s.hoodPage = 0;
      if (val === '0') { s.hood = null; return go('results'); }
      if (val === '1') return go('hoodSay');
      if (val === '2') return go('hoodMenu');
      return fail('בְּחִירָה לֹא תְּקִינָה');
    case 'hoodSay': {
      const hood = bestMatch(val, s.hoods);
      if (hood) { s.hood = hood; return go('hoodOk'); }
      s.note = `לֹא נִמְצְאוּ אוּלַמּוֹת בִּשְׁכוּנַת ${val}`;
      return go('hoodMenu');
    }
    case 'hoodOk':
      return confirm('results', 'hoodSay');
    case 'hoodMenu': {
      s.page = 0;
      if (val === '0') { s.hood = null; return go('results'); }
      if (val === '9' && s.hoodMore) { s.hoodPage++; return go('hoodMenu'); }
      const n = Number(val);
      const h = n >= 1 && n <= HOOD_PAGE ? s.hoods[s.hoodPage * HOOD_PAGE + n - 1] : null;
      if (!h) return fail('בְּחִירָה לֹא תְּקִינָה');
      s.hood = h;
      return go('results');
    }

    case 'noResults':
      if (val === '1') return go('guests');
      if (val === '2') return go('city');
      return fail('בְּחִירָה לֹא תְּקִינָה');

    case 'results':
      if (s.pageExts?.[Number(val) - 1]) return (await routeByExt(q, s.pageExts[Number(val) - 1])) ?? fail('בְּחִירָה לֹא תְּקִינָה');
      if (val === '9') {
        if (s.more) { s.page++; return go('results'); }
        s.note = 'אֵין אוּלַמּוֹת נוֹסָפִים';
        return prompt(s);
      }
      if (val === '8') return go('results');
      if (val === '0' && s.hood) { s.hood = null; s.hoodPage = 0; return go('hood'); }
      return fail('בְּחִירָה לֹא תְּקִינָה');
  }
  reset(s);
  return prompt(s);
}

// ---------- נתיבים ----------
app.get('/health', (req, res) => res.send('ok')); // לפינג נגד שינה של Render

app.all('/api/ivr', async (req, res) => {
  const q = params(req);
  res.type('text/plain; charset=utf-8');
  const id = q.ApiCallId;
  try {
    if (q.hangup === 'yes') { sessions.delete(id); await closeCall(id); return res.send(''); }

    let s = sessions.get(id);
    if (!s) {
      await logStart(q);
      // כניסה ישירה משלוחת אולם בימות (api_add_0=ext=101)
      const ext = last(q.ext);
      if (ext) return res.send((await routeByExt(q, ext)) ?? bye('שְׁלוּחָה לֹא קַיֶּימֶת'));

      s = { id, n: 0, t: Date.now() };
      reset(s);
      // אם השרת אותחל באמצע שיחה - ממשיכים ממספור המשתנים הקיים ומודיעים על חזרה לתפריט
      const used = Object.keys(q).map((k) => /^v(\d+)$/.exec(k)?.[1]).filter(Boolean).map(Number);
      if (used.length) { s.n = Math.max(...used); s.note = 'נַחֲזוֹר לַתַּפְרִיט הָרָאשִׁי'; }
      sessions.set(id, s);
      return res.send(await prompt(s));
    }

    // חזרה מ"אין מענה" - משמיעים שוב את רשימת האולמות
    if (s.back) {
      s.back = false; s.routed = false;
      if (s.step !== 'results') reset(s); // נכנס לפי מספר שלוחה - חוזר לתפריט הראשי
      return res.send(await prompt(s));
    }

    let raw = String(last(q[`v${s.n}`]) ?? '');
    // בשלבי דיבור ימות רק מקליטה - מתמללים בעצמנו
    if (RECORD_STEPS.has(s.step) && !raw.includes('*')) {
      raw = await transcribe(s).catch((e) => { console.error('transcribe:', e.message); return null; });
      // התמלול נכשל (למשל נגמרה היתרה ב-OpenAI) - עוברים לבחירה מרשימה בהקשה
      if (raw === null) {
        s.note = 'בְּחַר מֵהָרְשִׁימָה';
        if (s.step === 'city') { s.cityPage = 0; s.step = 'cityMenu'; } else { s.hoodPage = 0; s.step = 'hoodMenu'; }
        return res.send(await prompt(s));
      }
    }
    return res.send(await handle(s, q, clean(raw), raw));
  } catch (err) {
    console.error('שגיאה בשרת:', err);
    return res.send(bye('תַּקָּלָה בַּמַּעֲרֶכֶת נַסֵּה שׁוּב מְאוּחָר יוֹתֵר'));
  }
});

app.all('/api/ivr/no-answer', async (req, res) => {
  const q = params(req);
  res.type('text/plain; charset=utf-8');
  const id = q.ApiCallId;
  try {
    if (q.hangup === 'yes') { sessions.delete(id); await closeCall(id); return res.send(''); }
    const { data } = await supabase.from('leads_log').update({ answered: false })
      .eq('yemot_call_id', id).select('created_at, hall_id, caller_phone').maybeSingle();
    if (data?.hall_id) mailGabbai({ ...data, answered: false }).catch((e) => console.error('mail:', e.message));
    // חוזרים לשלב שממנו נבחר האולם (רשימת האולמות או התפריט)
    const s = sessions.get(id);
    if (s?.routed) {
      s.back = true;
      return res.send(`id_list_message=${say('אֵין מַעֲנֶה בָּאוּלָם')}&go_to_folder=/`);
    }
    return res.send(bye('אֵין מַעֲנֶה בָּאוּלָם נַסֵּה שׁוּב מְאוּחָר יוֹתֵר'));
  } catch (err) {
    console.error('no-answer:', err);
    return res.send(bye('אֵין מַעֲנֶה בָּאוּלָם'));
  }
});

// Render החינמי נרדם אחרי 15 דקות בלי בקשות - פינג עצמי כל 10 דקות
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => fetch(`${process.env.RENDER_EXTERNAL_URL}/health`).catch(() => {}), 10 * 60 * 1000);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
