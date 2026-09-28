import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// מפתח service role - עוקף RLS. בשימוש בשרת בלבד, לעולם לא בדפדפן.
export const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// Supabase מחזיר { data, error } - כאן הופכים שגיאה לחריגה רגילה
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// Supabase מחזיר עד 1,000 שורות בבקשה - שולפים בדפים עד הסוף.
// buildQuery מחזיר שאילתה חדשה בכל קריאה (חייב לכלול order כדי שהדפים יהיו עקביים)
export async function selectAll(buildQuery) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = unwrap(await buildQuery().range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}
