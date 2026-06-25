import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const PORT = Number(process.env.ADMIN_APP_PORT || 5174);
const APP_URL = process.env.ADMIN_APP_URL || `http://127.0.0.1:${PORT}/`;
const SCREENSHOT_PATH = process.env.ADMIN_APP_SMOKE_SCREENSHOT
  || path.join(os.tmpdir(), 'amalfi-admin-app-smoke.png');

const notes = [];
const failures = [];

function assert(condition, label, detail = '') {
  if (condition) {
    notes.push(`PASS ${label}`);
    return;
  }
  failures.push(`${label}${detail ? `: ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
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

function startViteIfNeeded() {
  if (process.env.ADMIN_APP_URL) return null;

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
    ? ['/d', '/s', '/c', `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`]
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'];
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

async function stopServer(server) {
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

async function bodyText(page) {
  return page.locator('body').innerText({ timeout: 8000 });
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  assert(
    dimensions.scrollWidth <= dimensions.clientWidth + 1 && dimensions.bodyScrollWidth <= dimensions.clientWidth + 1,
    `no horizontal overflow: ${label}`,
    `html ${dimensions.scrollWidth}/${dimensions.clientWidth}, body ${dimensions.bodyScrollWidth}/${dimensions.clientWidth}`
  );
}

async function assertDialogFitsViewport(page, label) {
  const dialog = page.locator('[role="dialog"]').first();
  await dialog.waitFor({ timeout: 12000 });
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  assert(Boolean(box && viewport), `${label} dialog has measurable bounds`);
  if (!box || !viewport) return;

  assert(box.x >= -1, `${label} dialog left edge is visible`, `x=${box.x}`);
  assert(
    box.x + box.width <= viewport.width + 1,
    `${label} dialog right edge is visible`,
    `right=${box.x + box.width}, viewport=${viewport.width}`
  );
  assert(box.width <= viewport.width + 1, `${label} dialog width fits viewport`, `width=${box.width}, viewport=${viewport.width}`);
}

async function checkManualBookingModal(page, viewportName) {
  const newBooking = page.getByRole('button', { name: /New Booking|Manual Booking/i }).first();
  await newBooking.scrollIntoViewIfNeeded().catch(() => {});
  await newBooking.click({ timeout: 12000 });
  await page.waitForTimeout(1000);

  const text = await bodyText(page);
  assert(/Manual Booking/i.test(text), `manual booking modal opens: ${viewportName}`);
  assert(/Stay Setup/i.test(text), `stay setup visible: ${viewportName}`);
  assert(/Unit Allocation|Primary Unit/i.test(text), `unit allocation visible: ${viewportName}`);

  const multi = page.getByRole('button', { name: /^Multi Booking$/i }).first();
  if (await multi.isVisible().catch(() => false)) {
    await multi.click();
    await page.waitForTimeout(500);
    assert(/Multi Booking/i.test(await bodyText(page)), `multi booking toggle responds: ${viewportName}`);
  }

  await assertDialogFitsViewport(page, `manual booking ${viewportName}`);
  await assertNoHorizontalOverflow(page, `manual booking ${viewportName}`);

  const close = page.getByRole('button', { name: /Close/i }).first();
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await page.waitForTimeout(500);
  } else {
    await page.keyboard.press('Escape');
  }
}

let server = null;
let browser = null;
const consoleMessages = [];

try {
  server = startViteIfNeeded();
  await waitForServer(APP_URL);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2500);

  const initialText = await bodyText(page);
  assert((await page.title()) === 'Amalfi | Hub Control', 'page identity');
  assert(/Amalfi|Admin|Booking|Dashboard|Hub/i.test(initialText), 'first meaningful admin screen renders');
  assert(!/vite|react|error overlay|failed to fetch dynamically imported module/i.test(initialText), 'no framework error overlay');
  await assertNoHorizontalOverflow(page, 'admin desktop shell');
  await checkManualBookingModal(page, 'desktop');

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1800);
  await assertNoHorizontalOverflow(page, 'admin tablet shell');
  await checkManualBookingModal(page, 'tablet');

  assert(consoleMessages.length === 0, 'browser console has no warnings/errors', consoleMessages.join(' | '));
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
} catch (error) {
  failures.push(`Admin Playwright smoke crashed: ${error.stack || error.message}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  await stopServer(server);
}

const result = {
  url: APP_URL,
  passed: failures.length === 0,
  notes,
  failures,
  consoleMessages,
  screenshot: SCREENSHOT_PATH
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exit(1);
