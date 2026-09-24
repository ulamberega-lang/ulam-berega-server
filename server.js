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
    // ימות המשיח שולחים את מספר השלוחה בפרמטר ApiExtension או extension
    const fullExtension = req.query.ApiExtension || req.body.ApiExtension || '';
    
    // ניקוי תווים מיותרים (למשל הפיכת "1/01" ל-"101")
    const ext = fullExtension.replace(/\//g, '');
    const callerPhone = req.query.ApiPhone || req.body.ApiPhone || '';

    console.log(`קריאה מנכנסת משלוחה: ${ext}, טלפון מתקשר: ${callerPhone}`);

    // חיפוש הגבאי ב-Supabase לפי מספר השלוחה
    const { data: hall, error } = await supabase
      .from('halls')
      .select('*')
      .eq('extension', ext)
      .eq('is_active', true)
      .single();

    if (error || !hall) {
      console.log(`לא נמצא גבאי לשלוחה ${ext}`);
      return res.send('id_list_message=t-לא נמצא גבאי פעיל לשלוחה זו&go_to_folder=hangup');
    }

    // תיעוד השיחה בטבלת הלוגים
    await supabase.from('leads_log').insert({
      hall_id: hall.id,
      caller_phone: callerPhone,
      source: `ivr_ext_${ext}`
    });

    // החזרת הוראת חיוג לטלפון של הגבאי
    return res.send(`id_list_message=t-מעביר אותך לגבאי של ${hall.name}&go_to_folder=routing&dial=${hall.gabbai_phone}`);

  } catch (err) {
    console.error('שגיאה בשרת:', err);
    return res.send('id_list_message=t-ארעה שגיאה במערכת&go_to_folder=hangup');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
