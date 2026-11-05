// API לאתר ההוספה של העובד (/staff/api): רואה את האולמות שבמערכת (לקריאה בלבד), מגיש אולמות חדשים,
// ורואה מה הגיש ומה נעשה בזה. אולם שהוגש נכנס לרשימת "לאישור" באתר הניהול ולא למערכת עצמה.
import { Router } from 'express';
import * as halls from '../repositories/halls.js';
import * as submissions from '../repositories/submissions.js';
import { draftFromBody, InputError } from '../lib/hall-input.js';
import { handle, idOf, submissionsSqlMissing } from './admin-api.js';

export const staffApi = Router();

// רק מה שצריך לזיהוי כפולים (בלי מייל, שלוחה וסטטיסטיקה)
const PUBLIC_FIELDS = ['id', 'name', 'synagogue_name', 'city_name', 'neighborhood_name', 'address', 'max_guests', 'gabbai_phone', 'is_active'];
const pick = (h) => Object.fromEntries(PUBLIC_FIELDS.map((f) => [f, h[f] ?? null]));

staffApi.get('/halls', handle(async () => (await halls.listAll()).map(pick)));
staffApi.get('/submissions', handle(() => submissions.listAll().catch(submissionsSqlMissing)));
staffApi.post('/submissions', handle(async (req) => {
  const data = draftFromBody(req.body ?? {});
  const note = String(req.body?.note ?? '').replace(/\s+/g, ' ').trim();
  if (note.length > 500) throw new InputError('ההערה ארוכה מדי (עד 500 תווים)');
  const sub = await submissions.create(data, note).catch(submissionsSqlMissing);
  console.log(`staff: הוגש לאישור אולם "${data.name}" (${data.city_name})`);
  return sub;
}));
// ביטול הגשה שעוד לא טופלה
staffApi.delete('/submissions/:id', handle(async (req) => {
  const removed = await submissions.removePending(idOf(req)).catch(submissionsSqlMissing);
  if (!removed?.length) throw new InputError('ההגשה כבר טופלה או לא נמצאה', 404);
  return { ok: true };
}));
