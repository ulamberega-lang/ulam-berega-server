// נקודת כניסה של השרת הציבורי הנפרד (שירות Render נוסף לדפים הציבוריים בלבד).
// לא דורש שום משתנה סביבה חוץ מ-PORT, ש-Render מגדיר.
import { createPublicApp } from './src/public-app.js';
import { startKeepAlive } from './src/services/keep-alive.js';

process.on('unhandledRejection', (err) => console.error('unhandled:', err));

startKeepAlive(); // פינג עצמי כל 10 דקות (RENDER_EXTERNAL_URL), כדי שהשירות החינמי לא יירדם
const port = process.env.PORT || 3000;
createPublicApp().listen(port, () => console.log(`Public server running on port ${port}`));
