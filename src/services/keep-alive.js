// Render החינמי נרדם אחרי 15 דקות בלי בקשות - פינג עצמי כל 10 דקות.
// כל תקלה בפינג נרשמת בלוג, כדי שאפשר יהיה לדעת אם השרת באמת נשאר ער.
import { config } from '../config.js';

const PING_MS = 10 * 60 * 1000;

export function startKeepAlive() {
  if (!config.publicUrl) return console.log('keep-alive: RENDER_EXTERNAL_URL לא מוגדר, אין פינג עצמי');
  console.log(`keep-alive: פינג עצמי כל 10 דקות אל ${config.publicUrl}/health`);

  setInterval(async () => {
    try {
      const res = await fetch(`${config.publicUrl}/health`);
      if (!res.ok) console.error(`keep-alive: /health החזיר ${res.status}`);
    } catch (e) {
      console.error('keep-alive:', e.message);
    }
  }, PING_MS);
}
