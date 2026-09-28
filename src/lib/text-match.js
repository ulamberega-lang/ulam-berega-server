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

export function bestMatch(text, options) {
  const t = normalize(text);
  if (t.length < 2) return null;
  const opts = options.map((o) => [o, normalize(o)]).filter(([, n]) => n);

  // 1. התאמה מדויקת
  const exact = opts.find(([, n]) => n === t);
  if (exact) return exact[0];

  // שגיאת תמלול קטנה ("רמות אשקול")
  let close = null, bestDist = Infinity;
  for (const [o, n] of opts) {
    const dist = levenshtein(t, n);
    if (dist < bestDist) { bestDist = dist; close = [o, n]; }
  }
  if (close && bestDist > Math.max(1, Math.floor(close[1].length / 4))) close = null;

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
