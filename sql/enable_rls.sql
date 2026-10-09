-- הגנה על המסד: RLS על כל הטבלאות (בלי מדיניות - רק service_role, שהשרת משתמש בו, ניגש אליהן),
-- והפונקציות של הסטטיסטיקה סגורות ל-anon ול-authenticated. בטוח להריץ שוב ושוב.
-- השרת עובד עם SUPABASE_SERVICE_ROLE_KEY שעוקף RLS, ולכן שום דבר באתר או בטלפון לא משתנה.

alter table halls enable row level security;
alter table leads_log enable row level security;
alter table pronunciations enable row level security;
alter table voicemails enable row level security;
alter table mail_log enable row level security;

revoke execute on function call_stats_by_hall(date, date) from public, anon, authenticated;
revoke execute on function call_stats_by_day(date, date, bigint) from public, anon, authenticated;
revoke execute on function calls_between(date, date, bigint, int) from public, anon, authenticated;
grant execute on function call_stats_by_hall(date, date) to service_role;
grant execute on function call_stats_by_day(date, date, bigint) to service_role;
grant execute on function calls_between(date, date, bigint, int) to service_role;

-- בדיקה: כל הטבלאות צריכות להראות rls_enabled = true
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
