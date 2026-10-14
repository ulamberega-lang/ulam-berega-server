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
  // קישור מיוחד (למשל ?from=whatsapp בסטטוס או בקבוצה): נספר כמקור, ונמחק מהכתובת כדי שלא יועבר הלאה בשיתוף
  const params = new URLSearchParams(location.search);
  const s = (params.get('from') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
  if (params.has('from')) {
    params.delete('from');
    try { history.replaceState(history.state, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash); } catch { /* לא חשוב */ }
  }
  const body = JSON.stringify({ v, p: location.pathname, r: document.referrer, ...(s ? { s } : {}) });
  try {
    if (!navigator.sendBeacon?.('/api/visit', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* ספירה בלבד: כשל לא משפיע על הדף */ }
})();
