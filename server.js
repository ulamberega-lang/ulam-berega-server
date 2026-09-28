// נקודת הכניסה של השרת. כל הלוגיקה נמצאת בתיקיית src.
import { createApp } from './src/app.js';
import { config } from './src/config.js';
import { startNikudRefresh } from './src/services/nikud.js';
import { startKeepAlive } from './src/services/keep-alive.js';

startNikudRefresh();
startKeepAlive();

createApp().listen(config.port, () => console.log(`Server running on port ${config.port}`));
