import { chromium } from 'playwright';
import { startViteIfNeeded, stopServer, waitForServer } from './playwright_vite_server.mjs';

const ADMIN_DESK_URL = process.env.ADMIN_DESK_URL || 'http://127.0.0.1:5175/';
const EXPECTED_NAV = [
  'Today',
  'Guests',
  'Bookings',
  'Money',
  'Tools'
];

const WORKFLOWS = [
  { section: 'Money', label: 'Verify Payments', expected: /Payment Verification/i },
  { section: 'Money', label: 'Ledger', expected: /Ledger/i },
  { section: 'Guests', label: 'Movement Desk', expected: /Movement Desk/i },
  { section: 'Bookings', label: 'Unit Checker', expected: /Unit Quick Checker/i },
  { section: 'Bookings', label: 'Manual Booking', expected: /Booking Desk|Fast Manual Booking/i },
  { section: 'Tools', label: 'Room Ops', expected: /Room \+ Special Ops/i },
  { section: 'Money', label: 'Pulse', expected: /Pulse/i },
  { section: 'Tools', label: 'Chatbot Control', expected: /Chatbot Control/i }
];

const failures = [];
const notes = [];
const server = startViteIfNeeded({ urlEnvName: 'ADMIN_DESK_URL', portEnvName: 'ADMIN_DESK_PORT', defaultPort: 5175 });

function assert(condition, label, detail = '') {
  if (condition) {
    notes.push(`PASS ${label}`);
    return;
  }
  failures.push(`${label}${detail ? `: ${detail}` : ''}`);
}

async function bodyText(page) {
  return page.locator('body').innerText({ timeout: 5000 });
}

async function clickNav(page, label) {
  const nav = page.locator('.bottomnav');
  await nav.evaluate((node, targetLabel) => {
    const target = Array.from(node.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === targetLabel);
    if (target) target.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, label).catch(() => {});

  const button = page.locator(`.bottomnav button[aria-label="${label}"]`).first();
  await button.scrollIntoViewIfNeeded().catch(() => {});
  await button.click({ force: true, timeout: 8000 });
  await page.waitForTimeout(600);
}

async function waitForBodyMatch(page, pattern) {
  await page.waitForFunction(
    ({ source, flags }) => new RegExp(source, flags).test(document.body.innerText),
    { source: pattern.source, flags: pattern.flags },
    { timeout: 8000 }
  );
}

async function openWorkflow(page, sectionLabel, workflowLabel, expectedPattern) {
  await clickNav(page, sectionLabel);
  const card = page.getByRole('button', { name: new RegExp(workflowLabel, 'i') }).first();
  await card.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click({ force: true, timeout: 8000 });
  if (expectedPattern) {
    await waitForBodyMatch(page, expectedPattern);
  }
  await page.waitForTimeout(700);
}

async function selectFirstNonCurrentOption(locator) {
  const current = await locator.inputValue();
  const options = await locator.locator('option').evaluateAll((nodes) => nodes.map((node) => node.value));
  const next = options.find((value) => value && value !== current);
  if (next) await locator.selectOption(next);
  return Boolean(next);
}

async function assertNoPageOverflow(page, label, width) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  assert(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `no page-level horizontal overflow: ${label} ${width}px`,
    `scrollWidth ${dimensions.scrollWidth}, clientWidth ${dimensions.clientWidth}`
  );
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
const consoleMessages = [];

page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  }
});
page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));

