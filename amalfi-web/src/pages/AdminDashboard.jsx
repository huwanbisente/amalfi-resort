import React, { useState, useEffect } from 'react';
import {
    ShieldCheck,
    BookOpen,
    Hotel, 
    HelpCircle, 
    LogOut, 
    ExternalLink,
    CheckCircle2,
    XCircle,
    Activity,
    FileUp,
    RefreshCw
} from 'lucide-react';
import './AdminDashboard.css';
import { adminFetch, clearAdminToken, getAdminToken, setAdminToken } from '../adminApi';
import { buildCurrentBookingsSnapshotCsv, buildLedgerAllocationMeta, decorateUnitsWithLedger } from '../utils/adminDashboardData';

const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('pending');
    const [pending, setPending] = useState([]);
    const [ledger, setLedger] = useState([]);
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState('');
    const [snapshotFile, setSnapshotFile] = useState(null);
    const [snapshotPreview, setSnapshotPreview] = useState(null);
    const [snapshotBusy, setSnapshotBusy] = useState(false);
    const [snapshotNotice, setSnapshotNotice] = useState('');

    useEffect(() => {
        initializeDashboard();
    }, []);

    const requestToken = () => {
        const existing = getAdminToken();
        const token = window.prompt(
            'Enter the Amalfi admin token to access the protected dashboard.',
            existing
        );

        if (!token) return false;
        setAdminToken(token);
        setAuthError('');
        return true;
    };

    const initializeDashboard = async () => {
        if (!getAdminToken() && !requestToken()) {
            setLoading(false);
            setAuthError('Admin access requires a valid bearer token.');
            return;
        }

        await fetchAll();
    };

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [pResp, lResp, uResp] = await Promise.all([
                adminFetch('/bookings/pending'),
                adminFetch('/ledger'),
                adminFetch('/units')
            ]);

            const unauthorized = [pResp, lResp, uResp].find((resp) => resp.status === 401 || resp.status === 403);
            if (unauthorized) {
                clearAdminToken();
                setPending([]);
                setLedger([]);
                setUnits([]);
                setAuthError('The stored admin token was rejected. Please authenticate again.');
                setLoading(false);
                return;
            }

            const failed = [pResp, lResp, uResp].find((resp) => !resp.ok);
            if (failed) {
                const details = await failed.json().catch(() => ({}));
                throw new Error(details.error || 'Admin sync failed.');
            }

            const pData = await pResp.json();
            const lData = await lResp.json();
            const uData = await uResp.json();
            
            setPending(pData.pending || []);
            setLedger(lData.ledger || []);
            setUnits(uData.units || []);
            setAuthError('');
        } catch (e) {
            console.error("Master Sync failed", e);
            setAuthError(e.message || 'Admin sync failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (ref, decision) => {
        const adminId = "Vincent-Admin";
        const notes = prompt(`Enter notes for ${decision}:`);
        
        try {
            const resp = await adminFetch('/verify', {
                method: 'POST',
                body: JSON.stringify({ booking_ref: ref, decision, notes, admin_id: adminId })
            });

            if (resp.status === 401 || resp.status === 403) {
                clearAdminToken();
                setAuthError('Admin session expired. Please re-enter your token.');
                return;
            }

            if (resp.ok) {
                fetchAll();
                return;
            }

            const payload = await resp.json().catch(() => ({}));
            alert(payload.error || "Verification failed.");
        } catch (e) {
            alert("Verification failed.");
        }
    };

    const handleToggleBookingMode = async (booking) => {
        const nextMode = booking.booking_mode === 'MANUAL_OVERRIDE' ? 'STANDARD' : 'MANUAL_OVERRIDE';
        const confirmation = window.confirm(
            nextMode === 'MANUAL_OVERRIDE'
                ? `Mark ${booking.booking_ref} as Manual Override? This tells the system to trust manually entered booking values.`
                : `Return ${booking.booking_ref} to Standard mode?`
        );

        if (!confirmation) return;

        try {
            const resp = await adminFetch(`/bookings/${booking.booking_ref}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    booking_mode: nextMode,
                    admin_id: 'Vincent-Admin'
                })
            });

            if (resp.status === 401 || resp.status === 403) {
                clearAdminToken();
                setAuthError('Admin session expired. Please re-enter your token.');
                return;
            }

            if (!resp.ok) {
                const payload = await resp.json().catch(() => ({}));
                throw new Error(payload.error || 'Booking mode update failed.');
            }

            await fetchAll();
        } catch (e) {
            alert(e.message || 'Booking mode update failed.');
        }
    };

    const handleSnapshotFileChange = (event) => {
        const file = event.target.files?.[0] || null;
        setSnapshotFile(file);
        setSnapshotPreview(null);
        setSnapshotNotice(file ? `Loaded ${file.name}. Ready for preview.` : '');
    };

    const submitSnapshot = async (mode) => {
        if (!snapshotFile) {
            alert('Choose a CSV file first.');
            return;
        }

        setSnapshotBusy(true);
        setSnapshotNotice(mode === 'preview' ? 'Previewing snapshot CSV...' : 'Applying snapshot CSV...');

        try {
            const formData = new FormData();
            formData.append('file', snapshotFile);
            formData.append('admin_id', 'Vincent-Admin');

            const endpoint = mode === 'preview'
                ? '/bookings/snapshot/preview'
                : '/bookings/snapshot/apply';

            const resp = await adminFetch(endpoint, {
                method: 'POST',
                body: formData
            });

            if (resp.status === 401 || resp.status === 403) {
                clearAdminToken();
                setAuthError('Admin session expired. Please re-enter your token.');
                return;
            }

            const payload = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                throw new Error(payload.error || 'Snapshot import request failed.');
            }

            setSnapshotPreview(payload);
            setSnapshotNotice(
                mode === 'preview'
                    ? `Preview ready for ${payload.filename || snapshotFile.name}.`
                    : `Snapshot batch ${payload.batch_id} applied successfully.`
            );

            if (mode === 'apply') {
                await fetchAll();
            }
        } catch (e) {
            setSnapshotNotice(e.message || 'Snapshot import request failed.');
            alert(e.message || 'Snapshot import request failed.');
        } finally {
            setSnapshotBusy(false);
        }
    };

    const downloadCurrentBookingsCsv = () => {
        const { csvContent, exportedCount, candidateCount, skippedUnassignedCount } = buildCurrentBookingsSnapshotCsv(ledger);

        if (!exportedCount) {
            if (candidateCount > 0) {
                alert('Current bookings exist, but none have an assigned unit yet. Assign a unit first so the manual upload can populate the sanctuary map.');
                return;
            }

            alert('No current or upcoming live bookings are available for manual-upload export.');
            return;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);

        link.href = downloadUrl;
        link.download = `current-bookings-snapshot-${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);

        if (skippedUnassignedCount > 0) {
            alert(`${exportedCount} booking(s) exported. ${skippedUnassignedCount} booking(s) were skipped because they do not have an assigned unit yet, so they cannot populate the sanctuary map.`);
        }
    };

    const displayUnits = decorateUnitsWithLedger(units, ledger);

    if (loading) return (
        <div className="admin-loading-screen" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#18181b', color: '#fff' }}>
            <div style={{ textAlign: 'center' }}>
                <Activity className="animate-spin" size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <p style={{ letterSpacing: '4px', fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.8 }}>Calibrating Sanctuary Hub...</p>
            </div>
        </div>
    );

    if (authError && !pending.length && !ledger.length && !units.length) return (
        <div className="admin-loading-screen" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#18181b', color: '#fff', padding: '24px' }}>
            <div style={{ textAlign: 'center', maxWidth: '420px' }}>
                <ShieldCheck size={42} style={{ marginBottom: '16px', opacity: 0.75 }} />
                <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '10px' }}>Protected Admin Access</p>
                <p style={{ opacity: 0.8, lineHeight: 1.6, marginBottom: '18px' }}>{authError}</p>
                <button className="admin-btn primary" onClick={initializeDashboard}>
                    Re-enter Token
                </button>
            </div>
        </div>
    );

    const helpContent = {
        pending: {
            title: "Verification Protocol",
            description: "Authorize or reject incoming guest payments. Review the uploaded receipt to ensure the amount aligns with the booking total."
        },
        ledger: {
            title: "Master Ledger Archive",
            description: "A centralized view of all historical transactions and booking balances. Standard and Manual Override bookings are clearly marked here."
        },
        units: {
            title: "Strategic Unit Overview",
            description: "Real-time monitoring of available versus occupied units. Quickly check room conditions and maintenance status."
        },
        snapshots: {
            title: "Snapshot Import Console",
            description: "Upload the fixed resort CSV, preview row actions, and apply only safe Manual Override changes without touching protected live bookings."
        }
    };

    return (
        <div className="admin-layout">
            {/* Sidebar Navigation */}
            <aside className="admin-sidebar shadow-minimal">
                <div className="admin-sidebar-brand">
                    <h2>Amalfi<span>Hub</span></h2>
                </div>
                
                <nav className="admin-sidebar-nav">
                    <div 
                        className={`admin-nav-item ${activeTab === 'pending' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('pending')}
                    >
                        <ShieldCheck className="admin-nav-icon" />
                        <span>Verifications</span>
                        {pending.length > 0 && (
                            <span style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px' }}>
                                {pending.length}
                            </span>
                        )}
                    </div>
                    
                    <div 
                        className={`admin-nav-item ${activeTab === 'ledger' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('ledger')}
                    >
                        <BookOpen className="admin-nav-icon" />
                        <span>Master Ledger</span>
                    </div>
                    
                    <div 
                        className={`admin-nav-item ${activeTab === 'units' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('units')}
                    >
                        <Hotel className="admin-nav-icon" />
                        <span>Unit Status</span>
                    </div>

                    <div
                        className={`admin-nav-item ${activeTab === 'snapshots' ? 'active' : ''}`}
                        onClick={() => setActiveTab('snapshots')}
                    >
                        <FileUp className="admin-nav-icon" />
                        <span>Snapshots</span>
                    </div>
                </nav>

                <div className="admin-sidebar-footer" style={{ marginTop: 'auto', padding: '16px' }}>
                    <a href="/" className="admin-nav-item" style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                        <LogOut className="admin-nav-icon" />
                        <span>Exit Hub</span>
                    </a>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main fade-in">
                <header className="admin-header">
                    <div className="admin-header-title">
                        <h1>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Hub</h1>
                        <p>Executive Command Center | Sanctuary Control</p>
                    </div>
                    <div className="admin-header-actions">
                        <button className="admin-btn" onClick={fetchAll}>
                            <Activity size={14} />
                            Sync Data
                        </button>
                        <button className="admin-btn" onClick={() => { clearAdminToken(); initializeDashboard(); }}>
                            Re-auth
                        </button>
                    </div>
                </header>

                {authError && (
                    <div className="admin-help-banner" style={{ marginBottom: '16px', borderLeftColor: '#ef4444' }}>
                        <HelpCircle className="admin-help-icon" size={24} />
                        <div className="admin-help-text">
                            <h3>Authentication Notice</h3>
                            <p>{authError}</p>
                        </div>
                    </div>
                )}

                {/* Quick Guide Banner */}
                <div className="admin-help-banner">
                    <HelpCircle className="admin-help-icon" size={24} />
                    <div className="admin-help-text">
                        <h3>{helpContent[activeTab].title}</h3>
                        <p>{helpContent[activeTab].description}</p>
                    </div>
                </div>

                {/* Dynamic Content Panel */}
                <div className="admin-card">
                    {activeTab === 'pending' && (
                        <div className="admin-table-container">
                            {pending.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '80px', color: 'var(--admin-text-muted)' }}>
                                    <CheckCircle2 size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
                                    <p>System operational. No pending verifications detected.</p>
                                </div>
                            ) : (
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Reference</th>
                                            <th>Guest Details</th>
                                            <th>Receipt Info</th>
                                            <th>Evidence</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pending.map((item) => (
                                            <tr key={item.booking_ref}>
                                                <td style={{ fontWeight: 600 }}>{item.booking_ref}</td>
                                                <td>
                                                    <div style={{ fontWeight: 500 }}>{item.full_name}</div>
                                                    <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{item.phone}</div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 500 }}>PHP {item.trans_amount?.toLocaleString()}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#c41e3a', textTransform: 'uppercase' }}>{item.transaction_type}</div>
                                                </td>
                                                <td>
                                                    <a href={item.receipt_path} target="_blank" rel="noopener noreferrer" className="admin-btn">
                                                        <ExternalLink size={12} />
                                                        View Proof
                                                    </a>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button 
                                                            className="admin-btn primary" 
                                                            onClick={() => handleVerify(item.booking_ref, 'approve')}
                                                            title="Approve Reference"
                                                        >
                                                            <CheckCircle2 size={14} />
                                                        </button>
                                                        <button 
                                                            className="admin-btn" 
                                                            onClick={() => handleVerify(item.booking_ref, 'reject')}
                                                            style={{ color: '#ef4444' }}
                                                            title="Reject Reference"
                                                        >
                                                            <XCircle size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'ledger' && (
                        <div className="admin-table-container">
                            <div className="ledger-toolbar">
                                <div>
                                    <p className="ledger-toolbar-label">Snapshot CSV Export</p>
                                    <p className="ledger-toolbar-copy">
                                        Downloads a manual-upload CSV in the exact shape accepted by the Snapshot Import Console, with importer-safe dates and live payment totals.
                                    </p>
                                </div>
                                <button className="admin-btn primary" onClick={downloadCurrentBookingsCsv}>
                                    Download Manual Upload CSV
                                </button>
                            </div>
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Ref Code</th>
                                        <th>Guest</th>
                                        <th>Room Allocation</th>
                                        <th>Booking Type</th>
                                        <th>Status</th>
                                        <th>Outstanding</th>
                                        <th>Control</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ledger.map((row) => {
                                        const allocation = buildLedgerAllocationMeta(row);

                                        return (
                                        <tr key={row.booking_ref}>
                                            <td style={{ color: 'var(--admin-text-muted)' }}>{new Date(row.created_at).toLocaleDateString()}</td>
                                            <td style={{ fontWeight: 600 }}>{row.booking_ref}</td>
                                            <td style={{ fontWeight: 500 }}>{row.full_name}</td>
                                            <td>
                                                <div className="ledger-allocation-cell">
                                                    <div className="ledger-allocation-title">{allocation.primaryLabel}</div>
                                                    <div className="ledger-allocation-meta">{row.room_type || 'Room type pending'}</div>
                                                    <div className="ledger-allocation-detail">{allocation.secondaryLabel}</div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="ledger-mode-stack">
                                                    <span className={`admin-badge ${allocation.bookingCount > 1 ? 'badge-multi-booking' : 'badge-solo-booking'}`}>
                                                        {allocation.bookingKind}
                                                    </span>
                                                    <span className={`admin-badge ${row.booking_mode === 'MANUAL_OVERRIDE' ? 'badge-manual' : 'badge-standard'}`}>
                                                        {row.booking_mode === 'MANUAL_OVERRIDE' ? 'Manual Override' : 'Standard'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`admin-badge ${row.status === 'RESERVED' ? 'badge-approved' : 'badge-pending'}`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 700, color: row.balance > 0 ? '#ef4444' : '#22c55e' }}>
                                                PHP {row.balance?.toLocaleString()}
                                            </td>
                                            <td>
                                                <button
                                                    className={`admin-btn ${row.booking_mode === 'MANUAL_OVERRIDE' ? '' : 'primary'}`}
                                                    onClick={() => handleToggleBookingMode(row)}
                                                    title="Toggle booking mode"
                                                >
                                                    {row.booking_mode === 'MANUAL_OVERRIDE' ? 'Set Standard' : 'Set Manual'}
                                                </button>
                                            </td>
                                        </tr>
                                    )})}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'units' && (
                        <div style={{ padding: '32px' }}>
                            <div className="admin-units-grid">
                                {displayUnits.map((unit) => (
                                    <div key={unit.unit_id} className="admin-unit-card">
                                        <div className="admin-unit-label">{unit.marketing_name}</div>
                                        <div className="admin-unit-name">{unit.unit_label}</div>
                                        <div className="admin-unit-status">
                                            <div className={`status-dot ${unit.available ? 'status-available' : 'status-occupied'}`}></div>
                                            <span>{unit.available ? 'CLEAR' : 'CHECKED_IN'}</span>
                                        </div>
                                        {unit.active_booking && (
                                            <div style={{ marginTop: '12px', fontSize: '0.76rem', lineHeight: 1.5 }}>
                                                <div style={{ fontWeight: 600 }}>{unit.active_booking.guest_name || unit.active_booking.booking_ref}</div>
                                                <div style={{ color: 'var(--admin-text-muted)' }}>
                                                    {unit.active_booking.booking_ref} | {unit.active_booking.check_in} {'->'} {unit.active_booking.check_out}
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ marginTop: '16px', fontSize: '0.7rem', color: 'var(--admin-text-muted)', borderTop: '1px solid #f4f4f5', paddingTop: '12px' }}>
                                            Health Check: <span style={{ color: '#09090b', fontWeight: 500 }}>{unit.condition}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'snapshots' && (
                        <div className="snapshot-shell">
                            <div className="snapshot-toolbar">
                                <div>
                                    <p className="snapshot-eyebrow">CSV Snapshot Uploader</p>
                                    <h2>Manual Override Refresh Lane</h2>
                                    <p className="snapshot-copy">
                                        This tool previews every row before apply. It only creates or updates safe Manual Override records and surfaces protected overlaps as conflicts.
                                    </p>
                                </div>

                                <div className="snapshot-actions">
                                    <label className="snapshot-file-picker">
                                        <FileUp size={16} />
                                        <span>{snapshotFile ? snapshotFile.name : 'Choose CSV'}</span>
                                        <input type="file" accept=".csv" onChange={handleSnapshotFileChange} />
                                    </label>
                                    <button className="admin-btn" onClick={() => submitSnapshot('preview')} disabled={snapshotBusy || !snapshotFile}>
                                        <RefreshCw size={14} />
                                        Preview
                                    </button>
                                    <button className="admin-btn primary" onClick={() => submitSnapshot('apply')} disabled={snapshotBusy || !snapshotFile}>
                                        <CheckCircle2 size={14} />
                                        Apply Safe Rows
                                    </button>
                                </div>
                            </div>

                            <div className="snapshot-notice">
                                {snapshotBusy ? 'Processing snapshot request...' : (snapshotNotice || 'Load a CSV to start the preview flow.')}
                            </div>

                            {snapshotPreview && (
                                <>
                                    <div className="snapshot-summary-grid">
                                        <div className="snapshot-summary-card">
                                            <span>Rows</span>
                                            <strong>{snapshotPreview.summary?.total_rows || 0}</strong>
                                        </div>
                                        <div className="snapshot-summary-card">
                                            <span>Create</span>
                                            <strong>{snapshotPreview.summary?.action_counts?.CREATE || 0}</strong>
                                        </div>
                                        <div className="snapshot-summary-card">
                                            <span>Update</span>
                                            <strong>{snapshotPreview.summary?.action_counts?.UPDATE || 0}</strong>
                                        </div>
                                        <div className="snapshot-summary-card">
                                            <span>Conflict</span>
                                            <strong>{snapshotPreview.summary?.action_counts?.CONFLICT || 0}</strong>
                                        </div>
                                        <div className="snapshot-summary-card">
                                            <span>Error</span>
                                            <strong>{snapshotPreview.summary?.action_counts?.ERROR || 0}</strong>
                                        </div>
                                        <div className="snapshot-summary-card">
                                            <span>Gross</span>
                                            <strong>PHP {snapshotPreview.summary?.total_gross?.toLocaleString?.() || 0}</strong>
                                        </div>
                                    </div>

                                    <div className="admin-table-container">
                                        <table className="admin-table snapshot-table">
                                            <thead>
                                                <tr>
                                                    <th>Row</th>
                                                    <th>Guest</th>
                                                    <th>Unit Mapping</th>
                                                    <th>Stay</th>
                                                    <th>Money</th>
                                                    <th>Action</th>
                                                    <th>Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {snapshotPreview.rows?.map((row) => (
                                                    <tr key={`${row.source_row}-${row.guest_name}-${row.raw_unit}`}>
                                                        <td style={{ fontWeight: 700 }}>{row.source_row}</td>
                                                        <td>
                                                            <div style={{ fontWeight: 600 }}>{row.guest_name || 'Unnamed Guest'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                                                                Pax: {row.guests ?? 'Blank'}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div style={{ fontWeight: 600 }}>{row.raw_unit || 'No Unit'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                                                                {row.unit_id ? `${row.room_type} -> ${row.unit_id}` : 'Mapping failed'}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div>{row.check_in || 'Invalid'} to {row.check_out || 'Invalid'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>{row.status}</div>
                                                        </td>
                                                        <td>
                                                            <div style={{ fontWeight: 600 }}>PHP {row.total_price?.toLocaleString?.() || 0}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                                                                Paid {row.amount_paid?.toLocaleString?.() || 0} | Balance {row.balance?.toLocaleString?.() || 0}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className={`admin-badge snapshot-action-badge action-${String(row.action || '').toLowerCase()}`}>
                                                                {row.action}
                                                            </span>
                                                            {row.existing_booking_ref && (
                                                                <div style={{ fontSize: '0.72rem', marginTop: '6px', color: 'var(--admin-text-muted)' }}>
                                                                    {row.existing_booking_ref}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <div style={{ fontSize: '0.8rem' }}>{row.reason}</div>
                                                            {!!row.warnings?.length && (
                                                                <div className="snapshot-warning-chip">
                                                                    {row.warnings.join(' | ')}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;

