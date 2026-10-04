// הצעת ניקוד לשמות (OpenAI), לשונית "ניקוד הקראה" באתר הניהול. ההצעה לא נשמרת: מנהל האתר בודק ומאשר.
import { config } from '../config.js';
import { plainName } from '../lib/hall-input.js';

const TIMEOUT_MS = 25000;
const KIND_LABEL = { city: 'עיר בישראל', hood: 'שכונה', hall: 'אולם אירועים', synagogue: 'בית כנסת' };

const RULES = `אתה מנקד שמות בעברית למנוע הקראה טלפוני. לכל שם החזר את אותו שם בניקוד מלא, כפי שהוא נהגה בעברית ישראלית מדוברת.
כללים:
1. נקד כל אות. שם של עיר, שכונה או בית כנסת - לפי ההגייה המקובלת בישראל.
2. המנוע מתעלם משווא: במקום שבו השווא נע (נהגה כתנועה) כתוב סגול במקומו. שווא נח השאר שווא.
3. כתוב את השם בלבד, בלי סימני פיסוק (נקודה, פסיק, מקף, גרש, גרשיים), בלי הסברים ובלי תוספות.
4. מילה באנגלית או מספר - השאר כמו שהם.
5. אותו השם בלי הניקוד חייב להישאר זהה לשם שקיבלת (אל תשנה אותיות), חוץ ממקרים שמצוינים בדוגמאות (למשל איות אות).
החזר JSON בלבד בצורה {"result": {"<השם כפי שקיבלת>": "<השם מנוקד>"}}.`;

// ניקוי מה שהמודל החזיר: בלי תווים שמפרידים בפקודות ימות, ובלי רווחים כפולים
const cleanSuggestion = (text) => String(text ?? '').replace(/[.,\-=&"'|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

// items: [{ text, kind }]; previous: { [text]: [הצעות קודמות] } (להצעה שונה); examples: [{ word, nikud }] מהטבלה הקיימת
export async function suggestNikud(items, previous = {}, examples = []) {
  if (!config.openaiKey) throw new Error('OPENAI_API_KEY לא מוגדר');
  const retry = items.some((i) => previous[i.text]?.length);
  const shots = examples.map((e) => `${e.word} → ${e.nikud}`).join('\n');
  const names = items.map((i) => `- ${i.text}${KIND_LABEL[i.kind] ? ` (${KIND_LABEL[i.kind]})` : ''}${previous[i.text]?.length ? ` — הצעות קודמות שנדחו, הצע ניקוד או הגייה שונים מהן: ${previous[i.text].join(' | ')}` : ''}`).join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: config.nikudModel,
      temperature: retry ? 1 : 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RULES },
        { role: 'user', content: `${shots ? `דוגמאות מהטבלה הקיימת (שם → ניקוד):\n${shots}\n\n` : ''}נקד את השמות הבאים:\n${names}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  let result;
  try { result = JSON.parse(body.choices?.[0]?.message?.content ?? '{}').result ?? {}; } catch { result = {}; }

  const suggestions = {};
  for (const { text } of items) {
    const nikud = cleanSuggestion(result[text]);
    if (nikud && nikud !== text && /[א-ת]/.test(nikud) && plainName(nikud).length > 0) suggestions[text] = nikud;
  }
  return suggestions;
}
