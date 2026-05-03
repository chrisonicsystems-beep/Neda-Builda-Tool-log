import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const envVars: any = {};
envFile.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key) envVars[key.trim()] = values.join('=').trim();
});

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || envVars['VITE_SUPABASE_URL'];
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || envVars['VITE_SUPABASE_ANON_KEY'];

if (!SUPABASE_URL || SUPABASE_URL === 'https://example.supabase.co') {
  console.log("No supabase URL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('users').select('*');
  console.log("Users:", JSON.stringify(data, null, 2));
  console.log("Error:", error);
}

check();
