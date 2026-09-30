// התאמה סלחנית בין מה שהמתקשר אמר לבין רשימת שמות (ערים/שכונות).

export const normalize = (s) => String(s ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const words = (s) => String(s ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// שגיאת תמלול קטנה, מילה-מילה: שם משותף ("היכל") לא מגדיל את הסבילות למילה השנייה,
// כך ש"היכל משה" לא נתפס כ"היכל שמחה". אם מספר המילים שונה (התמלול פיצל או חיבר מילים) - הכלל הכולל מספיק.
function closeWords(said, option) {
  const a = words(said), b = words(option);
  if (a.length !== b.length) return true;
  return a.every((w, i) => levenshtein(w, b[i]) <= Math.max(1, Math.floor(Math.min(w.length, b[i].length) / 4)));
}

// מסיר מילים כלליות ("אולם") כדי שמי שאומר "אולם בית ישראל" ומי שאומר "בית ישראל" יגיעו לאותו אולם,
// בין אם השם ב-DB כולל את המילה ובין אם לא. אם לא נשאר כלום - משאירים כמו שהיה.
export function dropGeneric(s, generic) {
  const kept = words(s).filter((w) => !generic.includes(w));
  return kept.length ? kept.join(' ') : String(s ?? '');
}

// options.generic: מילים שאפשר להוסיף או להשמיט בלי לשנות את הכוונה (למשל ['אולם'] בחיפוש שם אולם)
export function bestMatch(text, options, { generic = [] } = {}) {
  const raw = normalize(text);
  if (raw.length < 2) return null;
  const rawExact = options.find((o) => normalize(o) === raw); // שם שנאמר בדיוק כפי שהוא ב-DB, כולל "אולם" אם הוא חלק מהשם
  if (rawExact) return rawExact;

  const said = dropGeneric(text, generic);
  const t = normalize(said);
  if (t.length < 2) return null;
  const opts = options.map((o) => [o, normalize(dropGeneric(o, generic))]).filter(([, n]) => n);

  // 1. התאמה מדויקת
  const exact = opts.find(([, n]) => n === t);
  if (exact) return exact[0];

  // שגיאת תמלול קטנה ("רמות אשקול")
  let close = null, bestDist = Infinity;
  for (const [o, n] of opts) {
    const dist = levenshtein(t, n);
    if (dist < bestDist) { bestDist = dist; close = [o, n]; }
  }
  if (close && (bestDist > Math.max(1, Math.floor(close[1].length / 4)) || !closeWords(said, dropGeneric(close[0], generic)))) close = null;

  // 2. השם מופיע בתוך מה שנאמר ("בירושלים") - הארוך ביותר, כדי ש"רמות אשכול" לא ייתפס כ"רמות"
  const inside = opts.filter(([, n]) => t.includes(n)).sort((a, b) => b[1].length - a[1].length)[0];
  if (inside) return close && close[1].length > inside[1].length ? close[0] : inside[0];

  // 3. נאמר רק חלק מהשם ("מאה") - רק אם יש אפשרות אחת כזו
  const partial = opts.filter(([, n]) => n.includes(t));
  if (partial.length === 1 && t.length >= 3) return partial[0][0];

  // 4. שגיאת תמלול קטנה
  return close ? close[0] : null;
}

// מספר ראשון מתוך הטקסט ("בערך 1,200 או 1300" → 1200)
export function parseNumber(raw) {
  const m = String(raw ?? '').replace(/(\d)[,.](?=\d{3}\b)/g, '$1').match(/\d+/);
  return m ? Number(m[0]) : NaN;
}
