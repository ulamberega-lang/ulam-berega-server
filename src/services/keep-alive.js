// Render החינמי נרדם אחרי 15 דקות בלי בקשות - פינג עצמי כל 10 דקות.
import { config } from '../config.js';

export function startKeepAlive() {
  if (!config.publicUrl) return;
  setInterval(() => fetch(`${config.publicUrl}/health`).catch(() => {}), 10 * 60 * 1000);
}
