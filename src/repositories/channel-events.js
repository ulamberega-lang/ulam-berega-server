// סטטיסטיקה לפי ערוץ: טבלת channel_events ופונקציות הסיכום שלה (sql/channel_events.sql).
import { supabase, unwrap } from '../lib/supabase.js';

export async function record(row) {
  unwrap(await supabase.from('channel_events').insert(row));
}

export async function statsByDay(from, to) {
  return unwrap(await supabase.rpc('channel_stats_by_day', { p_from: from, p_to: to }));
}

export async function totals(from, to) {
  return unwrap(await supabase.rpc('channel_totals', { p_from: from, p_to: to }));
}

export async function visitBreakdown(from, to) {
  return unwrap(await supabase.rpc('channel_visit_breakdown', { p_from: from, p_to: to }));
}
