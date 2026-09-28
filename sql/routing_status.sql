-- תוצאת החיוג לאולם כפי שימות מדווחת. להריץ פעם אחת ב-Supabase → SQL Editor.
alter table leads_log
  add column if not exists dial_status text,    -- ANSWER / NOANSWER / BUSY / CANCEL / CONGESTION
  add column if not exists answer_sec integer;  -- כמה זמן דיברו עם האולם
