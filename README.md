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
    admin-api.js              ה-API של אתר הניהול (/admin/api)
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
    keep-alive.js             מונע מ-Render להירדם
  repositories/
    halls.js                  גישה לטבלת האולמות
    calls.js                  גישה ליומן השיחות ולסטטיסטיקה
    voicemails.js             גישה לטבלת ההודעות הקוליות
    mail-log.js               גישה ליומן המיילים
    pronunciations.js         גישה לטבלת הניקוד
  lib/
    yemot.js                  בניית תשובות בפורמט של ימות
    text-match.js             התאמת מה שנאמר לשמות ערים ושכונות
    hall-input.js             בדיקת קלט של טופס אולם
    brevo.js                  שליחת מייל (Brevo)
    supabase.js               חיבור למסד הנתונים
  middleware/
    admin-auth.js             כניסה לאתר הניהול (דף כניסה + עוגייה)
    admin-guard.js            הגנה מזיוף בקשות (JSON + Origin)
public/admin/                 אתר הניהול (HTML, עיצוב, JavaScript)
sql/                          קבצי SQL להרצה ב-Supabase
test/                         בדיקות אוטומטיות (npm test)
dev/                          כלי פיתוח: שרת דמה לאתר הניהול, בדיקת עשן, סימולציית שרת
```

## משתני סביבה (Render → Environment)

| משתנה | מה זה |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | חיבור למסד הנתונים (חובה: בלעדיהם השרת לא עולה) |
| `OPENAI_API_KEY` | תמלול דיבור |
| `YEMOT_TOKEN` | `מספר_מערכת:סיסמה`, להורדת הקלטות מימות |
| `BREVO_API_KEY`, `MAIL_FROM` | מיילים לאולמות והודעות קוליות |
| `ADMIN_PASSWORD` | סיסמה לאתר הניהול |

## פיתוח

```
npm ci && npm test        # בדיקות אוטומטיות (כולל סימולציית שרת עם מסד נתונים מדומה)
node dev/mock-admin.mjs   # אתר הניהול עם נתונים מדומים ב-http://localhost:4173/admin/
```

## אתר הניהול

`https://ulam-berega.onrender.com/admin`. שם המשתמש לא נבדק, הסיסמה היא `ADMIN_PASSWORD`.
