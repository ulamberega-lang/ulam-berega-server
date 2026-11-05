# שמחה בשיחה: שרת

מערכת טלפונית (ימות המשיח) שמחפשת אולם לפי כמות מוזמנים, עיר ושכונה ומעבירה את המתקשר לאולם, ואתר ניהול לאולמות, לסטטיסטיקת שיחות, להודעות קוליות וליומן המיילים לאולמות.

## מבנה

```
server.js                     נקודת הכניסה: מפעיל את השרת
src/
  env-check.js                בדיקת משתני סביבה חיוניים בהפעלה
  config.js                   הגדרות סביבה וקבועים (זמני המתנה, שלוחות)
  app.js                      הרכבת השרת: אילו נתיבים קיימים, כותרות אבטחה
  routes/
    ivr.js                    הנתיבים שימות פונה אליהם (/api/ivr)
    dialer.js                 חייגן יוצא לבעל הפרויקט (/api/dialer)
    admin-api.js              ה-API של אתר הניהול (/admin/api)
    staff-api.js              ה-API של אתר ההוספה של העובד (/staff/api)
    visit.js                  ספירת כניסות לדפי האתר (/api/visit)
  ivr/
    flow.js                   זרימת השיחה: מה נשאל בכל שלב ואיך מטפלים בתשובה
    route-to-hall.js          העברת המתקשר לאולם
    sessions.js               מצב כל שיחה פעילה
    owner-info.js             הודעת "הוספת אולם" (אפשרות 4) ואיות כתובת המייל
  services/
    call-log.js               רישום שיחה: התחלה, העברה, אין מענה, סיום
    mailer.js                 מייל לאולם (Brevo) ורישום ביומן המיילים
    voicemail.js              הודעה קולית (אפשרות 5): שמירה ומייל
    transcriber.js            תמלול הקלטה (ימות → OpenAI), הורדה ומחיקה של הקלטות
    hall-directory.js         אולמות פעילים בזיכרון, וחיפוש לפי כמות/עיר/שכונה
    nikud.js                  ניקוד שמות להקראה (טבלת pronunciations)
    nikud-suggest.js          הצעת ניקוד מ-OpenAI לאתר הניהול
    keep-alive.js             מונע מ-Render להירדם
    channel-log.js            רישום לסטטיסטיקה לפי ערוץ (וואטסאפ, צ'אט, אתר)
  repositories/
    halls.js                  גישה לטבלת האולמות
    calls.js                  גישה ליומן השיחות ולסטטיסטיקה
    voicemails.js             גישה לטבלת ההודעות הקוליות
    mail-log.js               גישה ליומן המיילים
    pronunciations.js         גישה לטבלת הניקוד
    channel-events.js         גישה לטבלת הסטטיסטיקה לפי ערוץ
    submissions.js            גישה לאולמות שהעובד שלח לאישור
  lib/
    yemot.js                  בניית תשובות בפורמט של ימות
    text-match.js             התאמת מה שנאמר לשמות ערים ושכונות
    hall-input.js             בדיקת קלט של טופס אולם
    brevo.js                  שליחת מייל (Brevo)
    supabase.js               חיבור למסד הנתונים
  middleware/
    admin-auth.js             כניסה לאתר הניהול ולאתר העובד (דף כניסה + עוגייה)
    admin-guard.js            הגנה מזיוף בקשות (JSON + Origin)
public/admin/                 אתר הניהול (HTML, עיצוב, JavaScript)
public/staff/                 אתר ההוספה של העובד (משתמש בקוד ובעיצוב של אתר הניהול)
sql/                          קבצי SQL להרצה ב-Supabase
test/                         בדיקות אוטומטיות (npm test)
dev/                          כלי פיתוח: שרת דמה לאתר הניהול, בדיקת עשן, סימולציית שרת
```

## משתני סביבה (Render → Environment)

| משתנה | מה זה |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | חיבור למסד הנתונים (חובה: בלעדיהם השרת לא עולה) |
| `OPENAI_API_KEY` | תמלול דיבור והצעת ניקוד באתר הניהול |
| `OPENAI_NIKUD_MODEL` | (לא חובה) מודל להצעת ניקוד, ברירת מחדל `gpt-4o-mini` |
| `YEMOT_TOKEN` | `מספר_מערכת:סיסמה`, להורדת הקלטות מימות |
| `BREVO_API_KEY`, `MAIL_FROM` | מיילים לאולמות והודעות קוליות |
| `ADMIN_PASSWORD` | סיסמה לאתר הניהול |
| `STAFF_PASSWORD` | (לא חובה) סיסמה לאתר ההוספה של העובד (`/staff`); בלעדיה האתר סגור |

## פיתוח

```
npm ci && npm test        # בדיקות אוטומטיות (כולל סימולציית שרת עם מסד נתונים מדומה)
node dev/mock-admin.mjs   # אתר הניהול עם נתונים מדומים ב-http://localhost:4173/admin/
NODE_PATH=$(npm root -g) node dev/smoke-staff.mjs   # בדיקת דפדפן לאתר העובד ולאישור (מפעילה שרת בעצמה)
```

## אתר הניהול

`https://ulam-berega.onrender.com/admin`. שם המשתמש לא נבדק, הסיסמה היא `ADMIN_PASSWORD`.

## אתר ההוספה של העובד

`https://simcha-besicha.co.il/staff` (מפנה ל-`https://ulam-berega.onrender.com/staff`), עם הסיסמה `STAFF_PASSWORD`. העובד מוסיף אולמות (בטופס או מקובץ אקסל), והם מגיעים ללשונית "לאישור" באתר הניהול. צריך להריץ פעם אחת את `sql/hall_submissions.sql` ב-Supabase.
