'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EstimationSimulator } from '@/components/estimation/EstimationSimulator';

function EstimationContent() {
    const searchParams = useSearchParams();
    const dealId = searchParams.get('dealId') ?? '';
    return <EstimationSimulator initialDealId={dealId} />;
}

export default function EstimationPage() {
    return (
        <div className="p-6 space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Estimation Engine</h2>
                <p className="text-slate-500 mt-1">Simulate margins and calculate project costs with precision. Select a deal from the CRM pipeline to load its data, or build an estimate from scratch.</p>
            </div>
            <Suspense fallback={null}>
                <EstimationContent />
            </Suspense>
        </div>
    );
}