try {
  await waitForServer(ADMIN_DESK_URL);
  await page.goto(ADMIN_DESK_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2500);

  const initialText = await bodyText(page);
  assert((await page.title()) === 'Amalfi Admin Desk', 'page identity');
  assert(!/token is missing/i.test(initialText), 'Admin Desk token is present');
  assert(!/Admin Desk is paused/i.test(initialText), 'Admin Desk service is enabled');

  const navLabels = await page.locator('.bottomnav button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')).filter(Boolean));
  assert(JSON.stringify(navLabels) === JSON.stringify(EXPECTED_NAV), 'bottom selector order', navLabels.join(' > '));

  await clickNav(page, 'Today');
  let text = await bodyText(page);
  assert(/Today at Amalfi/i.test(text), 'Home dashboard renders');
  await page.getByRole('button', { name: /Sync/i }).first().click();
  await page.waitForTimeout(700);
  assert(!/token is missing/i.test(await bodyText(page)), 'Home sync connects through Hub proxy');

  for (const quick of ['New Booking', 'Rooms', 'Verify', 'Pulse', 'Chatbot']) {
    const button = page.getByRole('button', { name: new RegExp(quick, 'i') }).first();
    assert(await button.isVisible().catch(() => false), `Home quick action visible: ${quick}`);
  }

  await openWorkflow(page, 'Money', 'Verify Payments', /Payment Verification/i);
  text = await bodyText(page);
  assert(/Payment Verification/i.test(text), 'Verify page renders');
  assert(await page.locator('.verification-list-card, .empty-state').first().isVisible().catch(() => false), 'Verify queue or empty state visible');

  await openWorkflow(page, 'Money', 'Ledger', /Ledger/i);
  text = await bodyText(page);
  assert(/Ledger/i.test(text), 'Ledger page renders');
  const ledgerSearch = page.locator('.ledger-search input').first();
  if (await ledgerSearch.isVisible().catch(() => false)) {
    await ledgerSearch.fill('RES');
    await page.waitForTimeout(300);
    assert(/RES|No bookings match/i.test(await bodyText(page)), 'Ledger search responds');
  }
  const ledgerFilter = page.locator('select').first();
  if (await ledgerFilter.isVisible().catch(() => false)) {
    await selectFirstNonCurrentOption(ledgerFilter);
    await page.waitForTimeout(300);
    assert(/Ledger|No bookings match/i.test(await bodyText(page)), 'Ledger filter responds');
  }
  const editButton = page.getByRole('button', { name: /^Edit$/i }).first();
  if (await editButton.isVisible().catch(() => false)) {
    await editButton.click();
    await page.waitForTimeout(500);
    assert(/Edit Booking/i.test(await bodyText(page)), 'Ledger edit sheet opens');
    await page.getByRole('button', { name: /Close/i }).click();
  } else {
    notes.push('SKIP Ledger edit sheet: no editable rows in current data');
  }

  await openWorkflow(page, 'Guests', 'Movement Desk', /Movement Desk/i);
  text = await bodyText(page);
  assert(/Movement Desk/i.test(text), 'Desk movement page renders');
  for (const lane of ['Arrivals', 'In House', 'Due Out']) {
    const laneButton = page.getByRole('button', { name: new RegExp(lane, 'i') }).first();
    if (await laneButton.isVisible().catch(() => false)) {
      await laneButton.click();
      await page.waitForTimeout(250);
      assert(/Movement Desk|No records/i.test(await bodyText(page)), `Desk lane responds: ${lane}`);
    }
  }
  const recordPay = page.getByRole('button', { name: /Record Pay/i }).first();
  if (await recordPay.isVisible().catch(() => false)) {
    await recordPay.click();
    await page.waitForTimeout(400);
    assert(/Record Payment/i.test(await bodyText(page)), 'Record Pay sheet opens');
    await page.getByRole('button', { name: /Close/i }).click();
  } else {
    notes.push('SKIP Record Pay sheet: no balance row in current movement data');
  }

  await openWorkflow(page, 'Bookings', 'Unit Checker', /Unit Quick Checker/i);
  text = await bodyText(page);
  assert(/Unit Quick Checker/i.test(text), 'Units quick checker renders');
  const startInput = page.locator('input[type="date"]').first();
  if (await startInput.isVisible().catch(() => false)) {
    await startInput.fill('2026-05-20');
    await page.waitForTimeout(400);
    assert(/Showing|Booked|No units match/i.test(await bodyText(page)), 'Units date control responds');
  }
  const categoryButton = page.locator('.unit-checker-categorybar button').nth(1);
  if (await categoryButton.isVisible().catch(() => false)) {
    await categoryButton.click();
    await page.waitForTimeout(300);
    assert(/Showing|No units match/i.test(await bodyText(page)), 'Units category control responds');
  }

  await openWorkflow(page, 'Bookings', 'Manual Booking', /Booking Desk|Fast Manual Booking/i);
  text = await bodyText(page);
  assert(/Booking Desk|Fast Manual Booking/i.test(text), 'Manual Booking page renders');
  const guestInput = page.locator('input[type="number"]').first();
  if (await guestInput.isVisible().catch(() => false)) {
    await guestInput.fill('4');
  }
  const comboButton = page.getByRole('button', { name: /Combo Booking/i }).first();
  if (await comboButton.isVisible().catch(() => false)) {
    await comboButton.click();
    await page.waitForTimeout(800);
    assert(/Pick Rooms|Checking available|No units match|Selection Summary/i.test(await bodyText(page)), 'Manual Booking setup controls respond');
  }
  const saveButton = page.getByRole('button', { name: /Save Transaction Booking/i }).first();
  if (await saveButton.isVisible().catch(() => false)) {
    assert(await saveButton.isDisabled().catch(() => false) || /Complete the highlighted/i.test(await bodyText(page)), 'Manual Booking save is guarded until complete');
  }

  await openWorkflow(page, 'Tools', 'Room Ops', /Room \+ Special Ops/i);
  text = await bodyText(page);
  assert(/Room \+ Special Ops/i.test(text), 'Room Ops page renders');
  for (const lane of ['Needs Attention', 'All Units']) {
    const laneButton = page.getByRole('button', { name: new RegExp(lane, 'i') }).first();
    if (await laneButton.isVisible().catch(() => false)) {
      await laneButton.click();
      await page.waitForTimeout(300);
      assert(/Room \+ Special Ops|No room follow-up/i.test(await bodyText(page)), `Room Ops lane responds: ${lane}`);
    }
  }
  const roomSelect = page.locator('.room-op-card select').first();
  if (await roomSelect.isVisible().catch(() => false)) {
    assert(await roomSelect.isEnabled().catch(() => false), 'Room status selector is enabled for visible room card');
  } else {
    notes.push('SKIP Room status selector: no visible room cards in current data');
  }

  await openWorkflow(page, 'Money', 'Pulse', /Collection Pulse/i);
  text = await bodyText(page);
  assert(/Pulse/i.test(text) && /Collection Pulse/i.test(text), 'Pulse page renders financial dashboard');

  await openWorkflow(page, 'Tools', 'Chatbot Control', /Chatbot Control/i);
  text = await bodyText(page);
  assert(/Chatbot Control/i.test(text), 'Chatbot Control page renders');
  for (const lane of ['All', 'Operator', 'Bot', 'Payments']) {
    const laneButton = page.getByRole('button', { name: new RegExp(lane, 'i') }).first();
    if (await laneButton.isVisible().catch(() => false)) {
      await laneButton.click();
      await page.waitForTimeout(250);
      assert(/Quick Chats|No chatbot threads/i.test(await bodyText(page)), `Chatbot lane responds: ${lane}`);
    }
  }
  const categorySelect = page.locator('.chatbot-thread-detail select').first();
  assert(await categorySelect.isVisible().catch(() => false), 'Chatbot category selector visible');
  const replyBox = page.locator('textarea').last();
  if (await replyBox.isVisible().catch(() => false)) {
    await replyBox.fill('Do you have rooms available for 4 pax tomorrow?');
    await page.waitForTimeout(200);
    const draftButton = page.getByRole('button', { name: /Generate Draft/i }).first();
    assert(await draftButton.isEnabled().catch(() => false), 'Quick reply draft button enables after message input');
  }

  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of EXPECTED_NAV) {
      await clickNav(page, label);
      await assertNoPageOverflow(page, label, width);
    }
    for (const workflow of WORKFLOWS) {
      await openWorkflow(page, workflow.section, workflow.label, workflow.expected);
      assert(workflow.expected.test(await bodyText(page)), `workflow opens: ${workflow.label} ${width}px`);
      await assertNoPageOverflow(page, workflow.label, width);
    }
  }

  assert(consoleMessages.length === 0, 'browser console has no warnings/errors', consoleMessages.join(' | '));
} catch (error) {
  failures.push(`Playwright harness crashed: ${error.stack || error.message}`);
} finally {
  await page.screenshot({ path: process.env.ADMIN_DESK_SCREENSHOT || 'admin-desk-mobile-controls.png', fullPage: false }).catch(() => {});
  await browser.close();
  await stopServer(server);
}

const result = {
  url: ADMIN_DESK_URL,
  passed: failures.length === 0,
  notes,
  failures,
  consoleMessages
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exit(1);
