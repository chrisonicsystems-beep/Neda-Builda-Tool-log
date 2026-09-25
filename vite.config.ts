import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// Use a distinct name for the node process import to avoid collisions with global Process types that lack 'cwd'
import nodeProcess from 'node:process';

export default defineConfig(({ mode }) => {
  // loadEnv(mode, path, prefixes) 
  // Passing '' as the 3rd argument allows loading variables without the VITE_ prefix
  // Fix: use nodeProcess.cwd() to correctly resolve the current working directory in ESM environments
  const env = loadEnv(mode, nodeProcess.cwd(), '');
  const buildId = env.VERCEL_GIT_COMMIT_SHA || Date.now().toString();

  const versionPlugin = (): Plugin => ({
    name: 'version-plugin',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: buildId })
      });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/version.json')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ version: buildId }));
          return;
        }
        next();
      });
    }
  });

  return {
    plugins: [react(), versionPlugin()],
    define: {
      // We explicitly map the variables so they are replaced with string literals during build
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''),
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || ''),
      '__APP_VERSION__': JSON.stringify(buildId)
    }
  };
});