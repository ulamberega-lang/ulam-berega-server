-- תיעוד בלבד, לא להריץ על המסד הקיים!
-- הטבלאות halls ו-leads_log נוצרו ב-Supabase לפני שהוחלט לשמור קבצי SQL במאגר. המבנה כאן משוחזר מהקוד
-- (src/repositories, admin-api, call-log) ולא נבדק מול המסד האמיתי: יש להשוות אותו ל-Table Editor ב-Supabase
-- ולתקן כאן מה שונה. אם נוצרת סביבה חדשה: ליצור את שתי הטבלאות לפי זה, ואז להריץ את שאר קבצי ה-SQL לפי הסדר:
-- call_stats.sql, call_stats_reasons.sql (אחריו), routing_status.sql (אם העמודות חסרות), call_attempts.sql (אחרי שלושתן), synagogue_name.sql,
-- pronunciations.sql, voicemails.sql, mail_log.sql.

create table if not exists halls (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,
  synagogue_name text,
  city_name text not null,
  neighborhood_name text,        -- כמה שכונות מופרדות ב-/
  address text,
  max_guests integer not null,
  gabbai_phone text not null,    -- ספרות בלבד, מתחיל ב-0
  gabbai_email text,
  extension text unique,         -- 2 עד 4 ספרות; אילוץ ייחודיות (שגיאה 23505 מוצגת באתר כ"השלוחה בשימוש")
  is_active boolean not null default true
);

create table if not exists leads_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  yemot_call_id text not null,          -- אחרי call_attempts.sql: ייחודי רק יחד עם attempt (אינדקס leads_log_call_attempt_key); upsert ב-calls.js תלוי בו
  attempt integer not null default 1,  -- ניסיון העברה בתוך השיחה (call_attempts.sql); בלי הקובץ אין את העמודה
  caller_phone text not null default '',
  source text,                          -- phone_ivr
  hall_id bigint references halls (id),
  called_phone text,
  answered boolean,                     -- null = אין עדיין תוצאה (לא מנחשים)
  dial_status text,                     -- ANSWER / NOANSWER / BUSY / CANCEL / CONGESTION
  answer_sec integer,
  ended_at timestamptz,
  duration_sec integer
);
