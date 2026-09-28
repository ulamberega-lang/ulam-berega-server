// API לאתר הניהול (/admin/api). תאריכים בפורמט YYYY-MM-DD לפי שעון ישראל.
import { Router } from 'express';
import * as halls from '../repositories/halls.js';
import { hallsChanged } from '../services/hall-directory.js';
import * as calls from '../repositories/calls.js';

export const adminApi = Router();

// שגיאה בכל נתיב → הודעה ברורה לאתר במקום קריסה
const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    console.error('admin:', err.message);
    const message = err.code === '23505' ? 'מספר השלוחה כבר בשימוש באולם אחר' : err.message;
    res.status(400).json({ error: message });
  }
};

// ---------- אולמות ----------

const HALL_FIELDS = ['name', 'city_name', 'neighborhood_name', 'address', 'max_guests',
  'gabbai_phone', 'gabbai_email', 'extension', 'is_active'];

const REQUIRED = { name: 'שם האולם', city_name: 'עיר', max_guests: 'מקסימום אורחים', extension: 'מספר שלוחה', gabbai_phone: 'טלפון להעברה' };

// isNew: באולם חדש כל שדות החובה חייבים להופיע; בעריכה - רק אם נשלחו, לא ריקים
function hallFromBody(body, isNew) {
  const hall = {};
  for (const f of HALL_FIELDS) {
    if (f in body) hall[f] = typeof body[f] === 'string' ? body[f].trim() || null : body[f];
  }
  if ('max_guests' in hall) {
    hall.max_guests = hall.max_guests ? Number(hall.max_guests) : null;
    if (Number.isNaN(hall.max_guests)) throw new Error('מקסימום אורחים חייב להיות מספר');
  }
  if (hall.gabbai_phone) hall.gabbai_phone = hall.gabbai_phone.replace(/\D/g, '') || null;
  if (hall.extension) hall.extension = String(hall.extension).replace(/\D/g, '') || null;

  for (const [field, label] of Object.entries(REQUIRED)) {
    if ((isNew || field in hall) && (hall[field] == null || hall[field] === '')) throw new Error(`חסר ${label}`);
  }
  if (hall.max_guests != null && !(Number.isInteger(hall.max_guests) && hall.max_guests > 0)) {
    throw new Error('מקסימום אורחים חייב להיות מספר שלם חיובי');
  }
  if (hall.extension && !/^\d{2,4}$/.test(hall.extension)) throw new Error('מספר שלוחה חייב להיות 2 עד 4 ספרות');
  if (hall.gabbai_phone && !/^0\d{8,9}$/.test(hall.gabbai_phone)) throw new Error('מספר טלפון לא תקין');
  return hall;
}

adminApi.get('/halls', handle(() => halls.listAll()));
// אחרי שמירה - מרעננים את הרשימה שהמערכת הטלפונית משתמשת בה
const saved = (hall) => { hallsChanged(); return hall; };
adminApi.post('/halls', handle(async (req) => saved(await halls.create(hallFromBody(req.body, true)))));
adminApi.put('/halls/:id', handle(async (req) => saved(await halls.update(req.params.id, hallFromBody(req.body, false)))));

// ---------- שיחות וסטטיסטיקה ----------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function range(req) {
  const { from, to } = req.query;
  if (!DATE.test(from) || !DATE.test(to)) throw new Error('תאריכים לא תקינים');
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
