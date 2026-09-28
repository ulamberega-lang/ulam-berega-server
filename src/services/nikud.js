// ניקוד לשמות מה-DB, כדי שמנוע ההקראה יגה אותם נכון (טבלת pronunciations).
import { supabase } from '../lib/supabase.js';

const REFRESH_MS = 10 * 60 * 1000;
let dictionary = new Map();

async function load() {
  const { data, error } = await supabase.from('pronunciations').select('word, nikud');
  if (error) return console.error('nikud:', error.message);
  dictionary = new Map(data.map((r) => [r.word.trim(), r.nikud]));
}

export function startNikudRefresh() {
  const safeLoad = () => load().catch((e) => console.error('nikud:', e.message));
  safeLoad();
  setInterval(safeLoad, REFRESH_MS);
}

// ביטוי שלם ("אולם כתר"), ואם אין - מילה-מילה ("אולם" + "כתר"); שם שלא נמצא נשאר כמו שהוא
export function withNikud(name) {
  if (!name) return name;
  return dictionary.get(name.trim()) ?? name.split(' ').map((w) => dictionary.get(w) ?? w).join(' ');
}

// שם עם אות שימוש (ב/ל) צמודה. לפני אות בשווא האות מקבלת חיריק והדגש נופל:
// "יְרוּשָׁלַיִם" → "בִּירוּשָׁלַיִם", "בְּנֵי בְּרַק" → "לִבְנֵי בְּרַק"; אחרת שווא: "לְרָמוֹת"
// (סימני הניקוד יכולים להופיע בכל סדר - שווא ודגש)
const SHVA = '\u05B0', HIRIQ = '\u05B4', DAGESH = '\u05BC';
const STARTS_WITH_SHVA = new RegExp(`^(\\p{L})(?:${SHVA}${DAGESH}?|${DAGESH}${SHVA})`, 'u');
export function withPrefix(prefix, name) {
  const word = withNikud(name);
  const head = 'בכפ'.includes(prefix) ? `${prefix}${DAGESH}` : prefix; // בּ בתחילת מילה - לא "וו"
  const m = STARTS_WITH_SHVA.exec(word);
  if (!m) return `${head}${SHVA}${word}`;
  const letter = m[1];
  return `${head}${HIRIQ}${letter}${letter === 'י' ? '' : SHVA}${word.slice(m[0].length)}`;
}
