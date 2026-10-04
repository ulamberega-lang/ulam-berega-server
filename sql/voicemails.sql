-- הודעות קוליות שהושארו בקו (אפשרות 5 בתפריט). להריץ פעם אחת ב-Supabase → SQL Editor.
-- ההקלטה עצמה נשארת בימות (yemot_path); הטבלה שומרת מי הקליט ומתי, והאם כבר טופל.
create table if not exists voicemails (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  caller_phone text not null default '',
  yemot_path text not null,
  handled boolean not null default false
);
create index if not exists voicemails_created_at_idx on voicemails (created_at desc);
-- רק השרת (service role) ניגש לטבלה
alter table voicemails enable row level security;
