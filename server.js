import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const WAIT_SEC = 30;         // זמן המתנה למענה הגבאי
const NO_ANSWER_EXT = '/9';  // שלוחת "אין מענה"
const GUEST_MARGIN = 30;     // חריגה מותרת: אולם קטן עד 30 איש מכמות המוזמנים
const PAGE_SIZE = 5;         // כמה אולמות להקריא בכל פעם
const MAX_TRIES = 3;         // ניסיונות לפני ניתוק

// ---------- עזרי ימות ----------
const params = (req) => ({ ...req.query, ...req.body });
const last = (v) => [].concat(v ?? '').pop();
const clean = (s) => String(s ?? '').replace(/[.,\-=&"'|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
const say = (parts) => [].concat(parts).flat().filter(Boolean).map((p) => `t-${clean(p)}`).join('.');
const bye = (...parts) => `id_list_message=${say([...parts, 'לְהִתְרָאוֹת'])}&go_to_folder=hangup`;
const digits = (n) => String(n).split('').join(' '); // "101" -> "1 0 1" כדי שיוקרא ספרה-ספרה

// read בהקשה: שם,להשתמש_בקיים,מקס,מינ,שניות,השמעה,חסימת*,חסימת0,החלפה,מקשים_מותרים (כוכבית מותרת = חזרה לתפריט)
const tap = (max, sec = 7, allowed = '') => `${max},1,${sec},No,no,no,,${allowed}`;
// read בזיהוי דיבור: שם,להשתמש_בקיים,voice,שפה,חסימת_הקשה('no' = דיבור בלבד),מקס_ספרות
const stt = (maxDigits = '', voiceOnly = false) => `voice,,${voiceOnly ? 'no' : ''},${maxDigits}`;

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
  let best = null, bestD = Infinity;
  for (const o of options) {
    const n = norm(o);
    if (!n) continue;
    if (n === t || t.includes(n) || n.includes(t)) return o;
    const dist = lev(t, n);
    if (dist < bestD) { bestD = dist; best = o; }
  }
  return best && bestD <= Math.max(1, Math.floor(norm(best).length / 4)) ? best : null;
}

const isNo = (v) => /^(לא|אין|כל העיר|לא תודה|0)$/.test(clean(v));
const isYes = (v) => /^(כן|יש)$/.test(clean(v));

// ---------- Supabase ----------
const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();

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

async function searchHalls(s) {
  let qb = supabase.from('halls').select('*')
    .eq('is_active', true).eq('city_name', s.city)
    .gte('max_guests', s.guests - GUEST_MARGIN)
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
    .from('leads_log').select('created_at, answered, hall_id').eq('yemot_call_id', callId).maybeSingle();
  if (!data) return;
  const patch = {
    ended_at: new Date().toISOString(),
    duration_sec: Math.round((Date.now() - new Date(data.created_at).getTime()) / 1000),
  };
  if (data.hall_id && data.answered === null) patch.answered = true; // לא חזר לשלוחת "אין מענה"
  await supabase.from('leads_log').update(patch).eq('yemot_call_id', callId);
}

// ---------- ניתוב לאולם ----------
async function routeByExt(q, ext) {
  const { data: hall } = await supabase
    .from('halls').select('*').eq('is_active', true).eq('extension', String(ext)).maybeSingle();
  if (!hall) return null;

  sessions.delete(q.ApiCallId);
  const phone = (hall.gabbai_phone || '').replace(/\D/g, '');
  await supabase.from('leads_log').upsert({
    yemot_call_id: q.ApiCallId,
    caller_phone: q.ApiPhone || '',
    source: 'phone_ivr',
    hall_id: hall.id,
    called_phone: phone,
  }, { onConflict: 'yemot_call_id' });

  const info = say([
    hall.name,
    hall.neighborhood_name && `שְׁכוּנַת ${hall.neighborhood_name}`,
    hall.address,
    hall.max_guests && `עַד ${hall.max_guests} אוֹרְחִים`,
    'מַעֲבִיר לַגַּבַּאי',
  ]);
  // ערכי routing לפי הסדר: 1 מספר ... 9 זמן המתנה, 10 מעבר בסיום
  const routing = [phone, '', '', '', '', '', '', '', WAIT_SEC, NO_ANSWER_EXT].join(',');
  return `id_list_message=${info}&routing=${routing}`;
}

// ---------- מצב שיחה ----------
const sessions = new Map(); // ApiCallId -> מצב
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, s] of sessions) if (s.t < cutoff) sessions.delete(k);
}, 10 * 60 * 1000);

