// API לאתר הניהול (/admin/api). תאריכים בפורמט YYYY-MM-DD לפי שעון ישראל.
import { Router } from 'express';
import * as halls from '../repositories/halls.js';
import { hallsChanged } from '../services/hall-directory.js';
import * as calls from '../repositories/calls.js';
import * as voicemails from '../repositories/voicemails.js';
import * as mailLog from '../repositories/mail-log.js';
import * as pronunciations from '../repositories/pronunciations.js';
import { reloadNikud } from '../services/nikud.js';
import { downloadRecording, deleteRecordingFile } from '../services/transcriber.js';
import { hallFromBody, plainName, InputError } from '../lib/hall-input.js';

export const adminApi = Router();

// שגיאה בכל נתיב → הודעה ברורה לאתר במקום קריסה. קלט לא תקין (InputError) מוצג כמו שהוא;
// תקלת שרת (למשל מסד הנתונים) נרשמת בלוג, ולאתר חוזרת הודעה כללית
const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    console.error('admin:', err.message);
    if (err instanceof InputError) return res.status(err.status).json({ error: err.message });
    if (err.code === 'PGRST116') return res.status(404).json({ error: 'האולם לא נמצא' });
    if (err.code === '23505') return res.status(400).json({ error: 'מספר השלוחה כבר בשימוש באולם אחר' });
    return res.status(500).json({ error: 'תקלה בשרת. נסה שוב, ואם זה חוזר - בדוק את הלוג ב-Render' });
  }
};

// ---------- אולמות ----------

const idOf = (req) => {
  if (!/^\d+$/.test(req.params.id)) throw new InputError('מזהה לא תקין');
  return req.params.id;
};

adminApi.get('/halls', handle(() => halls.listAll()));
// אחרי שמירה - מרעננים את הרשימה שהמערכת הטלפונית משתמשת בה
const saved = (hall) => { hallsChanged(); return hall; };
adminApi.post('/halls', handle(async (req) => saved(await halls.create(hallFromBody(req.body, true)))));
adminApi.put('/halls/:id', handle(async (req) => saved(await halls.update(idOf(req), hallFromBody(req.body, false)))));

// ---------- ניקוד הקראה (טבלת pronunciations) ----------

adminApi.get('/pronunciations', handle(() => pronunciations.listAll()));

// הוספה או עדכון. word נשמר בלי ניקוד (כמו שמות האולמות); nikud הוא ההקראה
adminApi.put('/pronunciations', handle(async (req) => {
  const word = plainName(req.body?.word);
  const nikud = String(req.body?.nikud ?? '').replace(/\s+/g, ' ').trim();
  if (!word || word.length > 100) throw new InputError('חסר שם (עד 100 תווים)');
  if (!nikud || nikud.length > 200 || !/[א-ת]/.test(nikud)) throw new InputError('חסר ניקוד: יש לכתוב את השם עם ניקוד');
  if (nikud === word) throw new InputError('הניקוד זהה לשם בלי ניקוד');
  const row = await pronunciations.save(word, nikud);
  reloadNikud().catch((e) => console.error('nikud:', e.message)); // ההקראה בטלפון מתעדכנת מיד
  return row;
}));

adminApi.delete('/pronunciations', handle(async (req) => {
  const word = plainName(req.body?.word);
  if (!word) throw new InputError('חסר שם');
  await pronunciations.remove(word);
  reloadNikud().catch((e) => console.error('nikud:', e.message));
  return { ok: true };
}));

// ---------- שיחות וסטטיסטיקה ----------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function range(req) {
  const { from, to } = req.query;
  if (!DATE.test(from) || !DATE.test(to)) throw new InputError('תאריכים לא תקינים');
  const hallId = /^\d+$/.test(req.query.hall ?? '') ? Number(req.query.hall) : null;
  return { from, to, hallId };
}

adminApi.get('/stats/halls', handle((req) => {
  const { from, to } = range(req);
  return calls.statsByHall(from, to);
}));

adminApi.get('/stats/days', handle((req) => {
  const { from, to, hallId } = range(req);
  return calls.statsByDay(from, to, hallId);
}));

adminApi.get('/calls', handle((req) => {
  const { from, to, hallId } = range(req);
  return calls.listCalls(from, to, hallId);
}));

// ---------- הודעות קוליות ----------

adminApi.get('/mails', handle(() => mailLog.listRecent()));
adminApi.get('/voicemails', handle(() => voicemails.listAll()));
adminApi.put('/voicemails/:id', handle((req) => voicemails.setHandled(idOf(req), Boolean(req.body?.handled))));
adminApi.delete('/voicemails/:id', handle(async (req) => {
  const row = await voicemails.findById(idOf(req));
  if (!row) throw new InputError('ההודעה לא נמצאה', 404);
  await voicemails.remove(row.id);
  audioCache.delete(row.id);
  deleteRecordingFile(row.yemot_path); // ברקע; נרשם בלוג אם נכשל
  return { ok: true };
}));

// ההקלטה עצמה, מימות. תמיכה ב-Range, כי Safari באייפון דורש אותה להשמעת אודיו.
// Safari שולח כמה בקשות לאותה הקלטה, ולכן שומרים בזיכרון את האחרונות לכמה דקות (במקום להוריד מימות בכל בקשה)
const AUDIO_CACHE_MS = 5 * 60 * 1000;
const AUDIO_CACHE_MAX = 5;
const audioCache = new Map(); // מזהה הודעה → { audio, at }

async function recordingOf(row) {
  const hit = audioCache.get(row.id);
  if (hit && Date.now() - hit.at < AUDIO_CACHE_MS) return hit.audio;
  const audio = await downloadRecording(row.yemot_path);
  if (audio) {
    audioCache.delete(row.id);
    audioCache.set(row.id, { audio, at: Date.now() });
    if (audioCache.size > AUDIO_CACHE_MAX) audioCache.delete(audioCache.keys().next().value);
  }
  return audio;
}

adminApi.get('/voicemails/:id/audio', async (req, res) => {
  try {
    const row = /^\d+$/.test(req.params.id) ? await voicemails.findById(req.params.id) : null;
    const audio = row && await recordingOf(row);
    if (!audio) return res.status(404).json({ error: 'ההקלטה לא נמצאה בימות' });

    const size = audio.length;
    res.set({ 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=300' });
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (!range) return res.set('content-length', size).end(audio);
    const start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]);
    const end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
    if (start > end || start >= size) return res.status(416).set('content-range', `bytes */${size}`).end();
    return res.status(206).set({ 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 }).end(audio.subarray(start, end + 1));
  } catch (err) {
    console.error('admin:', err.message);
    return res.status(500).json({ error: 'שגיאה בהורדת ההקלטה' });
  }
});
