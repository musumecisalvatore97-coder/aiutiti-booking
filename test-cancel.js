import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://hkljqixkdkacbcudkoup.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testCancel() {
    console.log("Testing web_cancel...");
    const { data, error } = await supabase.rpc('web_cancel', {
        p_chat_id: 'test_chat_123',
        p_source: 'web',
        p_session_id: 'test_session_123'
    });

    console.log("Data:", data);
    if (error) {
        console.error("Error:", error);
    }
}

testCancel();
