import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HUB_DB_PATH = path.resolve(__dirname, '..', '..', 'amalfi-system', 'runtime', 'hub', 'database.sqlite');
const BOOKING_MODE_MANUAL_OVERRIDE = 'MANUAL_OVERRIDE';
const BOOKING_SOURCE = 'Legacy CSV Snapshot';
const PAYMENT_METHOD = 'Legacy CSV Import';
const TODAY = new Date();

function parseArgs(argv) {
  const args = {
    apply: false,
    reconcile: false,
    csvPath: '',
    dbPath: DEFAULT_HUB_DB_PATH,
    previewRows: 12,
    today: TODAY
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--reconcile') {
      args.reconcile = true;
    } else if (arg === '--csv') {
      args.csvPath = argv[i + 1] || '';
      i += 1;
    } else if (arg === '--db') {
      args.dbPath = argv[i + 1] || args.dbPath;
      i += 1;
    } else if (arg === '--preview-rows') {
      args.previewRows = Number.parseInt(argv[i + 1] || '12', 10) || 12;
      i += 1;
    } else if (arg === '--today') {
      const rawToday = argv[i + 1] || '';
      const today = new Date(`${rawToday}T00:00:00Z`);
      if (Number.isNaN(today.getTime())) throw new Error(`Invalid --today value: ${rawToday}`);
      args.today = today;
      i += 1;
    }
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }

  return rows;
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeMoney(value) {
  const raw = normalizeText(value).replace(/,/g, '');
  if (!raw) return 0;
  const num = Number.parseFloat(raw);
  return Number.isFinite(num) ? num : 0;
}

function parsePax(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const num = Number.parseInt(raw, 10);
  return Number.isFinite(num) ? num : null;
}

