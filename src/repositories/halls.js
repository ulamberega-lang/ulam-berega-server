// גישה לטבלת halls.
import { supabase, unwrap, selectAll } from '../lib/supabase.js';

// כמה אולם מותר להיות קטן מכמות המוזמנים ועדיין להופיע בתוצאות
export const guestMargin = (guests) => (guests <= 100 ? 30 : guests <= 250 ? 50 : guests <= 500 ? 100 : 200);

// ---------- למערכת הטלפונית (נטען לזיכרון דרך services/hall-directory.js) ----------

export async function getActiveHalls() {
  return selectAll(() => supabase.from('halls').select('*')
    .eq('is_active', true).not('extension', 'is', null).order('name').order('id'));
}

export async function findById(id) {
  return unwrap(await supabase.from('halls').select('*').eq('id', id).maybeSingle());
}

// ---------- לאתר הניהול ----------

export async function listAll() {
  return selectAll(() => supabase.from('halls').select('*').order('city_name').order('name').order('id'));
}

export async function create(hall) {
  return unwrap(await supabase.from('halls').insert(hall).select().single());
}

export async function update(id, hall) {
  return unwrap(await supabase.from('halls').update(hall).eq('id', id).select().single());
}
