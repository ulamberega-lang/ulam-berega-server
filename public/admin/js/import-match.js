// ייבוא אולמות מקובץ אקסל: קריאת השורות והשוואה לאולמות שכבר במערכת. פונקציות נקיות (נבדקות ב-test/).
import { splitNames } from './hoods.js';

// עמודות הקובץ (A עד L)
const COL = { name: 0, synagogue: 1, hood: 2, address: 3, phone: 4, city: 5, category: 6, guests: 7, notes: 8, source: 9, origin: 10, group: 11 };

const strip = (s) => String(s ?? '').toLowerCase().replace(/[֑-ׇ]/g, '').replace(/["'`׳״‎‏]/g, '');
const clean = (s) => strip(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

// מילים כלליות שאפשר להוסיף או להשמיט בשם אולם
const GENERIC = new Set(['אולם', 'אולמי', 'אולמות', 'אירועים', 'אירוע', 'שמחות', 'ושמחות']);
export const nameKey = (s) => clean(s).split(' ').filter((w) => w && !GENERIC.has(w)).join(' ');
const dropWord = (s, word) => s.split(' ').filter((w) => w !== word).join(' '); // \b לא עובד עם עברית
export const cityKey = (s) => dropWord(clean(s), 'ישראל');

// כמה מספרי טלפון בתא ("050-111 / 02-643-6251") → מספרים מקומיים בספרות בלבד
export function phonesOf(text) {
  const out = [];
  for (const part of String(text ?? '').split(/[\/;|,]|\sאו\s/)) {
    let d = part.replace(/\D/g, '');
    if (d.startsWith('972')) d = `0${d.slice(3)}`;
    if (/^0\d{8,9}$/.test(d) && !out.includes(d)) out.push(d);
  }
  return out;
}

const mailOf = (s) => String(s ?? '').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? '';

// כתובת: מפתח של רחוב ומספר בית בלבד (בלי עיר, "רחוב", "ישראל")
export function addressKey(address, city) {
  const c = cityKey(city);
  let a = dropWord(clean(address), 'ישראל');
  if (c) a = a.replace(new RegExp(`(^|\\s)${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'g'), ' ');
  a = a.replace(/(^|\s)(רחוב|רח|שדרות|שד)(\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  const num = a.match(/\d+/)?.[0];
  const street = a.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
  return num && street ? `${street}|${num}` : '';
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

// 2 = שם זהה, 1 = דומה (טעות כתיב קטנה, או שם אחד מוכל בשני), 0 = שונה
export function nameScore(a, b) {
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y) return 0;
  if (x === y) return 2;
  if (levenshtein(x, y) <= Math.max(1, Math.floor(Math.min(x.length, y.length) / 5))) return 1;
  const xs = x.split(' '), ys = y.split(' ');
  const [small, big] = xs.length <= ys.length ? [xs, ys] : [ys, xs];
  return small.every((w) => w.length >= 3 && big.includes(w)) ? 1 : 0;
}

// שורות הקובץ → אולמות. שורת כותרת מזוהה לפי "שם אולם"
export function parseRows(rows) {
  const items = [];
  rows.forEach((r, i) => {
    const name = String(r[COL.name] ?? '').trim();
    if (i === 0 && name === 'שם אולם') return;
    const phones = phonesOf(r[COL.phone]);
    if (!name && !phones.length) return; // שורה בלי שם ובלי טלפון: אין במה להשתמש (שורה עם טלפון בלבד נשארת)
    items.push({
      line: i + 1, name, synagogue: String(r[COL.synagogue] ?? '').trim(), hood: String(r[COL.hood] ?? '').trim(),
      address: String(r[COL.address] ?? '').trim(), phoneRaw: String(r[COL.phone] ?? '').trim(), phones,
      city: String(r[COL.city] ?? '').trim(), category: String(r[COL.category] ?? '').trim(),
      guests: Number.parseInt(String(r[COL.guests] ?? '').replace(/\D/g, ''), 10) || null,
      notes: String(r[COL.notes] ?? '').trim(), source: String(r[COL.source] ?? '').trim(), origin: String(r[COL.origin] ?? '').trim(),
      group: String(r[COL.group] ?? '').trim(),
    });
  });
  return items;
}

const RANK = { in: 2, maybe: 1, new: 0 };

// משווה אולם מהקובץ לאולמות במערכת: in = כבר במערכת, maybe = דומה (לבדוק), new = לא נמצא
export function matchItem(item, halls) {
  const city = cityKey(item.city);
  const itemAddr = addressKey(item.address, item.city);
  const names = [item.name, item.synagogue].filter(Boolean);
  let best = { status: 'new', reasons: [], hall: null };
  for (const hall of halls) {
    const sameCity = !city || !hall.city_name || cityKey(hall.city_name) === city;
    const hallNames = [...splitNames(hall.name), hall.synagogue_name].filter(Boolean);
    let name = 0;
    for (const a of names) for (const b of hallNames) name = Math.max(name, nameScore(a, b));
    const phone = item.phones.length > 0 && phonesOf(hall.gabbai_phone).some((p) => item.phones.includes(p));
    const hallAddr = addressKey(hall.address, hall.city_name);
    const addr = Boolean(itemAddr) && sameCity && Boolean(hallAddr) && (itemAddr === hallAddr
      || (itemAddr.split('|')[1] === hallAddr.split('|')[1] && levenshtein(itemAddr.split('|')[0], hallAddr.split('|')[0]) <= 1));

    const reasons = [];
    if (name === 2 && sameCity) reasons.push('שם ועיר זהים');
    else if (name >= 1 && sameCity) reasons.push('שם דומה באותה עיר');
    if (phone) reasons.push('אותו טלפון');
    if (addr) reasons.push('אותה כתובת');
    if (!reasons.length) continue;
    const status = (name === 2 && sameCity) || (phone && name >= 1 && sameCity) ? 'in' : 'maybe';
    if (RANK[status] > RANK[best.status] || (status === best.status && reasons.length > best.reasons.length)) best = { status, reasons, hall };
  }
  return best;
}

// סטטוס כל שורה, וסטטוס קבוצה (אם יש מספר קבוצה: הכי "במערכת" מבין חבריה)
export function matchAll(items, halls) {
  const rows = items.map((item) => ({ item, ...matchItem(item, halls) }));
  const groups = new Map();
  for (const r of rows) {
    if (!r.item.group) continue;
    const g = groups.get(r.item.group) ?? { status: 'new', size: 0 };
    g.size++;
    if (RANK[r.status] > RANK[g.status]) g.status = r.status;
    groups.set(r.item.group, g);
  }
  for (const r of rows) r.groupStatus = r.item.group ? groups.get(r.item.group).status : r.status;
  return rows;
}

// נתוני טופס "אולם חדש" משורה בקובץ
export function hallDraft(item) {
  const address = item.address.replace(/,?\s*ישראל\s*$/, '').trim();
  return {
    name: item.name, synagogue_name: item.synagogue, city_name: item.city, neighborhood_name: item.hood,
    address, max_guests: item.guests ?? '', gabbai_phone: item.phones[0] ?? '', gabbai_email: mailOf(item.notes),
  };
}

// מפתח יציב לשורה (לסימון "טופל" בדפדפן)
// "מקור מקורי" (קובץ, שורה וקישור) ייחודי לכל שורה, גם כששתי שורות באותה קבוצה זהות בשם, בעיר ובטלפון
export const itemKey = (item) => `${nameKey(item.name)}|${cityKey(item.city)}|${item.phones[0] ?? ''}|${item.origin.slice(0, 120)}`;
