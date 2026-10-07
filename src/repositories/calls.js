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
    dial_status: null,
    answer_sec: null,
  }, { onConflict: 'yemot_call_id' }));
}

// שיחה שלא נחשבת שיחת מערכת (בעל הפרויקט עבר לחייגן היוצא)
export async function deleteByCallId(callId) {
  unwrap(await supabase.from(TABLE).delete().eq('yemot_call_id', callId));
}

export async function findByCallId(callId) {
  return unwrap(await supabase.from(TABLE)
    .select('created_at, answered, hall_id, caller_phone, ended_at, dial_status')
    .eq('yemot_call_id', callId).maybeSingle());
}

// השיחה האחרונה של המתקשר שהועברה לאולם ועוד לא התקבלה לה תוצאת חיוג (ב-3 השעות האחרונות)
export async function findOpenRoutingByCaller(callerPhone) {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  return unwrap(await supabase.from(TABLE).select('yemot_call_id')
    .eq('caller_phone', callerPhone).not('hall_id', 'is', null).is('dial_status', null)
    .gte('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle());
}

// מסמן "נענה" רק אם הניסיון הנוכחי עוד פתוח; מחזיר null אם כבר סומן
export async function markAnswered(callId) {
  return unwrap(await supabase.from(TABLE).update({ answered: true })
    .eq('yemot_call_id', callId).is('answered', null)
    .select('created_at, answered, hall_id, caller_phone').maybeSingle());
}

// מסמן "לא נענה" רק אם הניסיון הנוכחי עוד פתוח; מחזיר null אם כבר סומן
export async function markNotAnswered(callId) {
  return unwrap(await supabase.from(TABLE).update({ answered: false })
    .eq('yemot_call_id', callId).is('answered', null)
    .select('created_at, answered, hall_id, caller_phone').maybeSingle());
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
