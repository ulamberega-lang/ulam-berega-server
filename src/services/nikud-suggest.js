// הצעת ניקוד לשמות (OpenAI), לשונית "ניקוד הקראה" באתר הניהול. ההצעה לא נשמרת: מנהל האתר בודק ומאשר.
import { config } from '../config.js';
import { plainName } from '../lib/hall-input.js';

const TIMEOUT_MS = 25000;
const MAX_OPTIONS = 2;
const KIND_LABEL = { city: 'עיר בישראל', hood: 'שכונה', hall: 'אולם אירועים', synagogue: 'בית כנסת' };

const RULES = `אתה מנקד שמות בעברית למנוע הקראה טלפוני. לכל שם החזר שתי אפשרויות ניקוד מלא, כפי שהשם נהגה בעברית ישראלית מדוברת.
כללים:
1. נקד כל אות. שם של עיר, שכונה או בית כנסת - לפי ההגייה המקובלת בישראל (למשל סמיכות: "בֵּית שֶׁמֶשׁ", "קִרְיַת סֵפֶר").
2. המנוע מתעלם משווא: במקום שבו השווא נע (נהגה כתנועה) כתוב סגול במקומו. שווא נח השאר שווא.
3. כתוב את השם בלבד, בלי סימני פיסוק (נקודה, פסיק, מקף, גרש, גרשיים), בלי הסברים ובלי תוספות.
4. מילה באנגלית או מספר - השאר כמו שהם.
5. אותו השם בלי הניקוד חייב להישאר זהה לשם שקיבלת (אל תשנה אותיות), חוץ ממקרים שמצוינים בדוגמאות (למשל איות אות).
6. לכל שם: קודם כתוב ב-"pronunciation" איך הוא נהגה באותיות לטיניות (חשוב על ההגייה לפני הניקוד), ואז ב-"options" שתי אפשרויות ניקוד שונות זו מזו, מהסבירה ביותר לפחות סבירה.
החזר JSON בלבד בצורה {"result": {"<השם כפי שקיבלת>": {"pronunciation": "...", "options": ["...", "..."]}}}.`;

// ניקוי מה שהמודל החזיר: בלי תווים שמפרידים בפקודות ימות, ובלי רווחים כפולים
const cleanSuggestion = (text) => String(text ?? '').replace(/[.,\-=&"'|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

async function ask(body) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify(body),
  });
  return { res, text: res.ok ? null : (await res.text()).slice(0, 300) };
}

// items: [{ text, kind }]; previous: { [text]: [אפשרויות שכבר הוצגו] } (לא חוזרים עליהן); examples: [{ word, nikud }] מהטבלה הקיימת.
// מחזיר { [text]: [עד 2 אפשרויות, מהסבירה ביותר] }
export async function suggestNikud(items, previous = {}, examples = []) {
  if (!config.openaiKey) throw new Error('OPENAI_API_KEY לא מוגדר');
  const shots = examples.map((e) => `${e.word} → ${e.nikud}`).join('\n');
  const names = items.map((i) => `- ${i.text}${KIND_LABEL[i.kind] ? ` (${KIND_LABEL[i.kind]})` : ''}${previous[i.text]?.length ? ` — כבר הוצגו ונדחו, הצע אחרות: ${previous[i.text].join(' | ')}` : ''}`).join('\n');
  const body = {
    model: config.nikudModel,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: RULES },
      { role: 'user', content: `${shots ? `דוגמאות מהטבלה הקיימת (שם → ניקוד):\n${shots}\n\n` : ''}נקד את השמות הבאים:\n${names}` },
    ],
  };

  let { res, text } = await ask(body);
  if (res.status === 400) { // חלק מהדגמים (למשל דגמי חשיבה) לא מקבלים טמפרטורה: מנסים שוב בלי ההגדרה
    const { temperature, ...withoutTemperature } = body;
    ({ res, text } = await ask(withoutTemperature));
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status} ${text}`);
  const answer = await res.json();
  let result;
  try { result = JSON.parse(answer.choices?.[0]?.message?.content ?? '{}').result ?? {}; } catch { result = {}; }

  const suggestions = {};
  for (const { text: name } of items) {
    const raw = result[name];
    const options = Array.isArray(raw) ? raw : Array.isArray(raw?.options) ? raw.options : [raw]; // גם אם המודל החזיר מחרוזת אחת
    const seen = new Set(previous[name] ?? []);
    const valid = [];
    for (const option of options) {
      const nikud = cleanSuggestion(option);
      if (nikud && nikud !== name && /[א-ת]/.test(nikud) && plainName(nikud).length > 0 && !seen.has(nikud)) { valid.push(nikud); seen.add(nikud); }
    }
    if (valid.length) suggestions[name] = valid.slice(0, MAX_OPTIONS);
  }
  return suggestions;
}
