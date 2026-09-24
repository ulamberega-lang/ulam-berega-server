import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.all('/api/ivr', async (req, res) => {
  try {
    const callerPhone = req.query.ApiPhone || req.body.ApiPhone || '';
    const city = req.query.city || req.body.city || '';

    console.log(`שיחה נכנסת מ: ${callerPhone}, בחירת עיר: ${city}`);

    // שתי דרכים לשליפה: לפי עיר או שליפת הגבאי הראשון הפעיל
    let query = supabase.from('halls').select('*').eq('is_active', true);
    
    if (city === '1') {
      query = query.eq('city_name', 'בני ברק');
    } else if (city === '2') {
      query = query.eq('city_name', 'ירושלים');
    }

    const { data: halls, error } = await query.limit(1);

    if (error || !halls || halls.length === 0) {
      return res.send('id_list_message=t-לא נמצא גבאי זמין&go_to_folder=hangup');
    }

    const hall = halls[0];

    // תיעוד השיחה ב-leads_log (כפי שראינו שעובד מצוין)
    await supabase.from('leads_log').insert({
      hall_id: hall.id,
      caller_phone: callerPhone,
      source: 'phone_ivr'
    });

    // ניקוי תווים מיותרים ממספר הטלפון של הגבאי (רק ספרות)
    const rawPhone = (hall.gabbai_phone || '').replace(/\D/g, '');

    // הוראת חיוג מדויקת לימות המשיח
    return res.send(`id_list_message=t-מעביר אותך כעת לגבאי&routing_yemot=dial=${rawPhone}`);

  } catch (err) {
    console.error('שגיאה בשרת:', err);
    return res.send('id_list_message=t-תקלה במערכת&go_to_folder=hangup');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
