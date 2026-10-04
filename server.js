// נקודת הכניסה של השרת. כל הלוגיקה נמצאת בתיקיית src.
import './src/env-check.js'; // ראשון: בודק משתני סביבה לפני כל ייבוא אחר
import { createApp } from './src/app.js';
import { config } from './src/config.js';
import { startNikudRefresh } from './src/services/nikud.js';
import { startKeepAlive } from './src/services/keep-alive.js';
import { startHallDirectory } from './src/services/hall-directory.js';

// שגיאה שנשכחה בלי טיפול לא תפיל את השרת (ואת הקו הטלפוני) - רק תירשם בלוג
process.on('unhandledRejection', (err) => console.error('unhandled:', err));

startNikudRefresh();
startHallDirectory();
startKeepAlive();

createApp().listen(config.port, () => console.log(`Server running on port ${config.port}`));
