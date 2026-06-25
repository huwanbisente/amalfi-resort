import React, { useEffect, useState } from 'react';
import { Bot, RefreshCw } from 'lucide-react';
import { api } from '../utils/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';
import { cn } from '@/lib/utils';

const healthClasses = {
    urgent: {
        dot: 'bg-amalfi-coral shadow-[0_0_8px_var(--admin-coral)]',
        text: 'text-amalfi-coral',
    },
    monitor: {
        dot: 'bg-amalfi-gold shadow-[0_0_8px_var(--admin-gold)]',
        text: 'text-amalfi-gold',
    },
    calm: {
        dot: 'bg-amalfi-emerald shadow-[0_0_8px_var(--admin-emerald)]',
        text: 'text-amalfi-emerald',
    },
};

export function ConciergeHub() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchLogs = () => {
        // Route through hub-api proxy (Vite proxies /api/* to hub-api:3001)
        api.get('/api/v1/admin/chatbot-logs?limit=40')
            .then(d => {
                if (d.logs) setLogs(d.logs);
                else if (d.error) setError(d.error);
                setLoading(false);
            })
            .catch(e => {
                console.error(e);
                setError("Could not reach Chatbot Service. Ensure port 8101 is open.");
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 15000); // Auto-refresh every 15s
        return () => clearInterval(interval);
    }, []);

    if (loading) return <LoadingState label="Connecting to Concierge AI..." />;

    const recentLogs = logs.slice(0, 40);
    const stress = recentLogs.reduce((s, log) => {
        const intent = (log.Intent || '').toLowerCase();
        if (intent === 'unrecognized' || intent === 'ai_fallback') return s + 2;
        if (intent === 'human_request' || intent === 'human_handoff') return s + 5;
        return s;
    }, 0);
    const score = recentLogs.length > 0 ? Math.min((stress / (recentLogs.length * 2)) * 100, 100) : 0;

    const health = score > 35 ? { key: 'urgent', label: 'Urgent', sub: 'Guests need help' } :
        (score > 15 ? { key: 'monitor', label: 'Monitor', sub: 'Minor friction' } :
            { key: 'calm', label: 'Calm', sub: 'AI is handling it' });
    const healthClass = healthClasses[health.key];

    return (
        <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 flex flex-col gap-5">
            <Card className="rounded-[24px] border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-4">
                            <div className="grid size-11 place-items-center rounded-2xl bg-amalfi-emerald/10 text-amalfi-emerald">
                                <Bot />
                            </div>
                            <div>
                                <h2 className="m-0 font-resortDisplay text-xl font-black tracking-normal text-amalfi-ink">Guest Concierge Monitor</h2>
                                <p className="m-0 mt-1 text-xs font-semibold text-amalfi-muted">Real-time audit of AI-Guest interactions.</p>
                            </div>
                        </div>

                        <div className="hidden h-8 w-px bg-border sm:block" />

                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className={cn('size-2 rounded-full', healthClass.dot)} />
                                <span className={cn('text-sm font-black uppercase tracking-normal', healthClass.text)}>{health.label}</span>
                            </div>
                            <span className="ml-4 text-[0.62rem] font-black uppercase tracking-normal text-amalfi-muted">{health.sub}</span>
                        </div>
                    </div>

                    <Button
                        type="button"
                        onClick={fetchLogs}
                        className="rounded-xl bg-amalfi-emerald font-black text-white shadow-[0_16px_36px_rgba(19,33,31,0.06)] hover:bg-amalfi-emerald/90"
                    >
                        <RefreshCw data-icon="inline-start" />
                        Refresh Feed
                    </Button>
                </CardContent>
            </Card>

            {error && (
                <div className="rounded-2xl border border-amalfi-coral/20 bg-amalfi-coral/10 p-4 text-sm font-bold text-amalfi-coral">
                    {error}
                </div>
            )}

            <div className="flex flex-col gap-3">
                {logs.length === 0 && !error && (
                    <EmptyState title="No interactions logged" description="No interactions logged yet today." />
                )}

                {logs.map((log, index) => (
                    <Card key={index} className="overflow-hidden rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]">
                        <CardHeader className="flex flex-col gap-3 border-b border-[#d8c9b3]/60 bg-[#f7eedf]/42 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap gap-3 text-xs font-black text-amalfi-muted">
                                <span>{log.Timestamp}</span>
                                <span>{log['Sender ID'] || 'GUEST'}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary" className="rounded-lg bg-[#fffdf8] font-black text-amalfi-emerald">
                                    {log.Intent?.toUpperCase() || 'CHAT'}
                                </Badge>
                                {log['Is Urgent'] === 'URGENT' && (
                                    <Badge className="rounded-lg bg-amalfi-coral font-black text-white">URGENT</Badge>
                                )}
                            </div>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-4 p-5">
                            <div className="max-w-[85%] self-start">
                                <div className="ml-3 mb-1 text-[0.62rem] font-black uppercase tracking-normal text-amalfi-muted">Guest</div>
                                <div className="rounded-2xl rounded-bl-sm bg-[#f7eedf] px-4 py-3 text-sm font-semibold leading-6 text-amalfi-ink">
                                    {log['User Message']}
                                </div>
                            </div>

                            <div className="max-w-[85%] self-end">
                                <div className="mr-3 mb-1 text-right text-[0.62rem] font-black uppercase tracking-normal text-amalfi-emerald">Amalfi Concierge</div>
                                <div className="rounded-2xl rounded-br-sm border border-amalfi-emerald/20 bg-amalfi-emerald/10 px-4 py-3 text-sm font-semibold leading-6 text-amalfi-ink">
                                    {log['Bot Answer']}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
