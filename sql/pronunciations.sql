-- טבלת ניקוד להקראה: word = השם כמו שהוא בטבלת halls (בלי ניקוד), nikud = איך להקריא אותו.
-- להריץ פעם אחת ב-Supabase → SQL Editor. הטבלה נוצרת ריקה: את הניקודים מזינים ומעדכנים באתר הניהול
-- (ניהול אולמות ← ניקוד הקראה), שם גם מוצעים כל השמות שעוד אין להם ניקוד.
create table if not exists pronunciations (
  word  text primary key,
  nikud text not null
);
alter table pronunciations enable row level security;
