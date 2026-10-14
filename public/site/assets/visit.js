// ספירת כניסות לדף (לסטטיסטיקה באתר הניהול). נשלחים רק: מזהה אקראי של הדפדפן (לא מידע אישי), הדף, ומאיזה אתר הגיע.
// רץ בדפדפן בלבד, ולכן רוב הרובוטים (שלא מריצים JavaScript) לא נספרים.
(() => {
  // דפדפן אוטומטי ורובוטים שמריצים JavaScript (Googlebot מריץ את הדף כדי לאנדקס אותו) לא נספרים.
  // לפי "bot/" ולא "bot" לבד: יש טלפונים של Cubot
  if (navigator.webdriver || /bot\/|bot;|crawl|spider|slurp|lighthouse|headless|facebookexternalhit/i.test(navigator.userAgent)) return;
  let v = '';
  try {
    v = localStorage.getItem('ub-v') || '';
    if (!v) {
      v = (crypto.randomUUID ? crypto.randomUUID() : `${Math.random()}${Date.now()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
      localStorage.setItem('ub-v', v);
    }
  } catch { v = `${Math.random()}${Date.now()}`.replace(/\D/g, '').slice(0, 32); } // אחסון חסום: מזהה לדף הזה בלבד
  const body = JSON.stringify({ v, p: location.pathname, r: document.referrer });
  try {
    if (!navigator.sendBeacon?.('/api/visit', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* ספירה בלבד: כשל לא משפיע על הדף */ }
})();
