import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.status < 500) return;
    } catch {
      // Vite is still booting.
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export function startViteIfNeeded({ urlEnvName, portEnvName, defaultPort }) {
  if (process.env[urlEnvName]) return null;

  const port = Number(process.env[portEnvName] || defaultPort);
  const env = { ...process.env, BROWSER: 'none' };
  if (!env.VITE_HUB_ADMIN_TOKEN) {
    const rootEnvPath = path.join(REPO_ROOT, '.env');
    if (fs.existsSync(rootEnvPath)) {
      const rootEnv = fs.readFileSync(rootEnvPath, 'utf8');
      const tokenLine = rootEnv
        .split(/\r?\n/)
        .find((line) => /^(VITE_HUB_ADMIN_TOKEN|HUB_ADMIN_TOKEN)=/.test(line.trim()));
      if (tokenLine) {
        env.VITE_HUB_ADMIN_TOKEN = tokenLine.slice(tokenLine.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`]
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  return spawn(
    command,
    args,
    {
      cwd: APP_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
}

export async function stopServer(server) {
  if (!server || server.killed) return;
  if (process.platform === 'win32' && server.pid) {
    spawn('taskkill.exe', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
    await sleep(1000);
    return;
  }
  server.kill('SIGTERM');
  await sleep(800);
  if (!server.killed) server.kill('SIGKILL');
}
