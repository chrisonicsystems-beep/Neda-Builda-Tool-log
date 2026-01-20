import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// Use a distinct name for the node process import to avoid collisions with global Process types that lack 'cwd'
import nodeProcess from 'node:process';

export default defineConfig(({ mode }) => {
  // loadEnv(mode, path, prefixes) 
  // Passing '' as the 3rd argument allows loading variables without the VITE_ prefix
  // Fix: use nodeProcess.cwd() to correctly resolve the current working directory in ESM environments
  const env = loadEnv(mode, nodeProcess.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // We explicitly map the variables so they are replaced with string literals during build
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''),
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY || ''),
      // Provide a fallback for the process object for libraries that expect it
      'process.env': JSON.stringify(env)
    }
  };
});