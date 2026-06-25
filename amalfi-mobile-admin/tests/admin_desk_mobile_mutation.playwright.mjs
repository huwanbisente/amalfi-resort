import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startViteIfNeeded, stopServer, waitForServer } from './playwright_vite_server.mjs';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const ADMIN_DESK_URL = process.env.ADMIN_DESK_URL || 'http://127.0.0.1:5175/';
const HUB_URL = process.env.BREEZE_HUB_URL || process.env.HUB_URL || 'http://127.0.0.1:3001';
const SCREENSHOT_PATH = process.env.ADMIN_DESK_MUTATION_SCREENSHOT
  || path.join(os.tmpdir(), 'admin-desk-mobile-mutation.png');

const notes = [];
const failures = [];
const fixtureRefs = [];
const server = startViteIfNeeded({ urlEnvName: 'ADMIN_DESK_URL', portEnvName: 'ADMIN_DESK_PORT', defaultPort: 5175 });

function assert(condition, label, detail = '') {
  if (condition) {
    notes.push(`PASS ${label}`);
    return;
  }
  failures.push(`${label}${detail ? `: ${detail}` : ''}`);
}

async function readEnvValue(key) {
  for (const envPath of [path.join(REPO_ROOT, '.env'), path.join(process.cwd(), '.env')]) {
    try {
      const envText = await fs.readFile(envPath, 'utf8');
      const line = envText
        .split(/\r?\n/)
        .find((entry) => entry.trim().startsWith(`${key}=`));
      if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
    } catch {
      // Continue to the next env file.
    }
  }
  return '';
}

async function getAdminToken() {
  return process.env.HUB_ADMIN_TOKEN
    || process.env.VITE_HUB_ADMIN_TOKEN
    || await readEnvValue('HUB_ADMIN_TOKEN')
    || await readEnvValue('VITE_HUB_ADMIN_TOKEN');
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

async function apiJson(url, { method = 'GET', body, token } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.details || `${method} ${url} returned HTTP ${response.status}`);
  }
  return data;
}

async function findAvailableStayDate() {
  const today = new Date();
  for (let daysOut = 220; daysOut <= 360; daysOut += 1) {
    const checkIn = toDateInputValue(addDays(today, daysOut));
    const checkOut = toDateInputValue(addDays(today, daysOut + 1));
    try {
      const data = await apiJson(`${HUB_URL}/api/v1/public/availability?check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}`);
      const totalOpen = (data.availability || []).reduce((sum, room) => sum + Number(room.available_units || 0), 0);
      if (totalOpen > 0) return { checkIn, checkOut, totalOpen };
    } catch {
      // Keep scanning; a clean failure below is more useful than noisy transient details.
    }
  }
  return null;
}

async function cleanupFixtureRefs(token) {
  const deleted = [];
  const failed = [];

  for (const ref of fixtureRefs) {
    try {
      await apiJson(`${HUB_URL}/api/v1/admin/bookings/${encodeURIComponent(ref)}`, {
        method: 'DELETE',
        body: { admin_id: 'admin-desk-mobile-mutation-harness' },
        token
      });
      deleted.push(ref);
    } catch (error) {
      failed.push(`${ref}: ${error.message}`);
    }
  }

  return { deleted, failed };
}

async function bodyText(page) {
  return page.locator('body').innerText({ timeout: 8000 });
}

async function clickNav(page, label) {
  const safeLabel = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const button = page.locator(`.bottomnav button[aria-label="${safeLabel}"]`).first();
  await button.evaluate((node) => node.scrollIntoView({ block: 'nearest', inline: 'center' })).catch(() => {});
  await button.scrollIntoViewIfNeeded().catch(() => {});
  await button.click({ force: true, timeout: 10000 });
  await page.waitForTimeout(700);
}

async function openWorkflow(page, sectionLabel, workflowLabel) {
  await clickNav(page, sectionLabel);
  const card = page.getByRole('button', { name: new RegExp(workflowLabel, 'i') }).first();
  await card.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click({ force: true, timeout: 10000 });
  await page.waitForTimeout(700);
}

