// גישה לטבלת halls.
import { supabase, unwrap } from '../lib/supabase.js';

const uniqueSorted = (arr) => [...new Set(arr.filter(Boolean))].sort();

// כמה אולם מותר להיות קטן מכמות המוזמנים ועדיין להופיע בתוצאות
export const guestMargin = (guests) => (guests <= 100 ? 30 : guests <= 250 ? 50 : guests <= 500 ? 100 : 200);

// ---------- למערכת הטלפונית (אולמות פעילים בלבד) ----------

export async function getActiveCities() {
  const rows = unwrap(await supabase.from('halls').select('city_name').eq('is_active', true));
  return uniqueSorted(rows.map((r) => r.city_name));
}

export async function getActiveNeighborhoods(city) {
  const rows = unwrap(await supabase.from('halls').select('neighborhood_name')
    .eq('is_active', true).eq('city_name', city));
  return uniqueSorted(rows.map((r) => r.neighborhood_name));
}

export async function searchHalls({ city, neighborhood, guests }) {
  let query = supabase.from('halls').select('*')
    .eq('is_active', true).eq('city_name', city)
    .gte('max_guests', guests - guestMargin(guests))
    .not('extension', 'is', null)
    .order('max_guests').order('name');
  if (neighborhood) query = query.eq('neighborhood_name', neighborhood);
  return unwrap(await query);
}

export async function findActiveByExtension(extension) {
  return unwrap(await supabase.from('halls').select('*')
    .eq('is_active', true).eq('extension', String(extension)).maybeSingle());
}

export async function findById(id) {
  return unwrap(await supabase.from('halls').select('*').eq('id', id).maybeSingle());
}

// ---------- לאתר הניהול ----------

export async function listAll() {
  return unwrap(await supabase.from('halls').select('*').order('city_name').order('name'));
}

export async function create(hall) {
  return unwrap(await supabase.from('halls').insert(hall).select().single());
}

export async function update(id, hall) {
  return unwrap(await supabase.from('halls').update(hall).eq('id', id).select().single());
}
