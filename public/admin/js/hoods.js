// אולם יכול להיות רשום בכמה שכונות: בשדה השכונה כותבים אותן עם / ביניהן (למשל "גאולה / בית וגן").
export const splitHoods = (text) => String(text ?? '').split(/[\/,،]/).map((s) => s.trim()).filter(Boolean);
