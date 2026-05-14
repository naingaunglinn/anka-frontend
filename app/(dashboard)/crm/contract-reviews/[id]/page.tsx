'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, FileText, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useContractDocument, useReanalyzeContractDocument } from '@/lib/queries/contractDocuments';
import { AnalysisResultCard } from '@/components/crm/AnalysisResultCard';
import { useTenantCurrency } from '@/hooks/useTenantCurrency';
import { formatMoney } from '@/lib/currency';
import { useDealDetail } from '@/lib/queries/deals';
import { usePermission } from '@/hooks/usePermission';
import { normalizeError } from '@/lib/errorHandler';

/**
 * Deep review surface — full-page version of the AnalysisResultCard with
 * a deal-context side panel so reviewers can reconcile the contract's
 * terms against what the deal expected (budget, timeline, contact).
 *
 * Routed at /crm/contract-reviews/[id]. Linked from the queue page and from
 * the slim summary chip on the deal-detail uploader.
 */
export default function ContractReviewDeepPage() {
    const params = useParams();
    const router = useRouter();
    const docId = params.id as string;
    const currency = useTenantCurrency();

    const { data: doc, isLoading, error } = useContractDocument(docId);
    const reanalyze = useReanalyzeContractDocument();
    const { allowed: canManage } = usePermission('manage_crm');
    // Deal detail loaded only after we know the deal_id from the doc.
    // useDealDetail accepts an empty string and short-circuits with
    // enabled=false; we pass undefined-safe value here.
    const dealQuery = useDealDetail(doc?.deal?.id ?? doc?.deal_id ?? '');
    const deal = dealQuery.data;

    if (isLoading) {
        return (
            <div className="container mx-auto p-6 max-w-6xl">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading contract review…
                </div>
            </div>
        );
    }

    if (error || !doc) {
        return (
            <div className="container mx-auto p-6 max-w-6xl">
                <Card className="border-red-200 bg-red-50/30">
                    <CardContent className="p-6">
                        <p className="text-sm text-red-700">
                            Couldn&apos;t load this contract review. It may have been deleted or you may not have access.
                        </p>
                        <Button variant="outline" className="mt-3" onClick={() => router.push('/crm/contract-reviews')}>
                            ← Back to reviews
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const dealId = doc.deal?.id ?? doc.deal_id;

    return (
        <div className="container mx-auto p-6 max-w-7xl space-y-4">
            {/* Header: breadcrumb + back link */}
            <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => router.push('/crm/contract-reviews')} aria-label="Back">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Link href="/crm/contract-reviews" className="hover:text-slate-900 hover:underline">
                            Contract Reviews
                        </Link>
                        <span>/</span>
                        <span className="truncate">{doc.original_filename}</span>
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5 flex items-center gap-2">
                        <FileText className="h-5 w-5 text-indigo-600 shrink-0" />
                        <span className="truncate">{doc.original_filename}</span>
                    </h1>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {/* Retry analysis: show when the verdict came from the
                        keyword fallback (Claude was unreachable) OR when
                        text extraction failed entirely. One click re-runs
                        the analyser against the existing file on disk —
                        no re-upload required. Gated by manage_crm because
                        success can auto-fire win_deal(). */}
                    {canManage && (doc.analysis_result?.model === 'keyword-fallback' || doc.analysis_status === 'failed') && (
                        <Button
                            type="button"
                            variant="default"
                            size="sm"
                            className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                            disabled={reanalyze.isPending}
                            onClick={async () => {
                                try {
                                    const result = await reanalyze.mutateAsync(doc.id);
                                    if (result.auto_won && result.contract?.id) {
                                        toast.success('Contract approved — deal moved to Won (S).');
                                        router.push(`/contracts/${result.contract.id}`);
                                        return;
                                    }
                                    const status = result.document.analysis_status;
                                    if (status === 'approved') toast.success('Re-analysis complete — approved.');
                                    else if (status === 'rejected') toast('Re-analysis complete — see details.');
                                    else if (status === 'failed') toast.error('Re-analysis failed — see details.');
                                    else toast.success('Re-analysis complete.');
                                } catch (err) {
                                    toast.error(normalizeError(err).message);
                                }
                            }}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${reanalyze.isPending ? 'animate-spin' : ''}`} />
                            {reanalyze.isPending ? 'Re-analysing…' : 'Retry analysis'}
                        </Button>
                    )}
                    {dealId && (
                        <Link
                            href={`/crm/${dealId}`}
                            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                            Open deal <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                {/* Main panel: the rich verdict */}
                <div>
                    <AnalysisResultCard document={doc} />
                </div>

                {/* Side panel: deal context for reconciliation. The deal's
                    expected numbers shown next to the analysis lets the
                    reviewer spot mismatches at a glance. */}
                <aside className="space-y-3">
                    {doc.deal && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Deal Context</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div>
                                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Deal</div>
                                    <Link
                                        href={`/crm/${doc.deal.id}`}
                                        className="text-slate-900 hover:text-indigo-600 hover:underline font-medium"
                                    >
                                        {doc.deal.name}
                                    </Link>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Client</div>
                                    <div className="text-slate-900">{doc.deal.client}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Stage</div>
                                    <Badge variant="outline" className="capitalize">{doc.deal.status}</Badge>
                                </div>
                                {deal && (
                                    <>
                                        {deal.clientBudget != null && (
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wide text-slate-500">Expected Budget</div>
                                                <div className="text-slate-900 font-medium">
                                                    {formatMoney(deal.clientBudget, currency)}
                                                </div>
                                            </div>
                                        )}
                                        {deal.timelineMonths != null && (
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wide text-slate-500">Expected Timeline</div>
                                                <div className="text-slate-900">{deal.timelineMonths} mo</div>
                                            </div>
                                        )}
                                        {deal.contactName && (
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wide text-slate-500">Contact</div>
                                                <div className="text-slate-900 text-xs">{deal.contactName}</div>
                                                {deal.contactEmail && (
                                                    <div className="text-slate-500 text-xs">{deal.contactEmail}</div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <Card className="bg-slate-50 border-slate-200">
                        <CardContent className="p-3 text-xs text-slate-600">
                            <p className="font-medium text-slate-700 mb-1">Reviewer tip</p>
                            <p>
                                Compare the contract&apos;s actual terms (left panel) against the deal&apos;s expected
                                numbers above. Discrepancies on price, timeline, or scope are common reasons to
                                renegotiate before approving.
                            </p>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