const token = await getAdminToken();
if (!token) {
  failures.push('Admin token is required for fixture verification and cleanup');
} else {
  await waitForServer(ADMIN_DESK_URL).catch((error) => {
    failures.push(`Admin Desk app did not start: ${error.message}`);
  });
  const availableWindow = await findAvailableStayDate();
  if (!availableWindow) {
    failures.push('Could not find an open local availability window in the next 360 days');
  } else {
    const consoleMessages = [];
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    const guestName = `Browser Harness Desk Mobile ${Date.now().toString().slice(-6)}`;

    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) {
        consoleMessages.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));

    try {
      await page.addInitScript(() => {
        window.sessionStorage.removeItem('amalfi_admin_desk_booking_draft_v1');
      });
      await page.goto(ADMIN_DESK_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.locator('body').waitFor({ timeout: 15000 });
      await page.waitForTimeout(2500);

      assert((await page.title()) === 'Amalfi Admin Desk', 'page identity');
      assert(!/token is missing/i.test(await bodyText(page)), 'embedded Admin Desk token is present');
      notes.push(`PASS available window ${availableWindow.checkIn} to ${availableWindow.checkOut} (${availableWindow.totalOpen} open unit slots)`);

      await openWorkflow(page, 'Bookings', 'Manual Booking');
      assert(/Booking Desk|Fast Manual Booking/i.test(await bodyText(page)), 'Manual Booking page renders');

      await page.locator('.field').filter({ hasText: 'Check-In' }).locator('input[type="date"]').fill(availableWindow.checkIn);
      await page.locator('.field').filter({ hasText: 'Check-Out' }).locator('input[type="date"]').fill(availableWindow.checkOut);
      await page.locator('.field').filter({ hasText: 'Guests' }).locator('input[type="number"]').fill('2');

      await page.locator('.unit-card').first().waitFor({ timeout: 25000 });
      await page.locator('.unit-card').first().click();
      await page.getByText('Selected').first().waitFor({ timeout: 12000 });

      await page.locator('.field').filter({ hasText: 'Guest Name' }).locator('input').fill(guestName);
      await page.locator('.field').filter({ hasText: /^Phone$/ }).locator('input').fill('+639171230456');
      await page.locator('.field').filter({ hasText: 'Email' }).locator('input').fill('admin.desk.mobile@example.test');
      await page.locator('.field').filter({ hasText: 'Initial Payment' }).locator('input[type="number"]').fill('0');
      await page.locator('.field').filter({ hasText: 'Booking Source' }).locator('select').selectOption('Walk-in');
      await page.locator('.field').filter({ hasText: 'Notes' }).locator('textarea').fill('ADMIN_DESK_MOBILE_MUTATION_FIXTURE safe to delete.');

      const saveButton = page.getByRole('button', { name: /Save Transaction Booking/i }).first();
      await page.waitForFunction(() => {
        const save = Array.from(document.querySelectorAll('button'))
          .find((button) => /Save Transaction Booking/i.test(button.textContent || ''));
        return save && !save.disabled;
      }, { timeout: 18000 });
      assert(await saveButton.isEnabled(), 'Save Transaction Booking enables for a complete valid fixture');

      const createResponsePromise = page.waitForResponse((response) => {
        if (response.request().method() !== 'POST') return false;
        try {
          return new URL(response.url()).pathname.endsWith('/api/v1/admin/booking-headers');
        } catch {
          return false;
        }
      }, { timeout: 60000 });

      await saveButton.click();
      const createResponse = await createResponsePromise;
      const created = await createResponse.json().catch(() => ({}));
      const createdRef = created?.header?.booking_reference;
      if (!createResponse.ok() || !createdRef) {
        throw new Error(`Save Transaction Booking returned HTTP ${createResponse.status()} without a booking reference`);
      }
      fixtureRefs.push(createdRef);
      assert(/^TX-|^RES-|^BKG-/.test(createdRef), 'Save Transaction Booking returns a booking reference', createdRef);

      await page.getByText(/Booking Saved|Saved Transaction/i).waitFor({ timeout: 60000 });
      await page.getByText(createdRef).first().waitFor({ timeout: 60000 });
      assert(/Booking Saved|Saved Transaction/i.test(await bodyText(page)), 'Saved booking confirmation renders');

      const headerPayload = await apiJson(`${HUB_URL}/api/v1/admin/booking-headers/${encodeURIComponent(createdRef)}`, { token });
      const header = headerPayload.header || {};
      const items = headerPayload.items || [];
      assert((header.guest_name || header.customer_name) === guestName, 'Hub API confirms fixture guest name');
      assert(items.length > 0, 'Hub API confirms fixture booking items');

      assert(consoleMessages.length === 0, 'browser console has no warnings/errors', consoleMessages.join(' | '));
    } catch (error) {
      failures.push(`Playwright mutation harness crashed: ${error.stack || error.message}`);
    } finally {
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false }).catch(() => {});
      await browser.close();
      const cleanup = await cleanupFixtureRefs(token);
      if (fixtureRefs.length === 0) {
        notes.push('PASS cleanup not needed; no fixture reference was created');
      } else if (cleanup.failed.length > 0) {
        failures.push(`Fixture cleanup failed: ${cleanup.failed.join(' | ')}`);
      } else {
        notes.push(`PASS cleanup purged ${cleanup.deleted.join(', ')}`);
      }
    }
  }
}

const result = {
  url: ADMIN_DESK_URL,
  hubUrl: HUB_URL,
  passed: failures.length === 0,
  notes,
  failures,
  screenshot: SCREENSHOT_PATH
};

console.log(JSON.stringify(result, null, 2));
await stopServer(server);
if (failures.length > 0) process.exit(1);
