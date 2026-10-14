-- סטטיסטיקה לפי ערוץ: וואטסאפ, צ'אט באתר וכניסות לאתר (לשונית "וואטסאפ, צ'אט ואתר" באתר הניהול).
-- להריץ פעם אחת ב-Supabase → SQL Editor. בלי הטבלה הבוט והאתר עובדים כרגיל, רק הספירה לא נשמרת.
-- visitor: מזהה מגובב (HMAC) של מספר הוואטסאפ או של מזהה הדפדפן, כדי לספור משתמשים שונים בלי לשמור את המספר עצמו.
create table if not exists channel_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  channel text not null,                 -- whatsapp | web (צ'אט באתר) | site (כניסה לדף באתר)
  kind text not null,                    -- message (הודעה לבוט) | found (קיבל פרטי אולם) | visit (כניסה לדף)
  visitor text not null default '',
  page text not null default '',         -- בכניסה לאתר: הדף
  source text not null default ''        -- בכניסה לאתר: מאיפה הגיע (דומיין), internal = מעבר בתוך האתר, ריק = כניסה ישירה
);
create index if not exists channel_events_created_at_idx on channel_events (created_at);
-- רק השרת (service role) ניגש לטבלה
alter table channel_events enable row level security;

-- לפי יום ולפי ערוץ: משתמשים שונים, הודעות, משתמשים שקיבלו פרטי אולם, כניסות לאתר
create or replace function channel_stats_by_day(p_from date, p_to date)
returns table (day date, channel text, users bigint, messages bigint, found_users bigint, visits bigint)
language sql stable as $$
  select (created_at at time zone 'Asia/Jerusalem')::date, channel,
         count(distinct visitor),
         count(*) filter (where kind = 'message'),
         count(distinct visitor) filter (where kind = 'found'),
         count(*) filter (where kind = 'visit')
  from channel_events
  where created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
    and created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
  group by 1, 2
  order by 1, 2
$$;

-- סיכום לכל הטווח (משתמש שחזר בכמה ימים נספר פעם אחת)
create or replace function channel_totals(p_from date, p_to date)
returns table (channel text, users bigint, messages bigint, found_users bigint, visits bigint)
language sql stable as $$
  select channel,
         count(distinct visitor),
         count(*) filter (where kind = 'message'),
         count(distinct visitor) filter (where kind = 'found'),
         count(*) filter (where kind = 'visit')
  from channel_events
  where created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
    and created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
  group by 1
$$;

-- כניסות לאתר לפי דף ולפי מקור (dim = page | source)
create or replace function channel_visit_breakdown(p_from date, p_to date)
returns table (dim text, value text, visits bigint, users bigint)
language sql stable as $$
  with v as (
    select page, source, visitor from channel_events
    where kind = 'visit'
      and created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
      and created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
  )
  select 'page', page, count(*), count(distinct visitor) from v group by page
  union all
  select 'source', source, count(*), count(distinct visitor) from v group by source
$$;

revoke execute on function channel_stats_by_day(date, date) from public, anon, authenticated;
revoke execute on function channel_totals(date, date) from public, anon, authenticated;
revoke execute on function channel_visit_breakdown(date, date) from public, anon, authenticated;
grant execute on function channel_stats_by_day(date, date) to service_role;
grant execute on function channel_totals(date, date) to service_role;
grant execute on function channel_visit_breakdown(date, date) to service_role;
