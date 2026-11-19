import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function createConfig(input) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !url.hostname.endsWith('.onrender.com')) {
    throw new Error('Provide only the HTTPS Render service origin, e.g. https://your-service.onrender.com');
  }
  return {
    framework: 'vite',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    headers: [{ source: '/(.*)', headers: [
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
    ] }],
    rewrites: [
      { source: '/api/:path*', destination: `${url.origin}/api/:path*` },
      { source: '/((?!api(?:/|$)).*)', destination: '/index.html' }
    ]
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = createConfig(process.argv[2]);
    const target = fileURLToPath(new URL('../vercel.json', import.meta.url));
    fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
    console.log('Created client/vercel.json. Set VITE_API_URL=/ and VITE_WINDOWS_SIMULATIONS_ENABLED=false in Vercel.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
