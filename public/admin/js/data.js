// נתוני אולמות משותפים: שורה לכל אולם עם מספרי השיחות שלו בתקופה.
import { escapeHtml } from './dom.js';
import { splitHoods } from './hoods.js';

export function buildRows(halls, statsRows) {
  const stats = new Map(statsRows.map((r) => [Number(r.hall_id), r]));
  return halls.map((h) => {
    const s = stats.get(Number(h.id));
    const total = Number(s?.total || 0), answered = Number(s?.answered || 0), unanswered = Number(s?.unanswered || 0);
    return {
      hall: h, id: h.id, name: h.name || '', synagogue: h.synagogue_name || '', city: h.city_name || '', hood: h.neighborhood_name || '', hoods: splitHoods(h.neighborhood_name),
      cancelled: Number(s?.cancelled || 0), busy: Number(s?.busy || 0), failed: Number(s?.failed || 0),
      total, answered, unanswered, rate: total ? answered / total : null,
      guests: h.max_guests, ext: h.extension, active: h.is_active,
    };
  });
}

export const HALL_GETTERS = {
  name: (r) => r.name, city: (r) => r.city, hood: (r) => r.hood,
  total: (r) => r.total, answered: (r) => r.answered, unanswered: (r) => r.unanswered, rate: (r) => r.rate,
  guests: (r) => r.guests, ext: (r) => (r.ext ? Number(r.ext) : null),
};

export const HALL_SORTS = [
  { key: 'name', label: 'שם אולם', text: true },
  { key: 'city', label: 'עיר', text: true },
  { key: 'hood', label: 'שכונה', text: true },
  { key: 'total', label: 'סה"כ שיחות' },
  { key: 'answered', label: 'שיחות שנענו' },
  { key: 'unanswered', label: 'שיחות שלא נענו' },
  { key: 'rate', label: 'אחוז מענה' },
];

export const byName = (a, b) => a.name.localeCompare(b.name, 'he');

// כל מה שאפשר לחפש באולם
export const searchText = (r) => [r.name, r.synagogue, r.city, r.hood, r.hall.address, r.ext, r.hall.gabbai_phone].join(' ');

// כולל שלוחה, כדי שלאולמות עם אותו שם ואותה עיר תהיה תווית שונה (אחרת אחד מהם לא נבחר ביומן)
export const hallLabel = (h) => `${h.name}, ${h.city_name} (שלוחה ${h.extension ?? '?'})`;

export const location = (r) => [r.city, r.hood].filter(Boolean).map(escapeHtml).join(' · ');

// הצעה לשלוחה לאולם חדש, "קומות במלון": לכל עיר מאה משלה (ירושלים 1xx, בני ברק 2xx...).
// רק שלוחות של 3 ספרות (100 עד 999) קובעות מאה. שלוחות נמוכות (למשל אולמות ניסיון) לא נספרות.
export function suggestExtension(halls, city) {
  const name = String(city ?? '').trim();
  if (!name) return null;
  const real = halls
    .map((h) => ({ city: String(h.city_name ?? '').trim(), ext: /^\d{3}$/.test(h.extension ?? '') ? Number(h.extension) : null }))
    .filter((h) => h.ext !== null);
  const used = new Set(real.map((h) => h.ext));
  const usedHundreds = new Set(real.map((h) => Math.floor(h.ext / 100)));

  const mine = real.filter((h) => h.city === name);
  const hundredsOfCity = [...new Set(mine.map((h) => Math.floor(h.ext / 100)))];
  // אם העיר כבר במאה מסוימת - ממשיכים משם; אחרת מאה פנויה חדשה
  const candidates = hundredsOfCity.length
    ? [Math.floor(Math.max(...mine.map((h) => h.ext)) / 100)]
    : [];
  const fromHundred = (hundred) => {
    const top = Math.max(hundred * 100, ...[...used].filter((e) => Math.floor(e / 100) === hundred));
    if (top < hundred * 100 + 99) return top + 1;
    for (let e = hundred * 100 + 1; e <= hundred * 100 + 99; e++) if (!used.has(e)) return e; // המאה "נגמרה" בסוף - ממלאים חורים
    return null;
  };

  for (const hundred of candidates) {
    const ext = fromHundred(hundred);
    if (ext) return { ext, hundred, existing: true };
  }
  for (let hundred = 1; hundred <= 9; hundred++) {
    if (usedHundreds.has(hundred)) continue;
    return { ext: hundred * 100 + 1, hundred, existing: false };
  }
  return null;
}

