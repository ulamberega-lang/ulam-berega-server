// הגדרות מהסביבה (Render → Environment) וקבועים של המערכת הטלפונית.

export const config = {
  port: process.env.PORT || 3000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  openaiKey: process.env.OPENAI_API_KEY,
  nikudModel: process.env.OPENAI_NIKUD_MODEL || 'gpt-4o-mini', // הצעת ניקוד באתר הניהול
  yemotToken: process.env.YEMOT_TOKEN,                 // "מספר_מערכת:סיסמה"
  yemotApi: process.env.YEMOT_API || 'https://private.call2all.co.il/ym/api',
  brevoKey: process.env.BREVO_API_KEY,
  mailFrom: process.env.MAIL_FROM,
  adminPassword: process.env.ADMIN_PASSWORD,
  waToken: process.env.WA_ACCESS_TOKEN,               // בוט הוואטסאפ (WhatsApp Cloud API של Meta)
  waAppSecret: process.env.WA_APP_SECRET,             // לאימות חתימת ה-webhook
  waVerifyToken: process.env.WA_VERIFY_TOKEN,         // לאימות הכתובת בהגדרת ה-webhook אצל Meta
  ownerPhones: (process.env.OWNER_PHONES || '').split(',').map((p) => p.trim()).filter(Boolean), // מי רשאי להשתמש בחייגן היוצא (/api/dialer)
  dialerCallerId: process.env.DIALER_CALLER_ID || 'did', // הזיהוי שיוצג לנמען (routing_your_id); did = מספר המערכת הראשי (real_did / special.<מספר מאושר> אפשריים)
  publicUrl: process.env.RENDER_EXTERNAL_URL,           // Render מגדיר אוטומטית
};

export const IVR = {
  WAIT_SEC: 55,          // זמן המתנה למענה באולם (לפני שהתא הקולי עונה)
  NO_ANSWER_EXT: '/9',   // שלוחת "אין מענה" בימות
  REC_DIR: '/8',         // שלוחה בימות שבה נשמרות הקלטות זמניות
  REC_MAX_SEC: 5,        // אורך הקלטה מקסימלי (נעצרת בסולמית או בזמן הזה)
  VOICEMAIL_MAX_SEC: 90, // אורך מקסימלי להודעה קולית (אפשרות 5 בתפריט)
  RESULTS_PAGE: 5,       // כמה אולמות להקריא בכל פעם
  MENU_PAGE: 8,          // כמה ערים/שכונות בכל עמוד תפריט (9 = עוד)
  SESSION_TTL_MS: 60 * 60 * 1000,
  CALLER_ID_SUFFIX: '000000',  // הספרות שימות מוסיפה למספר המתקשר (routing_your_id_add בשלוחה הראשית)
};
