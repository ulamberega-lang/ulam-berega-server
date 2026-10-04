// רשימת האולמות הפעילים בזיכרון השרת, כדי שהמערכת הטלפונית לא תפנה ל-Supabase בכל שלב.
// מתרעננת כל דקה, ומיד אחרי שינוי באתר הניהול. אם הרענון נכשל - ממשיכים עם הרשימה האחרונה.
import * as halls from '../repositories/halls.js';
import { splitHoods } from '../lib/hoods.js';

const REFRESH_MS = 60 * 1000;
let list = null;       // אולמות פעילים עם מספר שלוחה, ממוינים לפי שם
let loadedAt = 0;
let loading = null;

function refresh() {
  loading ??= halls.getActiveHalls()
    .then((rows) => { list = rows; loadedAt = Date.now(); })
    .finally(() => { loading = null; });
  return loading;
}

async function activeHalls() {
  if (!list) await refresh();                               // פעם ראשונה - חייבים לחכות
  else if (Date.now() - loadedAt > REFRESH_MS) refresh().catch((e) => console.error('halls refresh:', e.message));
  return list;
}

export function startHallDirectory() {
  refresh().catch((e) => console.error('halls refresh:', e.message));
  setInterval(() => refresh().catch((e) => console.error('halls refresh:', e.message)), REFRESH_MS).unref();
}

// אחרי הוספה/עריכה באתר הניהול
export function hallsChanged() {
  refresh().catch((e) => console.error('halls refresh:', e.message));
}

const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort();

export const getActiveHalls = () => activeHalls();

export const getActiveCities = async () => uniqueSorted((await activeHalls()).map((h) => h.city_name));

export const getActiveHallsInCity = async (city) => (await activeHalls()).filter((h) => h.city_name === city);

// guests: רק שכונות שיש בהן אולם בגודל מתאים (בלי guests - כל השכונות בעיר)
export const getActiveNeighborhoods = async (city, guests) =>
  uniqueSorted((guests ? await searchHalls({ city, guests }) : await getActiveHallsInCity(city))
    .flatMap((h) => splitHoods(h.neighborhood_name)));

export async function findActiveByExtension(extension) {
  return (await activeHalls()).find((h) => h.extension === String(extension)) ?? null;
}

// בטווח המתאים: מקטן לגדול לפי מקסימום אורחים, ואז לפי שם.
// size: "larger" - בלי גבול עליון (כשהמתקשר ביקש לשמוע אולמות גדולים יותר);
//       "smaller" - אולמות קטנים מהטווח, מהגדול לקטן (הקרובים לכמות קודם)
//       "near" - כל האולמות מחוץ לטווח (גדולים וקטנים), מהקרוב ביותר לכמות המוזמנים
// pickHalls: פונקציה נקייה על רשימת אולמות (נבדקת ב-test/), ו-searchHalls מפעילה אותה על אולמות העיר
export function pickHalls(cityHalls, { neighborhood, guests, size }) {
  const min = guests - halls.guestMargin(guests);
  const max = size === 'larger' ? Infinity : halls.guestCeiling(guests);
  const inScope = cityHalls.filter((h) => !neighborhood || splitHoods(h.neighborhood_name).includes(neighborhood));
  const byName = (a, b) => a.name.localeCompare(b.name, 'he');
  if (size === 'near') {
    return inScope.filter((h) => h.max_guests < min || h.max_guests > max)
      .sort((a, b) => Math.abs(a.max_guests - guests) - Math.abs(b.max_guests - guests) || byName(a, b));
  }
  if (size === 'smaller') return inScope.filter((h) => h.max_guests < min).sort((a, b) => b.max_guests - a.max_guests || byName(a, b));
  return inScope.filter((h) => h.max_guests >= min && h.max_guests <= max).sort((a, b) => a.max_guests - b.max_guests || byName(a, b));
}

export async function searchHalls({ city, neighborhood, guests, size }) {
  return pickHalls(await getActiveHallsInCity(city), { neighborhood, guests, size });
}
