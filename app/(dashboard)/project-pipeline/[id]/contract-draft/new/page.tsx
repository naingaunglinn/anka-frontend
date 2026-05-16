'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDealDetail } from '@/lib/queries/deals';
import { usePermission } from '@/hooks/usePermission';
import { ContractDraftWizard } from '@/components/project-pipeline/contracts/ContractDraftWizard';
import { isContractEligible } from '@/lib/dealRanks';

/**
 * Start a new AI-generated contract draft for a deal. Lives under
 * /project-pipeline (renamed from /crm in chg-009 Phase D).
 *
 * Eligibility checks are mirrored on the backend (ContractDraftService)
 * but we surface specific guidance here so the salesperson knows what
 * to ask the Estimation menu owner to populate.
 */
export default function NewContractDraftPage() {
    const params = useParams();
    const router = useRouter();
    const dealId = params.id as string;

    const { allowed: canManage, reason: rbacReason } = usePermission('manage_crm');
    const { data: deal, isLoading, error } = useDealDetail(dealId);

    if (!canManage) {
        return (
            <div className="container mx-auto p-6 max-w-3xl">
                <h1 className="text-2xl font-bold tracking-tight">Permission required</h1>
                <p className="text-sm text-muted-foreground mt-2">{rbacReason}</p>
                <Button variant="outline" className="mt-4" onClick={() => router.push(`/project-pipeline/${dealId}`)}>
                    Back to deal
                </Button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="container mx-auto p-6 max-w-6xl">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading deal…
                </div>
            </div>
        );
    }

    if (error || !deal) {
        return (
            <div className="container mx-auto p-6 max-w-6xl">
                <Card className="border-red-200 bg-red-50/30">
                    <CardContent className="p-6">
                        <p className="text-sm text-red-700">Couldn&apos;t load this deal.</p>
                        <Button variant="outline" className="mt-3" onClick={() => router.push('/project-pipeline')}>
                            Back to pipeline
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isContractEligible(deal)) {
        const missing: string[] = [];
        if (deal.status !== 'negotiation') missing.push(`deal must be at rank A (currently ${deal.status ?? 'unknown'} — the Estimation handoff auto-advances B → A once complete)`);
        if (deal.lifecycleStatus === 'dropped') missing.push('deal has been dropped');
        if (deal.finalMonthlyFee == null) missing.push('final_monthly_fee');
        if (deal.finalContractMonths == null) missing.push('final_contract_months');
        if (!deal.finalTeamSummary) missing.push('final_team_summary');
        if (!deal.finalCurrency) missing.push('final_currency');
        if (!deal.finalConfirmedAt) missing.push('final_confirmed_at');

        return (
            <div className="container mx-auto p-6 max-w-3xl space-y-4">
                <Card className="border-amber-200 bg-amber-50/30">
                    <CardContent className="p-6 space-y-3">
                        <h1 className="text-xl font-bold tracking-tight text-amber-900">
                            Not ready for contract drafting
                        </h1>
                        <p className="text-sm text-amber-800">
                            This deal is missing data the contract template needs. The Estimation menu
                            must populate these fields before drafting can start:
                        </p>
                        <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1">
                            {missing.map((m) => (
                                <li key={m}>{m}</li>
                            ))}
                        </ul>
                        <div className="flex gap-2 pt-2">
                            <Button variant="outline" onClick={() => router.push(`/project-pipeline/${dealId}`)}>
                                Back to deal
                            </Button>
                            <Button variant="ghost" onClick={() => router.push('/estimation')}>
                                Open Estimation
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-5xl space-y-4">
            <div className="flex items-start gap-3">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => router.push(`/project-pipeline/${dealId}`)}
                    aria-label="Back to deal"
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Link href="/project-pipeline" className="hover:text-slate-900 hover:underline">
                            Project Pipeline
                        </Link>
                        <span>/</span>
                        <Link href={`/project-pipeline/${dealId}`} className="hover:text-slate-900 hover:underline">
                            {deal.name}
                        </Link>
                        <span>/</span>
                        <span>Contract draft</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2 mt-0.5">
                        <FileText className="h-6 w-6 text-indigo-600" />
                        New contract draft
                    </h1>
                    <p className="text-sm text-slate-600 mt-1">
                        AI-generates an SES contract from the deal&apos;s Requirement Description
                        and Estimation handoff. The deal is already at rank A; this drafts the
                        contract you&apos;ll send to the customer for signature.
                    </p>
                </div>
            </div>

            <ContractDraftWizard deal={deal} />
        </div>
    );
}
