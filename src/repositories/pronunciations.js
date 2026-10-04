// גישה לטבלת pronunciations (word = השם בלי ניקוד, nikud = איך להקריא אותו; sql/pronunciations.sql).
import { supabase, unwrap, selectAll } from '../lib/supabase.js';

const TABLE = 'pronunciations';

export const listAll = () => selectAll(() => supabase.from(TABLE).select('word, nikud').order('word'));

export async function save(word, nikud) {
  return unwrap(await supabase.from(TABLE).upsert({ word, nikud }, { onConflict: 'word' }).select('word, nikud').single());
}

export async function remove(word) {
  unwrap(await supabase.from(TABLE).delete().eq('word', word));
}
