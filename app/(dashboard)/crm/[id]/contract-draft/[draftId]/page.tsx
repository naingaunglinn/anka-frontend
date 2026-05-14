'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDealDetail } from '@/lib/queries/deals';
import { useContractDraft } from '@/lib/queries/contractDrafts';
import { usePermission } from '@/hooks/usePermission';
import { ContractDraftWizard } from '@/components/project-pipeline/contracts/ContractDraftWizard';
import { DraftStatusChip } from '@/components/project-pipeline/contracts/DraftStatusChip';

/**
 * View / edit an existing contract draft. Routes to the same wizard the
 * /new page uses, but starts on the edit step with the draft pre-loaded.
 * Read-only when the draft is signed or superseded.
 */
export default function ContractDraftDetailPage() {
    const params = useParams();
    const router = useRouter();
    const dealId = params.id as string;
    const draftId = params.draftId as string;

    const { allowed: canManage } = usePermission('manage_crm');
    const dealQuery = useDealDetail(dealId);
    const draftQuery = useContractDraft(draftId);

    if (dealQuery.isLoading || draftQuery.isLoading) {
        return (
            <div className="container mx-auto p-6 max-w-6xl">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading draft…
                </div>
            </div>
        );
    }

    if (dealQuery.error || draftQuery.error || !dealQuery.data || !draftQuery.data) {
        return (
            <div className="container mx-auto p-6 max-w-6xl">
                <Card className="border-red-200 bg-red-50/30">
                    <CardContent className="p-6">
                        <p className="text-sm text-red-700">
                            Couldn&apos;t load this contract draft. It may have been deleted or
                            you may not have access.
                        </p>
                        <Button
                            variant="outline"
                            className="mt-3"
                            onClick={() => router.push(`/crm/${dealId}`)}
                        >
                            Back to deal
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const deal = dealQuery.data;
    const draft = draftQuery.data;

    return (
        <div className="container mx-auto p-6 max-w-5xl space-y-4">
            <div className="flex items-start gap-3">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => router.push(`/crm/${dealId}`)}
                    aria-label="Back to deal"
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Link href="/crm" className="hover:text-slate-900 hover:underline">
                            CRM &amp; Pipeline
                        </Link>
                        <span>/</span>
                        <Link href={`/crm/${dealId}`} className="hover:text-slate-900 hover:underline">
                            {deal.name}
                        </Link>
                        <span>/</span>
                        <span>Draft v{draft.version}</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2 mt-0.5">
                        <FileText className="h-6 w-6 text-indigo-600" />
                        Contract draft
                        <DraftStatusChip status={draft.status} />
                    </h1>
                    {draft.template && (
                        <p className="text-sm text-slate-600 mt-1">
                            {draft.template.name} · {draft.todo_count} TODO
                            {draft.todo_count === 1 ? '' : 's'} unresolved
                        </p>
                    )}
                </div>
            </div>

            {!canManage && (
                <Card className="border-amber-200 bg-amber-50/30">
                    <CardContent className="p-4 text-sm text-amber-900">
                        You can view this draft but only managers can edit, regenerate, send, or mark it signed.
                    </CardContent>
                </Card>
            )}

            <ContractDraftWizard deal={deal} initialDraft={draft} />
        </div>
    );
}
