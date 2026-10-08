// גישה לטבלת leads_log (שורה לכל ניסיון העברה: שיחה שניסתה כמה אולמות נרשמת בכמה שורות, attempt = 1, 2...)
// ולפונקציות הסטטיסטיקה ב-Supabase (sql/call_stats.sql, sql/call_attempts.sql).
import { supabase, unwrap } from '../lib/supabase.js';

const TABLE = 'leads_log';
const COLUMNS = 'id, attempt, created_at, answered, hall_id, caller_phone, ended_at, dial_status';

export async function recordCallStart(callId, callerPhone) {
  unwrap(await supabase.from(TABLE).upsert(
    { yemot_call_id: callId, attempt: 1, caller_phone: callerPhone || '', source: 'phone_ivr' },
    { onConflict: 'yemot_call_id,attempt' },
  ));
}

// הניסיון האחרון של השיחה: כל תוצאה (נענה, תוצאת חיוג, סיום) שייכת אליו
async function latest(callId) {
  return unwrap(await supabase.from(TABLE).select(COLUMNS)
    .eq('yemot_call_id', callId).order('attempt', { ascending: false }).limit(1).maybeSingle());
}

// ניסיון ראשון: ממלאים את השורה שנפתחה בתחילת השיחה. ניסיון נוסף (אחרי שאולם לא ענה והמתקשר בחר אחר):
// סוגרים את השורה הקודמת ופותחים שורה חדשה, כדי שיומן השיחות יראה כל אולם שנוסה
export async function recordRouting(callId, callerPhone, hallId, calledPhone) {
  const row = {
    caller_phone: callerPhone || '',
    source: 'phone_ivr',
    hall_id: hallId,
    called_phone: calledPhone,
    answered: null,
    dial_status: null,
    answer_sec: null,
  };
  const last = await latest(callId);
  if (last && last.hall_id == null) {
    unwrap(await supabase.from(TABLE).update(row).eq('id', last.id));
    return;
  }
  if (last && !last.ended_at) {
    unwrap(await supabase.from(TABLE).update({
      ended_at: new Date().toISOString(),
      duration_sec: Math.round((Date.now() - new Date(last.created_at).getTime()) / 1000),
    }).eq('id', last.id));
  }
  unwrap(await supabase.from(TABLE).insert({ yemot_call_id: callId, attempt: (last?.attempt ?? 0) + 1, ...row }));
}

// שיחה שלא נחשבת שיחת מערכת (בעל הפרויקט עבר לחייגן היוצא)
export async function deleteByCallId(callId) {
  unwrap(await supabase.from(TABLE).delete().eq('yemot_call_id', callId));
}

export const findByCallId = latest;

// השיחה האחרונה של המתקשר שהועברה לאולם ועוד לא התקבלה לה תוצאת חיוג (ב-3 השעות האחרונות)
export async function findOpenRoutingByCaller(callerPhone) {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  return unwrap(await supabase.from(TABLE).select('yemot_call_id')
    .eq('caller_phone', callerPhone).not('hall_id', 'is', null).is('dial_status', null)
    .gte('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle());
}

const RETURNED = 'created_at, answered, hall_id, caller_phone';

export async function markAnswered(callId) {
  const last = await latest(callId);
  if (!last) return null;
  return unwrap(await supabase.from(TABLE).update({ answered: true })
    .eq('id', last.id).is('answered', null).select(RETURNED).maybeSingle());
}

// מסמן "לא נענה" רק אם הניסיון הנוכחי עוד פתוח; מחזיר null אם כבר סומן
export async function markNotAnswered(callId) {
  const last = await latest(callId);
  if (!last) return null;
  return unwrap(await supabase.from(TABLE).update({ answered: false })
    .eq('id', last.id).is('answered', null).select(RETURNED).maybeSingle());
}

export async function updateByCallId(callId, patch) {
  const last = await latest(callId);
  if (!last) return null;
  return unwrap(await supabase.from(TABLE).update(patch).eq('id', last.id).select(RETURNED).maybeSingle());
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
