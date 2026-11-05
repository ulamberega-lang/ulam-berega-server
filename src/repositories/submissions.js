// גישה לטבלת hall_submissions: אולמות שעובד הגיש מאתר ההוספה וממתינים לאישור (sql/hall_submissions.sql).
import { supabase, unwrap, selectAll } from '../lib/supabase.js';

export async function create(data, note) {
  return unwrap(await supabase.from('hall_submissions').insert({ data, note }).select().single());
}

// כל ההגשות (לעובד: מה ממתין, מה אושר ומה נדחה), מהחדשה לישנה
export async function listAll() {
  return selectAll(() => supabase.from('hall_submissions').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }));
}

export async function listPending() {
  return selectAll(() => supabase.from('hall_submissions').select('*').eq('status', 'pending').order('created_at').order('id'));
}

export async function findById(id) {
  return unwrap(await supabase.from('hall_submissions').select('*').eq('id', id).maybeSingle());
}

// החלטה (אישור או דחייה): רק על הגשה שעדיין ממתינה, כדי שלא יאושר פעמיים
export async function decide(id, fields) {
  return unwrap(await supabase.from('hall_submissions').update({ ...fields, decided_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select().maybeSingle());
}

// העובד מבטל הגשה שעדיין ממתינה
export async function removePending(id) {
  return unwrap(await supabase.from('hall_submissions').delete().eq('id', id).eq('status', 'pending').select());
}
