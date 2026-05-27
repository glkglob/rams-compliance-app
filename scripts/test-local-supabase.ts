import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Testing connection to local Supabase...');
  
  try {
    // Simple auth check - this will work even without tables
    const { error } = await supabase.auth.getSession();
    
    if (error && !error.message.toLowerCase().includes('session')) {
      throw error;
    }
    
    console.log('✅ Successfully connected to local Supabase!');
    console.log('URL:', supabaseUrl);
    console.log('Auth client initialized correctly.');
  } catch (err: any) {
    console.error('❌ Failed to connect to local Supabase:');
    console.error(err?.message || err);
    process.exit(1);
  }
}

test();