// ---------- ניקוד הקראה ----------
// שמות שאין להם ניקוד בטבלת pronunciations. כל שם מוצע כביטוי שלם (עיר, שכונה, אולם, בית כנסת), גם אם כל מילה בו
// מנוקדת בנפרד: ההגייה של שתי מילים יחד (סמיכות) שונה מהגייה של כל אחת לבד. dictWords = כל ה-word שבטבלה.
// מחזיר [{ text, kind }]: kind = city | hood | hall | synagogue
export function missingPronunciations(halls, dictWords) {
  const have = new Set(dictWords.map((w) => String(w).trim()));
  const found = new Map();
  const add = (value, kind) => {
    const text = String(value ?? '').trim();
    if (text && /[א-ת]/.test(text) && !have.has(text) && !found.has(text)) found.set(text, kind); // מספרים בלבד לא צריכים ניקוד
  };
  for (const h of halls) {
    add(h.city_name, 'city');
    for (const hood of splitHoods(h.neighborhood_name)) add(hood, 'hood');
    add(h.name, 'hall');
    add(h.synagogue_name, 'synagogue');
  }
  const order = { city: 0, hood: 1, hall: 2, synagogue: 3 };
  return [...found].map(([text, kind]) => ({ text, kind })).sort((a, b) => order[a.kind] - order[b.kind] || a.text.localeCompare(b.text, 'he'));
}

// ---------- פירוט "לא נענו" לפי סיבה (כל סיבה בגוון אדום משלה) ----------
export const REASONS = [
  { key: 'noAnswer', label: 'לא ענו', cls: 'r1' },
  { key: 'cancelled', label: 'המתקשר ניתק', cls: 'r2' },
  { key: 'busy', label: 'תפוס', cls: 'r3' },
  { key: 'failed', label: 'תקלה בחיוג', cls: 'r4' },
];

// src: שורה עם unanswered ועם cancelled / busy / failed (חסרים = 0). "לא ענו" = מה שנשאר
export function reasonParts(src) {
  const n = (v) => Number(v || 0);
  const known = { cancelled: n(src.cancelled), busy: n(src.busy), failed: n(src.failed) };
  const counts = { ...known, noAnswer: Math.max(0, n(src.unanswered) - known.cancelled - known.busy - known.failed) };
  return REASONS.map((r) => ({ ...r, n: counts[r.key] }));
}

// מקרא עם המספרים: רק סיבות שקרו
export function reasonsLegend(src) {
  const parts = reasonParts(src).filter((p) => p.n > 0);
  if (!parts.length) return '';
  return `<ul class="reasons">${parts.map((p) => `<li><i class="${p.cls}"></i>${p.label} <b>${p.n.toLocaleString('he-IL')}</b></li>`).join('')}</ul>`;
}

// הקטעים האדומים של פס: רוחב כל קטע לפי הפונקציה width
export const redSegments = (src, width) => reasonParts(src).map((p) => `<i class="${p.cls}" style="width:${width(p.n)}"></i>`).join('');

// טקסט קצר לחלון הסבר (title): "2 ניתקו, 1 תפוס"
export const reasonsTitle = (src) => reasonParts(src).filter((p) => p.n > 0).map((p) => `${p.label}: ${p.n}`).join(', ');
