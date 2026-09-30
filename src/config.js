// הגדרות מהסביבה (Render → Environment) וקבועים של המערכת הטלפונית.

export const config = {
  port: process.env.PORT || 3000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  openaiKey: process.env.OPENAI_API_KEY,
  yemotToken: process.env.YEMOT_TOKEN,                 // "מספר_מערכת:סיסמה"
  yemotApi: process.env.YEMOT_API || 'https://private.call2all.co.il/ym/api',
  brevoKey: process.env.BREVO_API_KEY,
  mailFrom: process.env.MAIL_FROM,
  adminPassword: process.env.ADMIN_PASSWORD,
  ownerExt: process.env.OWNER_EXT,                      // אופציונלי, למשל /7: שלוחת ההקראה האיטית של "בעל אולם" (בלי זה - מקריאים בשלוחה הראשית)
  publicUrl: process.env.RENDER_EXTERNAL_URL,           // Render מגדיר אוטומטית
};

export const IVR = {
  WAIT_SEC: 35,          // זמן המתנה למענה באולם (לפני שהתא הקולי עונה)
  NO_ANSWER_EXT: '/9',   // שלוחת "אין מענה" בימות
  REC_DIR: '/8',         // שלוחה בימות שבה נשמרות הקלטות זמניות
  REC_MAX_SEC: 5,        // אורך הקלטה מקסימלי (נעצרת בסולמית או בזמן הזה)
  RESULTS_PAGE: 5,       // כמה אולמות להקריא בכל פעם
  MENU_PAGE: 8,          // כמה ערים/שכונות בכל עמוד תפריט (9 = עוד)
  SESSION_TTL_MS: 60 * 60 * 1000,
  CALLER_ID_SUFFIX: '666666',  // הספרות שימות מוסיפה למספר המתקשר (routing_your_id_add בשלוחה הראשית)
};
