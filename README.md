# אולם ברגע: שרת

מערכת טלפונית (ימות המשיח) שמחפשת אולם לפי כמות מוזמנים, עיר ושכונה ומעבירה את המתקשר לאולם, ואתר ניהול לאולמות ולסטטיסטיקת שיחות.

## מבנה

```
server.js                     נקודת הכניסה: מפעיל את השרת
src/
  config.js                   הגדרות סביבה וקבועים (זמני המתנה, שלוחות)
  app.js                      הרכבת השרת: אילו נתיבים קיימים
  routes/
    ivr.js                    הנתיבים שימות פונה אליהם (/api/ivr)
    admin-api.js              ה-API של אתר הניהול (/admin/api)
  ivr/
    flow.js                   זרימת השיחה: מה נשאל בכל שלב ואיך מטפלים בתשובה
    route-to-hall.js          העברת המתקשר לאולם
    sessions.js               מצב כל שיחה פעילה
  services/
    call-log.js               רישום שיחה: התחלה, העברה, אין מענה, סיום
    mailer.js                 מייל לאולם (Brevo)
    transcriber.js            תמלול הקלטה (ימות → OpenAI)
    nikud.js                  ניקוד שמות להקראה
    keep-alive.js             מונע מ-Render להירדם
  repositories/
    halls.js                  גישה לטבלת האולמות
    calls.js                  גישה ליומן השיחות ולסטטיסטיקה
  lib/
    yemot.js                  בניית תשובות בפורמט של ימות
    text-match.js             התאמת מה שנאמר לשמות ערים ושכונות
    supabase.js               חיבור למסד הנתונים
  middleware/basic-auth.js    סיסמה לאתר הניהול
public/admin/                 אתר הניהול (HTML, עיצוב, JavaScript)
sql/                          קבצי SQL להרצה ב-Supabase
```

## משתני סביבה (Render → Environment)

| משתנה | מה זה |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | חיבור למסד הנתונים |
| `OPENAI_API_KEY` | תמלול דיבור |
| `YEMOT_TOKEN` | `מספר_מערכת:סיסמה`, להורדת הקלטות מימות |
| `BREVO_API_KEY`, `MAIL_FROM` | מיילים לאולמות |
| `ADMIN_PASSWORD` | סיסמה לאתר הניהול |

## אתר הניהול

`https://ulam-berega-server.onrender.com/admin`. שם המשתמש לא נבדק, הסיסמה היא `ADMIN_PASSWORD`.