function parseLedgerDate(value) {
  const raw = normalizeText(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, first, second, yyyy] = match;
  const a = Number.parseInt(first, 10);
  const b = Number.parseInt(second, 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  let month = a;
  let day = b;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateStatus(checkIn, checkOut, today = TODAY) {
  const inDate = new Date(`${checkIn}T00:00:00Z`);
  const outDate = new Date(`${checkOut}T00:00:00Z`);
  if (outDate <= today) return 'CHECKED_OUT';
  if (inDate <= today && outDate > today) return 'OCCUPIED';
  return 'APPROVED';
}

function paymentStatus(totalPrice, amountPaid) {
  if (totalPrice > 0 && amountPaid >= totalPrice) return 'Fully Paid';
  if (amountPaid > 0) return 'Partial';
  return 'Unpaid';
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/#/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripUnitNotes(value) {
  return normalizeText(value).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

function roomTypeLabel(roomTypeId) {
  const labels = {
    'ac-kubo': 'AC Kubo',
    'ac-teepee': 'AC Teepee',
    'beach-villa': 'Beach Villa',
    'big-fan-kubo': 'Big Fan Kubo',
    'fan-kubo': 'Fan Kubo',
    'owners-villa': "Owner's Villa",
    'pool-villa': 'Pool Villa',
  };
  return labels[roomTypeId] || roomTypeId;
}

function buildUnitLookup(units) {
  const map = new Map();

  const addKey = (key, unit) => {
    if (!key) return;
    map.set(slugify(key), unit);
  };

  for (const unit of units) {
    addKey(unit.unit_id, unit);
    addKey(unit.unit_label, unit);
    addKey(`${roomTypeLabel(unit.room_type_id)} ${extractUnitNumber(unit.unit_id)}`, unit);
    addKey(`${roomTypeLabel(unit.room_type_id)} #${extractUnitNumber(unit.unit_id)}`, unit);
  }

  for (const unit of units) {
    const num = extractUnitNumber(unit.unit_id);
    if (!num) continue;
    if (unit.room_type_id === 'ac-teepee') addKey(`Teepee ${num}`, unit);
    if (unit.room_type_id === 'ac-kubo') addKey(`AC Kubo ${num}`, unit);
    if (unit.room_type_id === 'beach-villa') addKey(`Beach Villa ${num}`, unit);
    if (unit.room_type_id === 'pool-villa') addKey(`Pool Villa ${num}`, unit);
  }

  const bigKubo = units.find((unit) => unit.room_type_id === 'big-fan-kubo');
  if (bigKubo) {
    addKey('Big Kubo', bigKubo);
    addKey('Big Fan Kubo', bigKubo);
  }

  const ownersVilla = units.find((unit) => unit.room_type_id === 'owners-villa');
  if (ownersVilla) {
    addKey("Owner's Villa", ownersVilla);
    addKey('Owners Villa', ownersVilla);
  }

  return map;
}

function isDayTourUnit(value) {
  return /^day\s*tour|^daytour/i.test(normalizeText(value));
}

function extractUnitNumber(unitId) {
  const match = String(unitId || '').match(/-(\d+)$/);
  return match ? match[1] : '';
}

function buildRows(csvRows, units, previewRows, today = TODAY) {
  const [headerRow, ...dataRows] = csvRows;
  const headers = headerRow.map(normalizeHeader);
  const idx = (name) => headers.indexOf(name);
  const unitLookup = buildUnitLookup(units);

  const results = [];
  const errors = [];
  const warnings = [];

  dataRows.forEach((row, rowIndex) => {
    const get = (name) => {
      const i = idx(name);
      return i >= 0 ? row[i] ?? '' : '';
    };

    const rawUnit = normalizeText(get('unit'));
    const mappedUnit = unitLookup.get(slugify(rawUnit)) || unitLookup.get(slugify(stripUnitNotes(rawUnit))) || null;
    const dayTour = isDayTourUnit(rawUnit);
    const checkIn = parseLedgerDate(get('checkin'));
    const checkOut = parseLedgerDate(get('checkout'));
    const pax = parsePax(get('pax'));
    const amountPaid = normalizeMoney(get('dp'));
    const balance = normalizeMoney(get('balance'));
    const sheetTotal = normalizeMoney(get('total_cost'));
    const totalPrice = sheetTotal || amountPaid + balance;
    const status = checkIn && checkOut ? dateStatus(checkIn, checkOut, today) : 'APPROVED';
    const sheetNotes = normalizeText(get('notes'));

    const result = {
      sourceRow: rowIndex + 2,
      guest_name: normalizeText(get('guest_name')),
      raw_unit: rawUnit,
      unit_id: mappedUnit?.unit_id || null,
      room_type: mappedUnit ? roomTypeLabel(mappedUnit.room_type_id) : dayTour ? 'day_tour' : null,
      check_in: checkIn,
      check_out: checkOut,
      guests: pax,
      total_price: totalPrice,
      balance,
      amount_paid: amountPaid,
      payment_status: paymentStatus(totalPrice, amountPaid),
      status,
      booking_mode: BOOKING_MODE_MANUAL_OVERRIDE,
      booking_type: dayTour ? 'day_tour' : 'overnight',
      notes: [`Imported from legacy ledger row ${rowIndex + 2}`, sheetNotes].filter(Boolean).join(' | '),
    };

    if (!result.guest_name) errors.push({ row: result.sourceRow, reason: 'Missing Guest Name' });
    if (!rawUnit) errors.push({ row: result.sourceRow, reason: 'Missing Unit' });
    if (!mappedUnit && !dayTour) errors.push({ row: result.sourceRow, reason: `Unit not mapped: ${rawUnit || '(blank)'}` });
    if (!checkIn) errors.push({ row: result.sourceRow, reason: `Invalid Check-in: ${get('checkin')}` });
    if (!checkOut) errors.push({ row: result.sourceRow, reason: `Invalid Check-out: ${get('checkout')}` });
    if (!result.guests) warnings.push({ row: result.sourceRow, reason: 'Missing Pax' });

    results.push(result);
  });

  const preview = results.slice(0, previewRows);
  return { rows: results, preview, errors, warnings };
}

function summarizeRows(rows) {
  const summary = {
    totalRows: rows.length,
    mappedRows: 0,
    unmappedRows: 0,
    statusCounts: {},
    paymentStatusCounts: {},
    roomTypeCounts: {},
    totalPaid: 0,
    totalBalance: 0,
    totalGross: 0,
  };

  for (const row of rows) {
    if (row.unit_id) summary.mappedRows += 1;
    else summary.unmappedRows += 1;

    summary.statusCounts[row.status] = (summary.statusCounts[row.status] || 0) + 1;
    summary.paymentStatusCounts[row.payment_status] = (summary.paymentStatusCounts[row.payment_status] || 0) + 1;
    if (row.room_type) summary.roomTypeCounts[row.room_type] = (summary.roomTypeCounts[row.room_type] || 0) + 1;
    summary.totalPaid += row.amount_paid || 0;
    summary.totalBalance += row.balance || 0;
    summary.totalGross += row.total_price || 0;
  }

  return summary;
}

function openDb(dbPath) {
  const sqlite = sqlite3.verbose();
  const db = new sqlite.Database(dbPath);
  db.serialize(() => {
    db.run('PRAGMA busy_timeout=5000;');
  });
  return db;
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function ensureSchema(db) {
  const cols = await all(db, 'PRAGMA table_info(bookings)');
  const columnNames = new Set(cols.map((col) => col.name));

  if (!columnNames.has('booking_mode')) {
    await run(db, "ALTER TABLE bookings ADD COLUMN booking_mode TEXT DEFAULT 'STANDARD'");
  }
}

async function fetchUnits(db) {
  return all(
    db,
    'SELECT unit_id, unit_label, room_type_id FROM units ORDER BY unit_id'
  );
}

function makeBookingRef(index, roomType) {
  const prefixMap = {
    'AC Kubo': 'AKB',
    'AC Teepee': 'ATP',
    'Beach Villa': 'BVL',
    'Big Fan Kubo': 'BFK',
    'Fan Kubo': 'FKB',
    "Owner's Villa": 'OVL',
    'Pool Villa': 'PVL',
    day_tour: 'DTR',
  };
  const prefix = prefixMap[roomType] || 'LEG';
  return `${prefix}-LEG-${String(index).padStart(4, '0')}`;
}

async function importRows(db, rows) {
  let inserted = 0;
  let transactionsInserted = 0;

  await run(db, 'BEGIN TRANSACTION');

  try {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const bookingRef = makeBookingRef(i + 1, row.room_type);

      await run(
        db,
        `INSERT INTO bookings (
          booking_ref, room_type, check_in, check_out, guests, pax, full_name, guest_name,
          email, phone, total_price, total_amount, balance, deposit_paid, status,
          booking_status, payment_status, booking_source, booking_mode, created_by,
          notes, addon_amount, special_requests, unit_id, booking_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bookingRef,
          row.room_type,
          row.check_in,
          row.check_out,
          row.guests,
          row.guests,
          row.guest_name,
          row.guest_name,
          '',
          '',
          row.total_price,
          row.total_price,
          row.balance,
          row.amount_paid,
          row.status,
          row.status,
          row.payment_status,
          BOOKING_SOURCE,
          BOOKING_MODE_MANUAL_OVERRIDE,
          'admin',
          row.notes,
          0,
          '',
          row.unit_id,
          row.booking_type,
        ]
      );

      inserted += 1;

      if (row.amount_paid > 0) {
        const txType = row.amount_paid >= row.total_price && row.total_price > 0 ? 'Full Payment' : 'deposit';
        await run(
          db,
          `INSERT INTO transactions (
            booking_ref, amount, transaction_type, payment_method, status, notes
          ) VALUES (?, ?, ?, ?, 'VERIFIED', ?)`,
          [
            bookingRef,
            row.amount_paid,
            txType,
            PAYMENT_METHOD,
            `Imported from legacy ledger row ${row.sourceRow}`,
          ]
        );
        transactionsInserted += 1;
      }
    }

    await reconcileUnitStatuses(db);

    await run(db, 'COMMIT');
    return { inserted, transactionsInserted };
  } catch (error) {
    await run(db, 'ROLLBACK');
    throw error;
  }
}

async function reconcileUnitStatuses(db) {
  await run(db, "UPDATE units SET unit_status = 'Available' WHERE COALESCE(unit_status, 'Available') != 'Maintenance'");
  await run(
    db,
    `UPDATE units
     SET unit_status = 'Occupied'
     WHERE unit_id IN (
       SELECT DISTINCT unit_id
       FROM bookings
       WHERE status = 'OCCUPIED'
         AND unit_id IS NOT NULL
         AND COALESCE(is_deleted, 0) = 0
     )`
  );
}

async function reconcileLegacySnapshotRows(db, today = TODAY) {
  const rows = await all(
    db,
    `SELECT booking_ref, check_in, check_out, status
     FROM bookings
     WHERE booking_source = ?
       AND COALESCE(is_deleted, 0) = 0`,
    [BOOKING_SOURCE]
  );

  let updated = 0;
  const statusCounts = {};

  await run(db, 'BEGIN TRANSACTION');
  try {
    for (const row of rows) {
      const nextStatus = dateStatus(row.check_in, row.check_out, today);
      statusCounts[nextStatus] = (statusCounts[nextStatus] || 0) + 1;
      if (row.status !== nextStatus) {
        await run(
          db,
          'UPDATE bookings SET status = ?, booking_status = ? WHERE booking_ref = ?',
          [nextStatus, nextStatus, row.booking_ref]
        );
        updated += 1;
      }
    }

    await reconcileUnitStatuses(db);
    await run(db, 'COMMIT');
  } catch (error) {
    await run(db, 'ROLLBACK');
    throw error;
  }

  return {
    scanned: rows.length,
    updated,
    statusCounts,
  };
}

function printJson(label, data) {
  console.log(`\n${label}`);
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.csvPath && !args.reconcile) {
    throw new Error('Usage: node tools/import_manual_override_ledger.mjs --csv "path/to/file.csv" [--apply] OR --reconcile [--today YYYY-MM-DD]');
  }

  const dbPath = path.resolve(args.dbPath);
  const db = openDb(dbPath);

  try {
    await ensureSchema(db);

    if (args.reconcile) {
      const result = await reconcileLegacySnapshotRows(db, args.today);
      printJson('RECONCILE_RESULT', result);
      return;
    }

    const csvPath = path.resolve(args.csvPath);
    const text = fs.readFileSync(csvPath, 'utf8');
    const csvRows = parseCsv(text);
    if (csvRows.length < 2) {
      throw new Error('CSV file does not contain data rows.');
    }

    const units = await fetchUnits(db);
    const { rows, preview, errors, warnings } = buildRows(csvRows, units, args.previewRows, args.today);
    const summary = summarizeRows(rows);

    printJson('PREVIEW_SUMMARY', summary);
    printJson('PREVIEW_ROWS', preview);

    if (warnings.length > 0) {
      printJson('PREVIEW_WARNINGS', warnings.slice(0, 50));
    }

    if (errors.length > 0) {
      printJson('PREVIEW_ERRORS', errors.slice(0, 50));
      if (!args.apply) {
        console.log('\nDry run only. Fix the preview errors before applying.');
        return;
      }
      throw new Error(`Preview found ${errors.length} blocking error(s). Import aborted.`);
    }

    if (!args.apply) {
      console.log('\nDry run complete. No blocking errors found.');
      return;
    }

    const result = await importRows(db, rows);
    const bookingCount = await all(db, 'SELECT COUNT(*) AS count FROM bookings');
    const transactionCount = await all(db, 'SELECT COUNT(*) AS count FROM transactions');

    printJson('IMPORT_RESULT', {
      inserted_bookings: result.inserted,
      inserted_transactions: result.transactionsInserted,
      final_booking_count: bookingCount[0]?.count || 0,
      final_transaction_count: transactionCount[0]?.count || 0,
    });
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
