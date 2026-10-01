-- פונקציות סטטיסטיקה לאתר הניהול. להריץ פעם אחת ב-Supabase → SQL Editor.
-- הימים נספרים לפי שעון ישראל.

create index if not exists leads_log_created_at_idx on leads_log (created_at);

-- שיחות לכל אולם בטווח תאריכים
create or replace function call_stats_by_hall(p_from date, p_to date)
returns table (hall_id bigint, total bigint, answered bigint, unanswered bigint, last_call timestamptz)
language sql stable as $$
  select hall_id,
         count(*),
         count(*) filter (where answered is true),
         count(*) filter (where answered is false),
         max(created_at)
  from leads_log
  where hall_id is not null
    and created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
    and created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
  group by hall_id
$$;

-- שיחות לכל יום (לכל המערכת, או לאולם אחד)
create or replace function call_stats_by_day(p_from date, p_to date, p_hall_id bigint default null)
returns table (day date, calls bigint, reached bigint, answered bigint, unanswered bigint)
language sql stable as $$
  select (created_at at time zone 'Asia/Jerusalem')::date,
         count(*),
         count(*) filter (where hall_id is not null),
         count(*) filter (where answered is true),
         count(*) filter (where answered is false)
  from leads_log
  where created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
    and created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
    and (p_hall_id is null or hall_id = p_hall_id)
  group by 1
  order by 1
$$;

-- רשימת השיחות האחרונות בטווח
create or replace function calls_between(p_from date, p_to date, p_hall_id bigint default null, p_limit int default 500)
returns setof leads_log
language sql stable as $$
  select * from leads_log
  where created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
    and created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
    and (p_hall_id is null or hall_id = p_hall_id)
  order by created_at desc
  limit p_limit
$$;

-- רק השרת (service role) מריץ אותן
revoke execute on function call_stats_by_hall(date, date) from public, anon, authenticated;
revoke execute on function call_stats_by_day(date, date, bigint) from public, anon, authenticated;
revoke execute on function calls_between(date, date, bigint, int) from public, anon, authenticated;
grant execute on function call_stats_by_hall(date, date) to service_role;
grant execute on function call_stats_by_day(date, date, bigint) to service_role;
grant execute on function calls_between(date, date, bigint, int) to service_role;
