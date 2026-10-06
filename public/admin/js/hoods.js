// אולם יכול להיות רשום בכמה שכונות: בשדה השכונה כותבים אותן עם / ביניהן (למשל "גאולה / בית וגן").
// אולם יכול להיות עם כמה שמות (למשל שם האולם ושם נוסף): כותבים אותם עם / ביניהן. כל שם ניתן לחיפוש בנפרד,
// ובהקראה נאמר הראשון בלבד (במייל וביומן מופיע השם המלא).
export const splitNames = (text) => String(text ?? '').split('/').map((s) => s.trim()).filter(Boolean);
export const primaryName = (text) => splitNames(text)[0] ?? String(text ?? '');

export const splitHoods = (text) => String(text ?? '').split(/[\/,،]/).map((s) => s.trim()).filter(Boolean);
