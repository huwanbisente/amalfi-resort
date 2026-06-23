const fs = require('fs');
const path = require('path');

// Target files
const appJsPath = path.join(__dirname, 'app.js');
const outputPath = path.join(__dirname, 'amalfi_resort_notebooklm_corpus.md');

console.log('Generating NotebookLM Corpus...');

try {
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // Extract villas array
  const villasMatch = appJsContent.match(/const villas = (\[[\s\S]*?\]);/);
  let villas = [];
  if (villasMatch) {
    villas = eval(villasMatch[1]);
  }

  // Extract reservations array
  const reservationsMatch = appJsContent.match(/const reservations = (\[[\s\S]*?\]);/);
  let reservations = [];
  if (reservationsMatch) {
    reservations = eval(reservationsMatch[1]);
  }

  // Calculate analytics metrics
  const activeRes = reservations.filter(r => r.bookingStatus === 'Checked In' && !r.isBlockout);
  const occupancyRate = ((activeRes.length / villas.length) * 100).toFixed(1);
  const totalReceivables = reservations
    .filter(r => !r.isBlockout && (r.paymentStatus === 'PARTIAL' || r.paymentStatus === 'UNPAID'))
    .reduce((sum, r) => sum + parseFloat(String(r.folio).replace(/,/g, '')), 0);
  const holds = reservations.filter(r => r.isBlockout);

  // Generate Markdown
  let md = `# Amalfi Resort Operations & RAG Corpus
Generated on: ${new Date().toLocaleDateString()}
Location: Zambales, Philippines

This document serves as the primary ground-truth operational database for the Amalfi Resort Management System, formatted for optimal digestion by Google NotebookLM.

---

## 1. Resort Accommodation Directory
List of available villas, classification, and standard base pricing:

| Villa ID | Name | Category | Standard Nightly Rate |
|---|---|---|---|
${villas.map(v => `| ${v.id} | ${v.name} | ${v.category} | ₱${v.nightlyRate.toLocaleString('en-US', {minimumFractionDigits: 2})} |`).join('\n')}

---

## 2. Active Operations Database (Live Reservations)
List of active and confirmed guest reservations on the timeline:

${reservations.filter(r => !r.isBlockout).map((r, i) => `### Reservation #${i + 1}: ${r.guest}
- **Guest Name**: ${r.guest}
- **Villa Assigned**: ${r.villaName} (${r.villa})
- **Stay Dates**: ${r.dates} (${r.duration} nights)
- **Folio Total**: ₱${parseFloat(String(r.folio).replace(/,/g, '')).toLocaleString('en-US', {minimumFractionDigits: 2})}
- **Booking Status**: ${r.bookingStatus}
- **Payment Status**: ${r.paymentStatus}
- **Amenities Selected**:
  - Private Yacht: ${r.addonYacht ? 'Yes' : 'No'}
  - Sommelier Wine: ${r.addonWine ? 'Yes' : 'No'}
  - Spa & Wellness: ${r.addonSpa ? 'Yes' : 'No'}
  - Personal Chef: ${r.addonChef ? 'Yes' : 'No'}
`).join('\n')}

---

## 3. Financial Ledger Summary
Receivables, profit pacing, and revenue allocations:

- **Total Receivables (Folios Due)**: ₱${totalReceivables.toLocaleString('en-US', {minimumFractionDigits: 2})}
- **Average Daily Rate (ADR)**: ₱4,733.33 (YTD +12.4% MoM)
- **RevPAR Performance**: ₱4,007.16 (YTD +8.2% MoM)
- **EBITDA Profit Margin Pacing**: 48.6% (On track for H1 Target)
- **Revenue Department Allocation**:
  - Lodging Accommodation: 75%
  - Incidentals & Amenity Packages: 25%

---

## 4. Maintenance & Operations Holds
Active holds and pending front desk verifications:

- **Current Occupancy Rate**: ${occupancyRate}% (${activeRes.length} of ${villas.length} villas occupied)
- **Active Maintenance holds**: ${holds.length}
${holds.map(h => `  - **${h.villaName}** (${h.villa}) under active Maintenance Hold (Dates: ${h.dates})`).join('\n') || '  - None'}
- **Open Work Tickets**: AC Unit Compressor replacement scheduled for Villa 4.
- **Pending Wire Transfers**: Lord Harrington (Villa 6) - SWIFT transfer verification slip submitted for ₱42,100.00 is awaiting manager confirmation.

---

## 5. Accommodation Policies & Service Rates
Standard operational guidelines from the Knowledgebase:

- **Check-in Policy**: Standard check-in starts at 14:00. Early check-in fee is ₱2,500.00 (subject to room availability).
- **Check-out Policy**: Standard checkout is by 11:00. Late check-out fee is ₱3,500.00 (extended access until 16:00).
- **Security Deposit**: A refundable deposit of ₱15,000.00 is required upon reservation confirmation.
- **Private Amenity Rates**:
  - **Private Yacht Charter**: ₱15,000.00 per hour (includes captain, crew, and complimentary prosecco).
  - **Sommelier Wine Tasting**: ₱2,500.00 per session.
  - **Personal Chef Hire**: ₱8,500.00 per meal service.
  - **Luxury Wellness Spa Program**: ₱4,200.00 per session.
`;

  fs.writeFileSync(outputPath, md);
  console.log(`Success! Corpus file generated at:\n${outputPath}`);
  console.log('You can now drag and drop this file directly into Google NotebookLM.');

} catch (err) {
  console.error('Error generating corpus:', err);
}
