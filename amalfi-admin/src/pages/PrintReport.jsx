import React, { useEffect, useState } from 'react';

const headerCellClass = 'border-[1.5px] border-black bg-[#f0f0f0] p-2.5 text-left text-[8.5pt] font-black uppercase tracking-[0.5px]';
const bodyCellClass = 'border border-black p-2 text-[8.5pt]';
const statLabelClass = 'mb-1 text-[6.5pt] font-black uppercase';
const statValueClass = 'text-[15pt] font-black';

const PrintReport = () => {
    const [data, setData] = useState(null);

    useEffect(() => {
        // Security/data handshake for the print-only route.
        const raw = sessionStorage.getItem('print_report_data');
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                setData(parsed);
                setTimeout(() => {
                    window.print();
                }, 1500);
            } catch (e) {
                console.error("Failed to parse report data", e);
            }
        }
    }, []);

    if (!data) return (
        <div className="p-[100px] text-center font-sans">
            <h2 className="opacity-30">Establishing Secure Handshake...</h2>
            <p className="text-[0.8rem] opacity-50">Fetching reporting nodes from operational ledger.</p>
        </div>
    );

    const { ledger = [], receivables = [], summary = {} } = data;

    return (
        <div className="print-portal-root flex min-h-screen flex-col bg-white p-[20mm] font-sans leading-normal text-black print:p-0">
            <header className="mb-9 flex items-end justify-between border-b-[5px] border-black pb-6">
                <div>
                    <img src="/api/v1/assets/logo/resort-logo.jpg" alt="Amalfi Logo" className="h-[90px] object-contain" />
                </div>
                <div className="text-right">
                    <h1 className="m-0 text-[22pt] font-black uppercase tracking-normal">Executive Financial Summary</h1>
                    <p className="m-0 mt-1 text-[9pt] font-bold opacity-80">
                        Operational Audit: {new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="m-0 text-[8pt] italic text-[#666]">Confidential Proprietary Document</p>
                </div>
            </header>

            <div className="mb-10 grid grid-cols-4 gap-4">
                <div className="border-[2.5px] border-black p-4 text-center">
                    <div className={statLabelClass}>Total Settled</div>
                    <div className={statValueClass}>{summary.totalRev}</div>
                </div>
                <div className="border-[2.5px] border-black p-4 text-center">
                    <div className={`${statLabelClass} text-[#b71c1c]`}>Receivables</div>
                    <div className={`${statValueClass} text-[#b71c1c]`}>{summary.totalDue}</div>
                </div>
                <div className="border-[2.5px] border-black p-4 text-center">
                    <div className={statLabelClass}>Gross Revenue</div>
                    <div className={statValueClass}>{summary.gross}</div>
                </div>
                <div className="border-[2.5px] border-black p-4 text-center">
                    <div className={statLabelClass}>Agent Comm</div>
                    <div className={statValueClass}>{summary.commission}</div>
                </div>
            </div>

            <main>
                <div className="mt-8 inline-block bg-black px-4 py-2 text-[13pt] font-black uppercase tracking-[1px] text-white">
                    I. Master Operational Ledger
                </div>
                <table className="mt-5 w-full border-collapse text-[8.5pt]">
                    <thead>
                        <tr>
                            <th className={headerCellClass}>REF ID</th>
                            <th className={headerCellClass}>GUEST NAME</th>
                            <th className={headerCellClass}>STAY DATE</th>
                            <th className={headerCellClass}>UNIT</th>
                            <th className={`${headerCellClass} text-right`}>BILLED</th>
                            <th className={`${headerCellClass} text-right`}>SETTLED</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ledger.map((b, i) => {
                            const tot = (Number(b.total_price || 0) + Number(b.addon_amount || 0));
                            const pd = Number(b.amount_paid || 0);
                            return (
                                <tr key={i}>
                                    <td className={`${bodyCellClass} font-extrabold`}>{b.booking_ref || 'INTERNAL'}</td>
                                    <td className={`${bodyCellClass} font-extrabold`}>{b.full_name}</td>
                                    <td className={bodyCellClass}>{b.check_in}</td>
                                    <td className={`${bodyCellClass} text-center`}>{b.unit_label || b.unit_id}</td>
                                    <td className={`${bodyCellClass} text-right`}>â‚±{tot.toLocaleString()}</td>
                                    <td className={`${bodyCellClass} text-right font-extrabold`}>â‚±{pd.toLocaleString()}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div className="[break-before:page]" />

                <div className="mt-8 inline-block bg-[#b71c1c] px-4 py-2 text-[13pt] font-black uppercase tracking-[1px] text-white">
                    II. Risk Audit: Outstanding Accounts
                </div>
                <p className="mt-2.5 text-[8pt] text-[#666]">
                    The following accounts have pending balances as of the audit period. Reconcile with GCash/Maya statements.
                </p>
                <table className="mt-5 w-full border-collapse text-[8.5pt]">
                    <thead>
                        <tr>
                            <th className={headerCellClass}>BOOKING REFERENCE</th>
                            <th className={headerCellClass}>ACCOUNT HOLDER</th>
                            <th className={headerCellClass}>DUE DATE</th>
                            <th className={`${headerCellClass} text-right`}>OUTSTANDING BALANCE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {receivables.map((b, i) => {
                            const bal = (Number(b.total_price || 0) + Number(b.addon_amount || 0)) - Number(b.amount_paid || 0);
                            if (bal <= 0) return null;
                            return (
                                <tr key={i}>
                                    <td className={`${bodyCellClass} font-extrabold`}>{b.booking_ref}</td>
                                    <td className={`${bodyCellClass} font-extrabold`}>{b.full_name}</td>
                                    <td className={bodyCellClass}>{b.check_in}</td>
                                    <td className={`${bodyCellClass} text-right font-black text-[#b71c1c]`}>â‚±{bal.toLocaleString()}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            <footer className="mt-auto flex justify-between border-t-2 border-black pt-8 text-[7pt] font-bold opacity-60">
                <div>AMALFI RESORT FS | {new Date().toLocaleTimeString()}</div>
                <div>OFFICIAL SYSTEM EXPORT | DO NOT TAMPER</div>
            </footer>
        </div>
    );
};

export default PrintReport;
