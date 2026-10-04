// נטען ראשון ב-server.js (לפני החיבור ל-Supabase): בלי המשתנים החיוניים עדיף להיכשל מיד עם הודעה ברורה
// מאשר שגיאות מוזרות באמצע שיחה.
const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((name) => !process.env[name]);
if (missing.length) { console.error(`חסר משתנה סביבה ב-Render: ${missing.join(', ')}`); process.exit(1); }
for (const name of ['OPENAI_API_KEY', 'YEMOT_TOKEN', 'ADMIN_PASSWORD', 'BREVO_API_KEY', 'MAIL_FROM']) {
  if (!process.env[name]) console.error(`אזהרה: משתנה הסביבה ${name} לא מוגדר, ולכן חלק מהפעולות לא יעבדו`);
}
