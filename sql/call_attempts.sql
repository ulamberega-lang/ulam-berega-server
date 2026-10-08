-- שורה לכל ניסיון העברה ביומן השיחות: שיחה שניסתה כמה אולמות (למשל הראשון היה תפוס) נרשמת בכמה שורות.
-- להריץ פעם אחת ב-Supabase → SQL Editor, ומיד אחר כך (או לפני) למזג את הקוד שמשתמש בעמודה attempt.
-- אחרי ההרצה: קוד ישן לא יצליח לרשום שיחות, וקוד חדש לא יצליח לפני ההרצה (רישום השיחות נכשל בלבד, ההעברה עובדת).

alter table leads_log add column if not exists attempt integer not null default 1;

-- מסירים את אילוץ הייחודיות על yemot_call_id לבדו (השם בפועל לא ידוע, לכן מחפשים אותו)
do $$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'leads_log'::regclass and c.contype = 'u'
      and (select array_agg(a.attname::text) from pg_attribute a
           where a.attrelid = c.conrelid and a.attnum = any(c.conkey)) = array['yemot_call_id']
  loop
    execute format('alter table leads_log drop constraint %I', r.conname);
  end loop;
end $$;

-- שיחה + מספר ניסיון: מפתח הרישום (upsert בתחילת שיחה תלוי באינדקס הזה)
create unique index if not exists leads_log_call_attempt_key on leads_log (yemot_call_id, attempt);

-- "שיחות למערכת" - שיחות אמיתיות (לא ניסיונות); "הועברו לאולם" נשאר מספר ההעברות. אותה חתימה כמו ב-call_stats_reasons.sql
create or replace function call_stats_by_day(p_from date, p_to date, p_hall_id bigint default null)
returns table (day date, calls bigint, reached bigint, answered bigint, unanswered bigint, cancelled bigint, busy bigint, failed bigint)
language sql stable as $$
  select (created_at at time zone 'Asia/Jerusalem')::date,
         count(distinct yemot_call_id),
         count(*) filter (where hall_id is not null),
         count(*) filter (where answered is true),
         count(*) filter (where answered is false),
         count(*) filter (where answered is false and dial_status = 'CANCEL'),
         count(*) filter (where answered is false and dial_status = 'BUSY'),
         count(*) filter (where answered is false and dial_status = 'CONGESTION')
  from leads_log
  where created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
    and created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
    and (p_hall_id is null or hall_id = p_hall_id)
  group by 1
  order by 1
$$;
