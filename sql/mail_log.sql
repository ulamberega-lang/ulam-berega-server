-- יומן המיילים שנשלחים לאולמות (לשונית "מיילים" באתר הניהול). להריץ פעם אחת ב-Supabase → SQL Editor.
-- status: sent (התקבל ב-Brevo) | failed (השליחה נכשלה, הסיבה ב-error) | no_email (לאולם אין כתובת מייל)
create table if not exists mail_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  hall_id bigint,
  hall_name text not null default '',
  to_email text not null default '',
  caller_phone text not null default '',
  answered boolean not null default false,
  status text not null,
  error text not null default ''
);
create index if not exists mail_log_created_at_idx on mail_log (created_at desc);
-- רק השרת (service role) ניגש לטבלה
alter table mail_log enable row level security;
