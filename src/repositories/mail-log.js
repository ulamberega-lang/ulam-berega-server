// יומן מיילים לאולמות (sql/mail_log.sql).
import { supabase, unwrap } from '../lib/supabase.js';

const TABLE = 'mail_log';
const LIMIT = 500;

export async function record(row) {
  unwrap(await supabase.from(TABLE).insert(row));
}

// ה-500 האחרונים (היומן מיועד לבדיקת תקלות, לא לארכיון)
export async function listRecent() {
  return unwrap(await supabase.from(TABLE).select('*')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(LIMIT));
}
