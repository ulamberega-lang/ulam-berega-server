// יומן מיילים לאולמות (sql/mail_log.sql).
import { supabase, unwrap } from '../lib/supabase.js';

const TABLE = 'mail_log';
const LIMIT = 500;

export async function record(row) {
  unwrap(await supabase.from(TABLE).insert(row));
}

// המייל האחרון שנשלח בפועל (status = sent) לאותו אולם על אותו מתקשר מאז since
export async function lastForCaller(hallId, callerPhone, since) {
  return unwrap(await supabase.from(TABLE).select('answered')
    .eq('hall_id', hallId).eq('caller_phone', callerPhone).eq('status', 'sent').gte('created_at', since)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle());
}

// ה-500 האחרונים (היומן מיועד לבדיקת תקלות, לא לארכיון)
export async function listRecent() {
  return unwrap(await supabase.from(TABLE).select('*')
    .neq('status', 'no_email') // רשומות ישנות של אולם בלי כתובת (כבר לא נרשמות)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(LIMIT));
}
