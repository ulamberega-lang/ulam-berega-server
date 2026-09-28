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
  load();
  setInterval(load, REFRESH_MS);
}

// ביטוי שלם ("אולם כתר"), ואם אין - מילה-מילה ("אולם" + "כתר"); שם שלא נמצא נשאר כמו שהוא
export function withNikud(name) {
  if (!name) return name;
  return dictionary.get(name.trim()) ?? name.split(' ').map((w) => dictionary.get(w) ?? w).join(' ');
}