const HOOD_PAGE = 8; // שכונות בכל עמוד (9 = עוד שכונות)
const MAX_RESETS = 2; // כמה פעמים לחזור לתפריט לפני ניתוק
const CONFIRM = ['לְאִישּׁוּר הַקֵּשׁ 1', 'לְתִיקּוּן הַקֵּשׁ 2'];

function reset(s) {
  Object.assign(s, { step: 'menu', tries: 0, page: 0, hoodPage: 0, guests: null, city: null, hood: null });
}

async function prompt(s) {
  switch (s.step) {
    case 'menu':
      return ask(s, ['בְּרוּכִים הַבָּאִים לֶגְמַ״ח אוּלָם בֶּרֶגַע', 'לְחִיפּוּשׂ אוּלָם הַקֵּשׁ 1',
        'אִם יָדוּעַ לְךָ מִסְפַּר הַשְּׁלוּחָה שֶׁל הָאוּלָם הַקֵּשׁ אוֹתוֹ עַכְשָׁיו'], tap(4, 3));
    case 'guests':
      return ask(s, ['מָה כַּמּוּת הַמּוּזְמָנִים הַמְּשׁוֹעֶרֶת'], stt(4));
    case 'guestsOk': {
      // ההודעה על כוכבית כאן ולא בשאלת המוזמנים, כי שם אין הקשה
      const hint = !s.hinted && 'בְּכָל שָׁלָב אֶפְשָׁר לַחֲזוֹר לַתַּפְרִיט הָרָאשִׁי בְּהַקָּשַׁת כּוֹכָבִית';
      s.hinted = true;
      return ask(s, [`הֵבַנְתִּי ${s.guests} מוּזְמָנִים`, hint, ...CONFIRM], tap(1));
    }
    case 'city':
      return ask(s, ['בְּאֵיזוֹ עִיר'], stt());
    case 'cityOk':
      return ask(s, [`הֵבַנְתִּי ${s.city}`, ...CONFIRM], tap(1));
    case 'hood':
      s.hoods = await getHoods(s.city);
      if (!s.hoods.length) { s.step = 'results'; s.page = 0; return prompt(s); }
      return ask(s, ['הַאִם יֵשׁ שְׁכוּנָה מְסוּיֶּמֶת', 'אִם כֵּן אֱמוֹר אֶת שֵׁם הַשְּׁכוּנָה',
        'לְחִיפּוּשׂ בְּכָל הָעִיר הַקֵּשׁ 0'], stt(1));
    case 'hoodOk':
      return ask(s, [`הֵבַנְתִּי שְׁכוּנַת ${s.hood}`, ...CONFIRM], tap(1));
    case 'hoodMenu': {
      const from = s.hoodPage * HOOD_PAGE;
      const page = s.hoods.slice(from, from + HOOD_PAGE);
      s.hoodMore = s.hoods.length > from + HOOD_PAGE;
      return ask(s, ['בְּאֵיזוֹ שְׁכוּנָה',
        ...page.map((h, i) => `לְ${h} הַקֵּשׁ ${i + 1}`),
        s.hoodMore && 'לִשְׁכוּנוֹת נוֹסָפוֹת הַקֵּשׁ 9',
        'לְכָל הָעִיר הַקֵּשׁ 0'], tap(1));
    }
    case 'noResults':
      return ask(s, [`לֹא נִמְצְאוּ אוּלַמּוֹת בְּ${s.city} לְ${s.guests} מוּזְמָנִים`,
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
      s.note = `לֹא נִמְצְאוּ אוּלַמּוֹת מַתְאִימִים בִּשְׁכוּנַת ${s.hood}`;
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
  for (const h of page) {
    parts.push(h.name, h.neighborhood_name && `בִּשְׁכוּנַת ${h.neighborhood_name}`,
      `עַד ${h.max_guests} אוֹרְחִים`, `לְמַעֲבָר לָאוּלָם הַקֵּשׁ ${digits(h.extension)}`);
  }
  if (s.more) parts.push('לְאוּלַמּוֹת נוֹסָפִים הַקֵּשׁ 9');
  if (s.hood) parts.push('לְחִיפּוּשׂ בִּשְׁכוּנָה נוֹסֶפֶת הַקֵּשׁ 0');
  parts.push('לִשְׁמִיעָה חוֹזֶרֶת הַקֵּשׁ 8');
  return ask(s, parts, tap(4, 3));
}

// מספר ראשון מתוך הטקסט ("בערך 1,200 או 1300" -> 1200)
function parseGuests(raw) {
  const m = String(raw ?? '').replace(/(\d)[,.](?=\d{3}\b)/g, '$1').match(/\d+/);
  return m ? Number(m[0]) : NaN;
}

async function handle(s, q, val, raw) {
  const go = (step) => { s.step = step; s.tries = 0; return prompt(s); };
  const toMenu = (note) => {
    if (++s.resets > MAX_RESETS) {
      sessions.delete(q.ApiCallId);
      return bye('לֹא הִצְלַחְנוּ לְהָבִין', 'נַסֵּה שׁוּב מְאוּחָר יוֹתֵר');
    }
    reset(s);
    s.note = note;
    return prompt(s);
  };
  const fail = (note) => {
    if (++s.tries >= MAX_TRIES) return toMenu('נַחֲזוֹר לַתַּפְרִיט הָרָאשִׁי');
    s.note = note;
    return prompt(s);
  };
  const confirm = (okStep, fixStep) => (val === '1' ? go(okStep) : val === '2' ? go(fixStep) : fail('לֹא הֵבַנְתִּי'));

  // כוכבית בכל שלב = חזרה לתפריט הראשי (לא נספר כטעות)
  if (val.includes('*')) { reset(s); return prompt(s); }
  if (!val) return fail('לֹא נִשְׁמְעָה תְּשׁוּבָה');

  switch (s.step) {
    case 'menu':
      if (val === '1') return go('guests');
      if (/^\d{2,}$/.test(val)) return (await routeByExt(q, val)) ?? fail('מִסְפַּר שְׁלוּחָה לֹא קַיָּים');
      return fail('בְּחִירָה לֹא תְּקִינָה');

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
      if (!city) return fail('לֹא זִיהִיתִי אֶת הָעִיר אוֹ שֶׁאֵין בָּהּ אוּלַמּוֹת רְשׁוּמִים');
      s.city = city;
      return go('cityOk');
    }
    case 'cityOk':
      return confirm('hood', 'city');

    case 'hood': {
      s.page = 0;
      s.hoodPage = 0;
      if (isNo(val)) { s.hood = null; return go('results'); }
      if (isYes(val)) return go('hoodMenu');
      const hood = bestMatch(val, s.hoods);
      if (hood) { s.hood = hood; return go('hoodOk'); }
      s.note = 'לֹא זִיהִיתִי אֶת הַשְּׁכוּנָה';
      return go('hoodMenu');
    }
    case 'hoodOk':
      return confirm('results', 'hood');
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
      if (/^\d{2,}$/.test(val)) return (await routeByExt(q, val)) ?? fail('מִסְפַּר שְׁלוּחָה לֹא קַיָּים');
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
  console.log('YEMOT', JSON.stringify(q));
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

      s = { n: 0, resets: 0, t: Date.now() };
      reset(s);
      // אם השרת אותחל באמצע שיחה - ממשיכים ממספור המשתנים הקיים ומודיעים על חזרה לתפריט
      const used = Object.keys(q).map((k) => /^v(\d+)$/.exec(k)?.[1]).filter(Boolean).map(Number);
      if (used.length) { s.n = Math.max(...used); s.note = 'נַחֲזוֹר לַתַּפְרִיט הָרָאשִׁי'; }
      sessions.set(id, s);
      return res.send(await prompt(s));
    }

    // בזיהוי דיבור, הקשה מגיעה כ-"Digits-1234" - מסירים את הקידומת
    const raw = String(last(q[`v${s.n}`]) ?? '').replace(/^Digits-?/i, '');
    return res.send(await handle(s, q, clean(raw), raw));
  } catch (err) {
    console.error('שגיאה בשרת:', err);
    return res.send(bye('תַּקָּלָה בַּמַּעֲרֶכֶת נַסֵּה שׁוּב מְאוּחָר יוֹתֵר'));
  }
});

app.all('/api/ivr/no-answer', async (req, res) => {
  const q = params(req);
  res.type('text/plain; charset=utf-8');
  if (q.hangup === 'yes') { await closeCall(q.ApiCallId); return res.send(''); }
  await supabase.from('leads_log').update({ answered: false }).eq('yemot_call_id', q.ApiCallId);
  return res.send(bye('הַגַּבַּאי לֹא עָנָה נַסֵּה שׁוּב מְאוּחָר יוֹתֵר'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

