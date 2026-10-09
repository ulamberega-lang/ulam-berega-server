// שליחת הודעות דרך WhatsApp Cloud API של Meta.
import { config } from '../config.js';

export const GRAPH = 'https://graph.facebook.com/v26.0';
const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// הודעה פנימית (flow.js) → גוף הבקשה של Meta. אורכי שדות לפי מגבלות וואטסאפ
export function toPayload(to, m) {
  const base = { messaging_product: 'whatsapp', to };
  if (m.kind === 'text') return { ...base, type: 'text', text: { body: m.text } };
  if (m.kind === 'buttons') {
    return { ...base, type: 'interactive', interactive: { type: 'button', body: { text: m.body },
      action: { buttons: m.buttons.map(([id, title]) => ({ type: 'reply', reply: { id, title: cut(title, 20) } })) } } };
  }
  return { ...base, type: 'interactive', interactive: { type: 'list', body: { text: m.body },
    action: { button: cut(m.button, 20), sections: [{ rows: m.rows.map(([id, title, description]) => (
      { id, title: cut(title, 24), ...(description ? { description: cut(description, 72) } : {}) })) }] } } };
}

// שולח לפי הסדר. כשל לא זורק: נרשם בלוג, והשאר לא נשלח
export async function sendAll(phoneId, to, messages) {
  for (const m of messages) {
    try {
      const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.waToken}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify(toPayload(to, m)),
      });
      if (!res.ok) { console.error(`whatsapp: שליחה נכשלה ${res.status} ${(await res.text()).slice(0, 300)}`); return; }
    } catch (e) {
      console.error('whatsapp: שליחה נכשלה', e.message);
      return;
    }
  }
}

// תגובת אימוג'י על הודעת המשתמש (🔍 בזמן טיפול, ✔️ בסיום). לא זורק: כשל בתגובה לא פוגע בתשובה
export async function react(phoneId, to, messageId, emoji) {
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.waToken}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'reaction', reaction: { message_id: messageId, emoji } }),
    });
    if (!res.ok) console.error(`whatsapp: תגובה נכשלה ${res.status} ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    console.error('whatsapp: תגובה נכשלה', e.message);
  }
}

// "מקליד..." מיד עם קבלת ההודעה (וגם סימון נקרא): נעלם כשהתשובה נשלחת, או אחרי 25 שניות. לא זורק
export async function typing(phoneId, messageId) {
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.waToken}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId, typing_indicator: { type: 'text' } }),
    });
    if (!res.ok) console.error(`whatsapp: מקליד נכשל ${res.status} ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    console.error('whatsapp: מקליד נכשל', e.message);
  }
}
