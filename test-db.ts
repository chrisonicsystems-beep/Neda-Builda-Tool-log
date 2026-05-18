import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!url) {
  console.log("No Supabase URL provided in env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('users').select('*');
  console.log('Users in public.users:', data);
  if (error) console.error(error);
}
check();
