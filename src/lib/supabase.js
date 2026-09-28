import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// מפתח service role - עוקף RLS. בשימוש בשרת בלבד, לעולם לא בדפדפן.
export const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// Supabase מחזיר { data, error } - כאן הופכים שגיאה לחריגה רגילה
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}
