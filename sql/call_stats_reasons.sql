-- מוסיף לסטטיסטיקה את פירוט הסיבות ל"לא נענה" (המתקשר ניתק, תפוס, תקלה בחיוג).
-- להריץ פעם אחת ב-Supabase → SQL Editor. משנים את העמודות המוחזרות, ולכן מוחקים את הפונקציות ומגדירים מחדש.
drop function if exists call_stats_by_hall(date, date);
drop function if exists call_stats_by_day(date, date, bigint);

create function call_stats_by_hall(p_from date, p_to date)
returns table (hall_id bigint, total bigint, answered bigint, unanswered bigint, cancelled bigint, busy bigint, failed bigint)
language sql stable as $$
  select hall_id,
         count(*),
         count(*) filter (where answered is true),
         count(*) filter (where answered is false),
         count(*) filter (where answered is false and dial_status = 'CANCEL'),
         count(*) filter (where answered is false and dial_status = 'BUSY'),
         count(*) filter (where answered is false and dial_status = 'CONGESTION')
  from leads_log
  where hall_id is not null
    and created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
    and created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
  group by hall_id
$$;

create function call_stats_by_day(p_from date, p_to date, p_hall_id bigint default null)
returns table (day date, calls bigint, reached bigint, answered bigint, unanswered bigint, cancelled bigint, busy bigint, failed bigint)
language sql stable as $$
  select (created_at at time zone 'Asia/Jerusalem')::date,
         count(*),
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

revoke execute on function call_stats_by_hall(date, date) from public, anon, authenticated;
revoke execute on function call_stats_by_day(date, date, bigint) from public, anon, authenticated;
grant execute on function call_stats_by_hall(date, date) to service_role;
grant execute on function call_stats_by_day(date, date, bigint) to service_role;
