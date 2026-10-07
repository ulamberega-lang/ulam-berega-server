// מספרי בעל הפרויקט (OWNER_PHONES): מי רשאי להשתמש בחייגן היוצא.
import { config } from '../config.js';

// ימות שולחת את המספר המחייג בפורמט מקומי (0525645458); מקבלים גם 972525645458
export const localDigits = (phone) => String(phone ?? '').replace(/\D/g, '').replace(/^972/, '0');

// מספר חסוי (ריק) לא מורשה לעולם
export const isOwnerPhone = (phone) => Boolean(localDigits(phone)) && config.ownerPhones.some((p) => localDigits(p) === localDigits(phone));
