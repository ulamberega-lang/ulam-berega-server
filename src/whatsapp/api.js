// שליחת הודעות דרך WhatsApp Cloud API של Meta.
import { config } from '../config.js';

export const GRAPH = 'https://graph.facebook.com/v26.0';
const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// "שמחה בשיחה https://wa.me/..." → "_שמחה בשיחה_ https://wa.me/..."
const footerLine = (footer) => footer.replace(/^(.*?)(\s*https?:\/\/\S+)?$/s, (_, name, url = '') => `_${name.trim()}_${url}`);

// הודעה פנימית (flow.js) → גוף הבקשה של Meta. אורכי שדות לפי מגבלות וואטסאפ
// footer: שורת חתימה בסוף כל הודעה. בהודעה אינטראקטיבית היא שדה footer (מוצג באפור); בהודעת טקסט אי אפשר לצבוע,
// ולכן היא שורה נטויה בסוף (שם נטוי, והקישור מחוץ לנטייה כדי שיישאר לחיץ)
export function toPayload(to, m, footer) {
  const base = { messaging_product: 'whatsapp', to };
  const foot = footer ? { footer: { text: cut(footer, 60) } } : {};
  if (m.kind === 'text') return { ...base, type: 'text', text: { body: footer ? `${m.text}\n\n${footerLine(footer)}` : m.text } };
  if (m.kind === 'buttons') {
    return { ...base, type: 'interactive', interactive: { type: 'button', body: { text: m.body }, ...foot,
      action: { buttons: m.buttons.map(([id, title]) => ({ type: 'reply', reply: { id, title: cut(title, 20) } })) } } };
  }
  return { ...base, type: 'interactive', interactive: { type: 'list', body: { text: m.body }, ...foot,
    action: { button: cut(m.button, 20), sections: [{ rows: m.rows.map(([id, title, description]) => (
      { id, title: cut(title, 24), ...(description ? { description: cut(description, 72) } : {}) })) }] } } };
}

// שולח לפי הסדר. כשל לא זורק: נרשם בלוג, והשאר לא נשלח
export async function sendAll(phoneId, to, messages, footer) {
  for (const m of messages) {
    try {
      const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.waToken}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify(toPayload(to, m, footer)),
      });
      if (!res.ok) { console.error(`whatsapp: שליחה נכשלה ${res.status} ${(await res.text()).slice(0, 300)}`); return; }
    } catch (e) {
      console.error('whatsapp: שליחה נכשלה', e.message);
      return;
    }
  }
}
