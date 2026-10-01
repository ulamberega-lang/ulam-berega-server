-- מוסיף לסטטיסטיקה לפי אולם את מועד השיחה האחרונה. להריץ פעם אחת ב-Supabase → SQL Editor.
-- (משנים את העמודות המוחזרות, לכן צריך למחוק את הפונקציה ולהגדיר אותה מחדש.)
drop function if exists call_stats_by_hall(date, date);
create function call_stats_by_hall(p_from date, p_to date)
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

revoke execute on function call_stats_by_hall(date, date) from public, anon, authenticated;
grant execute on function call_stats_by_hall(date, date) to service_role;
