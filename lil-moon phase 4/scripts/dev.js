// Starts Vite, waits for it, then launches Electron against the dev server.
const { spawn } = require('child_process');
const net = require('net');
const PORT = 5173;
const shell = process.platform === 'win32';

const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell });
let electron;
const stop = () => { vite.kill(); electron && electron.kill(); };

(function wait() {
  const s = net.connect(PORT, '127.0.0.1');
  s.on('connect', () => {
    s.end();
    electron = spawn('npx', ['electron', '.'], {
      stdio: 'inherit', shell, env: { ...process.env, LILMOON_DEV_URL: `http://localhost:${PORT}` },
    });
    electron.on('exit', () => { vite.kill(); process.exit(0); });
  });
  s.on('error', () => setTimeout(wait, 300));
})();
process.on('SIGINT', stop);
