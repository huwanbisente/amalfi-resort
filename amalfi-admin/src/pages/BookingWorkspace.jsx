import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { BookingHistoryPanel } from '../components/booking-workspace/BookingHistoryPanel';
import { BookingAddonsPanel } from '../components/booking-workspace/BookingAddonsPanel';
import { BookingActionsPanel } from '../components/booking-workspace/BookingActionsPanel';
import { BookingOverviewPanel } from '../components/booking-workspace/BookingOverviewPanel';
import { BookingPaymentsPanel } from '../components/booking-workspace/BookingPaymentsPanel';
import { BookingSummarySidebar } from '../components/booking-workspace/BookingSummarySidebar';
import { BookingUnitsPanel } from '../components/booking-workspace/BookingUnitsPanel';
import { BookingWorkspaceHeader } from '../components/booking-workspace/BookingWorkspaceHeader';
import { useBookingWorkspace } from '../components/booking-workspace/useBookingWorkspace';
import { Button, Card, CardContent, Tabs, TabsList, TabsTrigger } from '../components/shared';

const tabs = [
    { id: 'overview', label: 'Guest & Stay' },
    { id: 'units', label: 'Rooms' },
    { id: 'addons', label: 'Charges' },
    { id: 'payments', label: 'Payments' },
    { id: 'actions', label: 'Check-In/Out' },
    { id: 'history', label: 'Audit Trail' }
];

export default function BookingWorkspace() {
    const navigate = useNavigate();
    const location = useLocation();
    const { bookingRef: encodedBookingRef } = useParams();
    const bookingRef = decodeURIComponent(encodedBookingRef || '');
    const [activeTab, setActiveTab] = useState('overview');
    const {
        loading,
        error,
        refresh,
        model,
        submitOverview,
        submitPayment,
        submitItemUpdate,
        submitAddonCharge,
        submitStatusUpdate,
        submitCheckout,
        overviewSaving,
        overviewError,
        overviewSuccess,
        addonSaving,
        addonError,
        addonSuccess,
        actionSaving,
        actionError,
        actionSuccess,
        paymentSaving,
        paymentError,
        paymentSuccess,
        itemSavingId,
        itemError,
        itemSuccess
    } = useBookingWorkspace(bookingRef, location.state?.booking || null);

    const activePanel = useMemo(() => {
        switch (activeTab) {
            case 'units':
                return (
                    <BookingUnitsPanel
                        units={model.units}
                        availableUnits={model.availableUnits}
                        canEditUnits={model.meta.canEditUnits}
                        onSubmitItemUpdate={submitItemUpdate}
                        itemSavingId={itemSavingId}
                        itemError={itemError}
                        itemSuccess={itemSuccess}
                    />
                );
            case 'addons':
                return (
                    <BookingAddonsPanel
                        booking={model.booking}
                        totals={model.totals}
                        addons={model.addons}
                        canAddAddons={model.meta.canAddAddons}
                        onSubmitAddonCharge={submitAddonCharge}
                        addonSaving={addonSaving}
                        addonError={addonError}
                        addonSuccess={addonSuccess}
                    />
                );
            case 'payments':
                return (
                    <BookingPaymentsPanel
                        payments={model.payments}
                        reconciliation={model.reconciliation}
                        booking={model.booking}
                        totals={model.totals}
                        canRecordPayments={model.meta.canRecordPayments}
                        onSubmitPayment={submitPayment}
                        paymentSaving={paymentSaving}
                        paymentError={paymentError}
                        paymentSuccess={paymentSuccess}
                    />
                );
            case 'actions':
                return (
                    <BookingActionsPanel
                        booking={model.booking}
                        totals={model.totals}
                        canRunActions={model.meta.canRunActions}
                        onSubmitStatusUpdate={submitStatusUpdate}
                        onSubmitCheckout={submitCheckout}
                        actionSaving={actionSaving}
                        actionError={actionError}
                        actionSuccess={actionSuccess}
                    />
                );
            case 'history':
                return <BookingHistoryPanel history={model.history} />;
            case 'overview':
            default:
                return (
                    <BookingOverviewPanel
                        booking={model.booking}
                        canEditOverview={model.meta.canEditOverview}
                        onSubmitOverview={submitOverview}
                        overviewSaving={overviewSaving}
                        overviewError={overviewError}
                        overviewSuccess={overviewSuccess}
                    />
                );
        }
    }, [activeTab, model, submitOverview, overviewSaving, overviewError, overviewSuccess, submitAddonCharge, addonSaving, addonError, addonSuccess, submitPayment, paymentSaving, paymentError, paymentSuccess, submitStatusUpdate, submitCheckout, actionSaving, actionError, actionSuccess, submitItemUpdate, itemSavingId, itemError, itemSuccess]);

    const handleBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate('/');
    };

    if (loading) {
        return (
            <div className="grid min-h-screen place-items-center bg-[#fffdf8] p-6 text-foreground">
                <div className="text-sm font-black text-muted-foreground">Loading booking workspace...</div>
            </div>
        );
    }

    if (error || !model.booking) {
        return (
            <div className="grid min-h-screen place-items-center bg-[#fffdf8] p-6">
                <Card className="w-full max-w-xl rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                    <CardContent className="grid gap-4 p-7">
                        <div className="text-lg font-black text-foreground">Booking workspace unavailable</div>
                        <div className="text-sm font-semibold leading-relaxed text-muted-foreground">{error || 'This booking could not be loaded.'}</div>
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" onClick={handleBack} className="rounded-xl font-black">Back</Button>
                            <Button type="button" onClick={refresh} className="rounded-xl font-black">Retry</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#fffdf8]">
            <div className="mx-auto max-w-[1480px] p-4 sm:p-6">
                <Card className="overflow-hidden rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                    <BookingWorkspaceHeader
                        booking={model.booking}
                        bookingKind={model.meta.bookingKind}
                        onBack={handleBack}
                        onRefresh={refresh}
                        onOpenLedger={() => navigate('/')}
                    />

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="border-b border-[#d8c9b3]/70 px-5 py-4 sm:px-7">
                        <TabsList className="flex h-auto w-fit max-w-full flex-wrap justify-start gap-1 rounded-2xl border border-[#eadfc9]/90 bg-[#f7eedf]/62 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_8px_16px_rgba(19,33,31,0.035)]">
                            {tabs.map((tab) => (
                                <TabsTrigger
                                    key={tab.id}
                                    value={tab.id}
                                    className="rounded-xl border border-[#d8c9b3]/80 bg-[#fffdf8]/78 px-4 py-2 text-xs font-black text-[#5f6d66] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:border-[#c6923f]/70 hover:bg-[#fff7e6] hover:text-[#70480f] data-[state=active]:border-[#0a6b5f] data-[state=active]:bg-[linear-gradient(180deg,#0d766a_0%,#075f55_100%)] data-[state=active]:text-[#fffdf8] data-[state=active]:shadow-[0_8px_18px_rgba(10,107,95,0.18),inset_0_1px_0_rgba(255,255,255,0.22)]"
                                >
                                    {tab.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>

                    <div className="grid items-start gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div>{activePanel}</div>
                        <BookingSummarySidebar
                            booking={model.booking}
                            totals={model.totals}
                            units={model.units}
                            warnings={model.warnings}
                            bookingKind={model.meta.bookingKind}
                        />
                    </div>
                </Card>
            </div>
        </div>
    );
}
