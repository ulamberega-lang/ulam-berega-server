// API לאתר הניהול (/admin/api). תאריכים בפורמט YYYY-MM-DD לפי שעון ישראל.
import { Router } from 'express';
import * as halls from '../repositories/halls.js';
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

function hallFromBody(body) {
  const hall = {};
  for (const f of HALL_FIELDS) {
    if (f in body) hall[f] = typeof body[f] === 'string' ? body[f].trim() || null : body[f];
  }
  if ('max_guests' in hall) hall.max_guests = hall.max_guests ? Number(hall.max_guests) : null;
  if (hall.gabbai_phone) hall.gabbai_phone = hall.gabbai_phone.replace(/\D/g, '');
  if (hall.extension) hall.extension = String(hall.extension).replace(/\D/g, '');
  return hall;
}

adminApi.get('/halls', handle(() => halls.listAll()));
adminApi.post('/halls', handle((req) => halls.create(hallFromBody(req.body))));
adminApi.put('/halls/:id', handle((req) => halls.update(req.params.id, hallFromBody(req.body))));

// ---------- שיחות וסטטיסטיקה ----------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function range(req) {
  const { from, to } = req.query;
  if (!DATE.test(from) || !DATE.test(to)) throw new Error('תאריכים לא תקינים');
  const hallId = req.query.hall ? Number(req.query.hall) : null;
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
