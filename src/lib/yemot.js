// בניית תשובות בפורמט של מודול ה-API של ימות המשיח.

// ApiCallId מתחלף בכל מעבר שלוחה; ApiYFCallId קבוע לאורך כל השיחה - לכן מזהים לפיו
export function readParams(req) {
  const q = { ...req.query, ...req.body };
  if (q.ApiYFCallId) q.ApiCallId = q.ApiYFCallId;
  return q;
}

// ערך שנשלח כמה פעמים מגיע כמערך - לוקחים את האחרון
export const lastValue = (v) => [].concat(v ?? '').pop();

// התווים . , - = & " ' | הם מפרידים בפקודות של ימות
export const clean = (s) => String(s ?? '').replace(/[.,\-=&"'|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

// רשימת משפטים → הודעת הקראה (t-משפט.t-משפט)
export const say = (parts) => [].concat(parts).flat().filter(Boolean).map((p) => `t-${clean(p)}`).join('.');

export const hangup = (...parts) => `id_list_message=${say([...parts, 'לְהִתְרָאוֹת'])}&go_to_folder=hangup`;

export const goToFolder = (folder, ...parts) => `id_list_message=${say(parts)}&go_to_folder=${folder}`;

// הגדרות read בהקשה: מקס,מינ,שניות,השמעה,חסימת*,חסימת0,החלפה,מקשים_מותרים (כוכבית מותרת = חזרה לתפריט)
export const tapOptions = (maxDigits, waitSec = 7, allowed = '') => `${maxDigits},1,${waitSec},No,no,no,,${allowed}`;

// הגדרות read בהקלטה: record,תיקייה,קובץ,בלי_תפריט_אישור,שמירה_בניתוק,הוספה,מינ,מקס
// saveOnHangup: המתקשר שמנתק באמצע ההקלטה (בלי סולמית) - ההקלטה נשמרת
export const recordOptions = (dir, file, maxSec, saveOnHangup = false) => `record,${dir},${file},no,${saveOnHangup ? 'yes' : ''},,,${maxSec}`;

// העברה למספר חיצוני. ערכי routing לפי הסדר: 1 מספר, 6 זיהוי יוצא (routing_your_id), 9 זמן המתנה, 10 מעבר בסיום.
// (הודעה לעונה וזיהוי יוצא של השלוחה הראשית מוגדרים ב-ext.ini שלה בימות; yourId - רק כשצריך לקבוע זיהוי בהעברה עצמה)
// הערך העשירי (routing_end_goto): ברירת המחדל בימות היא חזרה שלב אחד אחורה, ולכן לניתוק מעבירים hangup
export const routeCall = (message, phone, waitSec, noAnswerExt, yourId = '') =>
  `id_list_message=${say(message)}&routing=${[phone, '', '', '', '', yourId, '', '', waitSec, noAnswerExt].join(',')}`;
