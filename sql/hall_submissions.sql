-- אולמות שעובד הגיש מאתר ההוספה (/staff) וממתינים לאישור בעל הפרויקט (לשונית "לאישור" באתר הניהול).
-- להריץ פעם אחת ב-Supabase → SQL Editor. בלי הטבלה אתר ההוספה מציג שגיאה, ושאר המערכת עובדת כרגיל.
-- data: פרטי האולם כפי שהעובד מילא (שם, בית כנסת, עיר, שכונה, כתובת, מקסימום אורחים, טלפון, מייל), בלי שלוחה.
-- באישור נוצר אולם בטבלת halls (עם השלוחה שנבחרה באישור), והשורה כאן נשארת עם hall_id לתיעוד.
create table if not exists hall_submissions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  data jsonb not null,
  note text not null default '',          -- הערה של העובד לבעל הפרויקט
  reason text not null default '',        -- סיבת דחייה (מוצגת לעובד)
  hall_id bigint references halls (id) on delete set null,
  decided_at timestamptz
);
create index if not exists hall_submissions_status_idx on hall_submissions (status, created_at);
-- רק השרת (service role) ניגש לטבלה
alter table hall_submissions enable row level security;
