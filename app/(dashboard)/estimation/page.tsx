'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EstimationSimulator } from '@/components/estimation/EstimationSimulator';

function EstimationContent() {
    const searchParams = useSearchParams();
    const dealId = searchParams.get('dealId') ?? '';
    return <EstimationSimulator initialDealId={dealId} />;
}

export default function EstimationPage() {
    const t = useTranslations();
    return (
        <div className="p-6 space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-[#171717]">{t('estimation_engine')}</h2>
                <p className="text-[#8a8a8a] mt-1">{t('estimation_engine_description')}</p>
            </div>
            <Suspense fallback={null}>
                <EstimationContent />
            </Suspense>
        </div>
    );
}
