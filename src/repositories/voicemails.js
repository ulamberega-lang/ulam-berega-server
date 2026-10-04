// גישה לטבלת voicemails (הודעות קוליות; sql/voicemails.sql).
import { supabase, unwrap, selectAll } from '../lib/supabase.js';

const TABLE = 'voicemails';

export async function create({ callerPhone, path }) {
  return unwrap(await supabase.from(TABLE).insert({ caller_phone: callerPhone || '', yemot_path: path }).select().single());
}

export const listAll = () => selectAll(() => supabase.from(TABLE).select('*')
  .order('created_at', { ascending: false }).order('id', { ascending: false }));

export async function findById(id) {
  return unwrap(await supabase.from(TABLE).select('*').eq('id', id).maybeSingle());
}

export async function setHandled(id, handled) {
  return unwrap(await supabase.from(TABLE).update({ handled }).eq('id', id).select().single());
}

export async function remove(id) {
  return unwrap(await supabase.from(TABLE).delete().eq('id', id));
}
