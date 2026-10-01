-- שם בית הכנסת שהאולם נמצא בבניין שלו (לא חובה). להריץ פעם אחת ב-Supabase → SQL Editor, לפני המיזוג.
alter table halls add column if not exists synagogue_name text;
