import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.GUEST_APP_PORT || 5173);
const APP_URL = process.env.GUEST_APP_URL || `http://127.0.0.1:${PORT}/`;
const SCREENSHOT_PATH = process.env.GUEST_APP_SMOKE_SCREENSHOT
  || path.join(os.tmpdir(), 'amalfi-guest-app-smoke.png');

const notes = [];
const failures = [];

const knowledgeFixture = {
  resort_name: 'Amalfi Resort',
  official_website: 'breezeresort.test',
  location: 'San Felipe, Zambales',
  contact_phone: '+63 917 000 0000',
  about: {
    headline: 'Beach, sunset, sanctuary, memories',
    map_link: 'https://maps.example.test',
    inquiry_link: 'https://m.me/example'
  },
  check_in_out: {
    check_in_time: '2:00 PM',
    check_out_time: '11:00 AM'
  },
  socials_and_booking_links: {
    facebook: 'https://facebook.example.test',
    instagram: 'https://instagram.example.test',
    airbnb: 'https://airbnb.example.test'
  },
  booking_and_cancellation_policies: {
    cancellation_policy: [
      { condition: 'Standard bookings', action: 'Coordinate with management', notes: 'Subject to availability.' }
    ]
  },
  booking_rules: {
    holiday_minimum_stay: {}
  },
  accommodations: [
    {
      name: 'AC Teepee',
      marketing_name: 'AC Teepee',
      image: '/api/v1/assets/logo/resort-logo.jpg',
      units: 4,
      max_capacity_pax: 2,
      features: ['Air-conditioned', 'Private bath', 'Beachfront access'],
      rates: [{ min_pax: 1, max_pax: 2, price_php: 2500 }],
      extra_pax: { allowed: false, max_capacity_pax: 2 }
    },
    {
      name: 'Beach Villa',
      marketing_name: 'Beach Villa',
      image: '/api/v1/assets/logo/resort-logo.jpg',
      units: 3,
      max_capacity_pax: 10,
      features: ['Kitchen', 'Private bath', 'Beachfront access'],
      rates: [{ min_pax: 1, max_pax: 10, price_php: 12000 }],
      extra_pax: { allowed: true, max_capacity_pax: 12 }
    }
  ]
};

const roomFixture = [
  {
    room_type: 'AC Teepee',
    price: 2500,
    available_units: 4,
    status: 'available'
  },
  {
    room_type: 'Beach Villa',
    price: 12000,
    available_units: 2,
    status: 'available'
  }
];

const unitFixture = [
  {
    unit_id: 'ac-teepee-1',
    unit_label: 'AC Teepee #1',
    room_type: 'AC Teepee',
    is_available: true,
    standard_max_pax: 2,
    absolute_max_pax: 2
  },
  {
    unit_id: 'beach-villa-1',
    unit_label: 'Beach Villa #1',
    room_type: 'Beach Villa',
    is_available: true,
    standard_max_pax: 10,
    absolute_max_pax: 12
  }
];

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
  if (process.env.GUEST_APP_URL) return null;

  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`]
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'];
  return spawn(
    command,
    args,
    {
      cwd: APP_ROOT,
      env: { ...process.env, BROWSER: 'none' },
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

async function installGuestApiMocks(page) {
  await page.route('**/api/v1/public/knowledge', (route) => route.fulfill({ json: knowledgeFixture }));
  await page.route('**/api/v1/public/portal-status', (route) => route.fulfill({ json: { enabled: true, contact_phone: '+63 917 000 0000' } }));
  await page.route('**/api/v1/public/rooms', (route) => route.fulfill({ json: { rooms: roomFixture } }));
  await page.route('**/api/v1/public/availability**', (route) => route.fulfill({ json: { availability: roomFixture } }));
  await page.route('**/api/v1/public/booking-options', (route) => route.fulfill({ json: { all_units: unitFixture, available_units: unitFixture } }));
  await page.route('**/api/v1/public/quote', (route) => route.fulfill({
    json: {
      total_amount: 2500,
      nights: 1,
      total_units: 1,
      quoted_units: [{ unit_id: 'ac-teepee-1', unit_label: 'AC Teepee #1', amount: 2500 }]
    }
  }));
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
  const modal = page.locator('[role="dialog"], .fixed.inset-0').first();
  await modal.waitFor({ timeout: 12000 });
  const box = await modal.boundingBox();
  const viewport = page.viewportSize();
  assert(Boolean(box && viewport), `${label} has measurable bounds`);
  if (!box || !viewport) return;
  assert(box.x >= -1, `${label} left edge is visible`, `x=${box.x}`);
  assert(box.x + box.width <= viewport.width + 1, `${label} right edge is visible`, `right=${box.x + box.width}, viewport=${viewport.width}`);
}

async function runGuestFlow(page, viewportName) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2500);

  const text = await bodyText(page);
  assert((await page.title()) === 'Amalfi | Liwliwa, Zambales', `page identity: ${viewportName}`);
  assert(/Amalfi Resort|Beach|Sanctuary|Book Now/i.test(text), `first meaningful guest screen renders: ${viewportName}`);
  assert(!/vite|react|error overlay|failed to fetch dynamically imported module/i.test(text), `no framework error overlay: ${viewportName}`);
  await assertNoHorizontalOverflow(page, `guest shell ${viewportName}`);

  await page.getByRole('link', { name: /Book Now/i }).first().click();
  await page.waitForTimeout(700);
  const bookButton = page.getByRole('button', { name: /Book Now|Book \d+ Units/i }).first();
  await bookButton.scrollIntoViewIfNeeded().catch(() => {});
  await bookButton.click({ timeout: 12000 });
  await page.waitForTimeout(1200);

  const modalText = await bodyText(page);
  assert(/AC Teepee|Payment|Check|Guest|Submit/i.test(modalText), `booking modal opens: ${viewportName}`);
  await assertDialogFitsViewport(page, `guest booking modal ${viewportName}`);
  await assertNoHorizontalOverflow(page, `guest booking modal ${viewportName}`);
}

let server = null;
let browser = null;
const consoleMessages = [];

try {
  server = startViteIfNeeded();
  await waitForServer(APP_URL);

  browser = await chromium.launch({ headless: true });

  for (const viewport of [
    { name: 'desktop', size: { width: 1366, height: 768 }, isMobile: false },
    { name: 'mobile', size: { width: 390, height: 844 }, isMobile: true }
  ]) {
    const page = await browser.newPage({ viewport: viewport.size, isMobile: viewport.isMobile });
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()) && !/Live inventory sync failed/i.test(message.text())) {
        consoleMessages.push(`${viewport.name} ${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => consoleMessages.push(`${viewport.name} pageerror: ${error.message}`));

    await installGuestApiMocks(page);
    await runGuestFlow(page, viewport.name);
    if (viewport.name === 'mobile') {
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    }
    await page.close();
  }

  assert(consoleMessages.length === 0, 'browser console has no warnings/errors', consoleMessages.join(' | '));
} catch (error) {
  failures.push(`Guest Playwright smoke crashed: ${error.stack || error.message}`);
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
