// מסד נתונים מדומה בזיכרון במקום @supabase/supabase-js, לבדיקות ולסימולציה.
// תומך רק במה שהקוד של הפרויקט משתמש בו: select/insert/update/upsert/delete, eq/is/not/gte, order/range/limit, single/maybeSingle, rpc.
export const db = { halls: [], leads_log: [], pronunciations: [], voicemails: [], mail_log: [] };
export const log = []; // רשימת פעולות, לבדיקות
let idSeq = 1000;

// ערכי ברירת מחדל של עמודות (כמו ב-sql/), כי המסד האמיתי ממלא אותן
const DEFAULTS = {
  voicemails: () => ({ handled: false }),
  leads_log: () => ({ answered: null, dial_status: null, answer_sec: null, ended_at: null, hall_id: null }),
};
const withDefaults = (table, row) => ({ id: ++idSeq, created_at: new Date().toISOString(), ...(DEFAULTS[table]?.() ?? {}), ...row });

export function resetDb() {
  for (const key of Object.keys(db)) db[key].length = 0;
  log.length = 0;
}

class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = 'select'; this.payload = null; this.opts = {}; this.ord = []; this.rng = null; this.lim = null; this.mode = null; }
  select() { return this; }
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  upsert(p, o = {}) { this.op = 'upsert'; this.payload = p; this.opts = o; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v || (r[c] != null && v != null && String(r[c]) === String(v))); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  not(c, op, v) { if (op === 'is' && v === null) this.filters.push((r) => r[c] != null); return this; }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
  order(c, o = {}) { this.ord.push([c, o.ascending === false ? -1 : 1]); return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  // כמו ב-PostgREST: .single() בלי שורה אחת בדיוק היא שגיאה
  single() { this.mode = 'one'; return this; }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
  run() {
    const rows = db[this.table];
    if (!rows) return { data: null, error: { message: `אין טבלה ${this.table} בדמה` } };
    const match = (r) => this.filters.every((f) => f(r));
    let out;
    if (this.op === 'select') {
      out = rows.filter(match).map((r) => ({ ...r }));
      for (const [c, d] of [...this.ord].reverse()) out.sort((a, b) => (a[c] > b[c] ? d : a[c] < b[c] ? -d : 0));
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) out = out.slice(0, this.lim);
    } else if (this.op === 'insert') {
      const row = withDefaults(this.table, this.payload); rows.push(row); out = [{ ...row }];
    } else if (this.op === 'update') {
      out = rows.filter(match); out.forEach((r) => Object.assign(r, this.payload)); out = out.map((r) => ({ ...r }));
    } else if (this.op === 'delete') {
      out = rows.filter(match); out.forEach((r) => rows.splice(rows.indexOf(r), 1));
    } else if (this.op === 'upsert') {
      const key = this.opts.onConflict; let row = rows.find((x) => x[key] === this.payload[key]);
      if (row) Object.assign(row, this.payload); else { row = withDefaults(this.table, this.payload); rows.push(row); }
      out = [{ ...row }];
    }
    log.push([this.op, this.table, this.payload ?? null]);
    if (this.mode) {
      if (this.mode === 'one' && out.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: out[0] ?? null, error: null };
    }
    return { data: out, error: null };
  }
}
export function createClient() {
  return { from: (table) => new Query(table), rpc: async () => ({ data: [], error: null }) };
}
