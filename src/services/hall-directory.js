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
  setInterval(() => refresh().catch((e) => console.error('halls refresh:', e.message)), REFRESH_MS);
}

// אחרי הוספה/עריכה באתר הניהול
export function hallsChanged() {
  refresh().catch((e) => console.error('halls refresh:', e.message));
}

const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort();

export const getActiveHalls = () => activeHalls();

export const getActiveCities = async () => uniqueSorted((await activeHalls()).map((h) => h.city_name));

export const getActiveHallsInCity = async (city) => (await activeHalls()).filter((h) => h.city_name === city);

export const getActiveNeighborhoods = async (city) =>
  uniqueSorted((await getActiveHallsInCity(city)).flatMap((h) => splitHoods(h.neighborhood_name)));

export async function findActiveByExtension(extension) {
  return (await activeHalls()).find((h) => h.extension === String(extension)) ?? null;
}

// מקטן לגדול לפי מקסימום אורחים, ואז לפי שם. larger: בלי גבול עליון (כשהמתקשר ביקש לשמוע גם אולמות גדולים יותר)
export async function searchHalls({ city, neighborhood, guests, larger = false }) {
  const min = guests - halls.guestMargin(guests);
  const max = larger ? Infinity : halls.guestCeiling(guests);
  return (await getActiveHallsInCity(city))
    .filter((h) => h.max_guests >= min && h.max_guests <= max && (!neighborhood || splitHoods(h.neighborhood_name).includes(neighborhood)))
    .sort((a, b) => a.max_guests - b.max_guests || a.name.localeCompare(b.name, 'he'));
}
