// גישה לטבלת leads_log (שורה לכל שיחה) ולפונקציות הסטטיסטיקה ב-Supabase (sql/call_stats.sql).
import { supabase, unwrap } from '../lib/supabase.js';

const TABLE = 'leads_log';

export async function recordCallStart(callId, callerPhone) {
  unwrap(await supabase.from(TABLE).upsert(
    { yemot_call_id: callId, caller_phone: callerPhone || '', source: 'phone_ivr' },
    { onConflict: 'yemot_call_id' },
  ));
}

// answered מתאפס בכל ניסיון - אם אולם קודם לא ענה והמתקשר בחר אולם אחר
export async function recordRouting(callId, callerPhone, hallId, calledPhone) {
  unwrap(await supabase.from(TABLE).upsert({
    yemot_call_id: callId,
    caller_phone: callerPhone || '',
    source: 'phone_ivr',
    hall_id: hallId,
    called_phone: calledPhone,
    answered: null,
  }, { onConflict: 'yemot_call_id' }));
}

export async function findByCallId(callId) {
  return unwrap(await supabase.from(TABLE)
    .select('created_at, answered, hall_id, caller_phone, ended_at')
    .eq('yemot_call_id', callId).maybeSingle());
}

export async function updateByCallId(callId, patch) {
  return unwrap(await supabase.from(TABLE).update(patch).eq('yemot_call_id', callId)
    .select('created_at, answered, hall_id, caller_phone').maybeSingle());
}

// ---------- לאתר הניהול (תאריכים בפורמט YYYY-MM-DD, לפי שעון ישראל) ----------

export async function statsByHall(from, to) {
  return unwrap(await supabase.rpc('call_stats_by_hall', { p_from: from, p_to: to }));
}

export async function statsByDay(from, to, hallId = null) {
  return unwrap(await supabase.rpc('call_stats_by_day', { p_from: from, p_to: to, p_hall_id: hallId }));
}

export async function listCalls(from, to, hallId = null, limit = 500) {
  return unwrap(await supabase.rpc('calls_between', { p_from: from, p_to: to, p_hall_id: hallId, p_limit: limit }));
}
