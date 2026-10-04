// בדיקת הנתונים שמגיעים מטופס האולם באתר הניהול (פונקציה נקייה, עם בדיקות ב-test/).

// שגיאה שנגרמה מקלט לא תקין: מוצגת למשתמש כמו שהיא (סטטוס 400/404), בניגוד לתקלת שרת
export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const HALL_FIELDS = ['name', 'synagogue_name', 'city_name', 'neighborhood_name', 'address', 'max_guests',
  'gabbai_phone', 'gabbai_email', 'extension', 'is_active'];

const REQUIRED = { name: 'שם האולם', city_name: 'עיר', max_guests: 'מקסימום אורחים', extension: 'מספר שלוחה', gabbai_phone: 'טלפון להעברה' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// isNew: באולם חדש כל שדות החובה חייבים להופיע; בעריכה - רק אם נשלחו, לא ריקים
export function hallFromBody(body, isNew) {
  const hall = {};
  for (const f of HALL_FIELDS) {
    if (f in body) hall[f] = typeof body[f] === 'string' ? body[f].trim() || null : body[f];
  }
  if ('max_guests' in hall) {
    hall.max_guests = hall.max_guests ? Number(hall.max_guests) : null;
    if (Number.isNaN(hall.max_guests)) throw new InputError('מקסימום אורחים חייב להיות מספר');
  }
  if (hall.gabbai_phone != null) hall.gabbai_phone = String(hall.gabbai_phone).replace(/\D/g, '') || null;
  if (hall.extension != null) hall.extension = String(hall.extension).replace(/\D/g, '') || null;
  if ('is_active' in hall) hall.is_active = hall.is_active === true || hall.is_active === 'true';

  for (const [field, label] of Object.entries(REQUIRED)) {
    if ((isNew || field in hall) && (hall[field] == null || hall[field] === '')) throw new InputError(`חסר ${label}`);
  }
  if (hall.max_guests != null && !(Number.isInteger(hall.max_guests) && hall.max_guests > 0)) {
    throw new InputError('מקסימום אורחים חייב להיות מספר שלם חיובי');
  }
  if (hall.extension && !/^\d{2,4}$/.test(hall.extension)) throw new InputError('מספר שלוחה חייב להיות 2 עד 4 ספרות');
  if (hall.gabbai_phone && !/^0\d{8,9}$/.test(hall.gabbai_phone)) throw new InputError('מספר טלפון לא תקין');
  if (hall.gabbai_email && !EMAIL.test(hall.gabbai_email)) throw new InputError('כתובת המייל לא תקינה');
  return hall;
}
