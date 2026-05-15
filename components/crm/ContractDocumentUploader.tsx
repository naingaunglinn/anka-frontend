'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, UploadCloud, Loader2, CheckCircle2, XCircle, AlertTriangle, Trash2, ChevronRight, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useContractDocuments, useContractDocumentMutations } from '@/lib/queries/contractDocuments';
import type { ContractDocument } from '@/lib/queries/contractDocuments';
import { normalizeError } from '@/lib/errorHandler';

// xlsx + pptx were dropped because phpoffice/phpspreadsheet has unresolved
// security advisories on every release; clients can re-export those as PDF
// or DOCX. Mirror this list with DealContractDocumentController::ALLOWED_EXT.
const ALLOWED_EXT = ['pdf', 'docx', 'txt'] as const;
const MAX_BYTES = 25 * 1024 * 1024;

function statusBadge(status: ContractDocument['analysis_status']) {
    switch (status) {
        case 'approved':
            return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Approved</Badge>;
        case 'rejected':
            return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Rejected</Badge>;
        case 'failed':
            return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Failed</Badge>;
        case 'analyzing':
            return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Analyzing…</Badge>;
        default:
            return <Badge variant="secondary">Pending</Badge>;
    }
}

function statusIcon(status: ContractDocument['analysis_status']) {
    const cls = 'h-4 w-4';
    if (status === 'approved') return <CheckCircle2 className={`${cls} text-emerald-600`} />;
    if (status === 'rejected') return <AlertTriangle className={`${cls} text-amber-600`} />;
    if (status === 'failed') return <XCircle className={`${cls} text-red-600`} />;
    if (status === 'analyzing') return <Loader2 className={`${cls} text-blue-600 animate-spin`} />;
    return <FileText className={`${cls} text-slate-500`} />;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
    dealId: string;
    canManage: boolean;
    /** Hide the uploader when the deal isn't in the A-rank stage. */
    enabled: boolean;
}

/**
 * Contract document upload + AI analysis panel. Only meaningful while the
 * deal is in the negotiation (A-rank) stage. When a doc is approved by the
 * analyser the backend auto-fires win_deal() and we route to the new
 * contract's detail page.
 */
export function ContractDocumentUploader({ dealId, canManage, enabled }: Props) {
    const router = useRouter();
    const docsQuery = useContractDocuments(dealId);
    const { upload, remove } = useContractDocumentMutations(dealId);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const docs = docsQuery.data ?? [];
    const hasApproved = docs.some(d => d.analysis_status === 'approved');

    const handleFile = async (file: File) => {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!ALLOWED_EXT.includes(ext as typeof ALLOWED_EXT[number])) {
            toast.error(`Unsupported file type. Allowed: ${ALLOWED_EXT.join(', ')}.`);
            return;
        }
        if (file.size > MAX_BYTES) {
            toast.error('File is larger than 25 MB.');
            return;
        }

        try {
            const result = await upload.mutateAsync(file);
            if (result.auto_won && result.contract?.id) {
                toast.success('Contract approved — deal moved to Won (S).');
                router.push(`/contracts/${result.contract.id}`);
                return;
            }
            if (result.document.analysis_status === 'rejected') {
                toast.error('Document rejected. Missing required fields — see details.');
            } else if (result.document.analysis_status === 'failed') {
                toast.error('Could not analyse this document. See details.');
            } else {
                toast.success('Document uploaded.');
            }
        } catch (err) {
            toast.error(normalizeError(err).message);
        }
    };

    if (!enabled) {
        return (
            <Card>
                <CardContent className="p-4 text-sm text-[#4a4a4a]">
                    Contract document uploads are only available while the deal is in the
                    <strong> A — Negotiation</strong> stage.
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardContent className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold">Contract Document (A → S gate)</h3>
                        <p className="text-xs text-[#4a4a4a] mt-0.5">
                            Upload the signed/approved contract. Claude verifies the required fields,
                            and an approval moves the deal straight to <strong>S — Won</strong>.
                        </p>
                    </div>
                    {hasApproved && (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 shrink-0">
                            Approved
                        </Badge>
                    )}
                </div>

                {canManage && (
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) void handleFile(file);
                        }}
                        className={`
                            border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
                            ${dragOver ? 'border-[#00a7f4] bg-[#00a7f4]/5' : 'border-slate-200 hover:border-slate-300'}
                            ${upload.isPending ? 'opacity-60 pointer-events-none' : ''}
                        `}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.docx,.txt"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleFile(file);
                                e.target.value = '';
                            }}
                        />
                        {upload.isPending ? (
                            <div className="flex flex-col items-center gap-2 text-sm text-[#4a4a4a]">
                                <Loader2 className="h-6 w-6 animate-spin text-[#00a7f4]" />
                                <span>Uploading and analysing…</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-sm text-[#4a4a4a]">
                                <UploadCloud className="h-6 w-6 text-slate-400" />
                                <span>
                                    Drag a contract here or <span className="text-[#00a7f4] font-medium">click to browse</span>
                                </span>
                                <span className="text-xs text-[#8a8a8a]">
                                    Accepted: PDF, DOCX, TXT · max 25 MB
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {docsQuery.isLoading && (
                    <div className="text-sm text-[#8a8a8a]">Loading documents…</div>
                )}

                {docs.length > 0 && (
                    <ul className="space-y-2">
                        {docs.map((doc) => (
                            <li key={doc.id}>
                                <ContractDocumentSummaryRow
                                    doc={doc}
                                    canManage={canManage}
                                    onDelete={() => remove.mutate(doc.id)}
                                    deleting={remove.isPending}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * Compact one-line summary used INSIDE the deal-detail uploader. The deep
 * verdict + per-field grades + dispute risks live on /crm/contract-reviews/[id]
 * — this row just gives the salesperson enough at-a-glance signal to know
 * whether to click through.
 */
function ContractDocumentSummaryRow({
    doc, canManage, onDelete, deleting,
}: {
    doc: ContractDocument;
    canManage: boolean;
    onDelete: () => void;
    deleting: boolean;
}) {
    const score = doc.overall_score ?? doc.analysis_result?.overall_score;
    const summary = doc.analysis_result?.executive_summary;
    const isMismatch = doc.analysis_result?.deal_match?.is_match === false;
    const criticalCount = doc.analysis_result?.critical_failures?.length ?? 0;

    const scoreColor =
        score == null ? 'text-slate-400' :
        score >= 80 ? 'text-emerald-600' :
        score >= 60 ? 'text-amber-600' :
                      'text-red-600';

    return (
        <div className={`rounded-lg border ${
            isMismatch ? 'border-red-300 bg-red-50/40' :
            doc.analysis_status === 'approved' ? 'border-emerald-200 bg-emerald-50/30' :
            doc.analysis_status === 'rejected' ? 'border-amber-200 bg-amber-50/30' :
            doc.analysis_status === 'failed'   ? 'border-red-200 bg-red-50/30' :
            'border-slate-200 bg-slate-50/40'
        } p-3`}>
            <div className="flex items-start gap-3">
                {statusIcon(doc.analysis_status)}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900 truncate max-w-[280px]">
                            {doc.original_filename}
                        </span>
                        {statusBadge(doc.analysis_status)}
                        {score != null && (
                            <span className={`text-xs font-semibold ${scoreColor}`}>
                                {score}/100
                            </span>
                        )}
                        {isMismatch && (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px] gap-1">
                                <AlertCircle className="h-2.5 w-2.5" /> wrong contract
                            </Badge>
                        )}
                        {!isMismatch && criticalCount > 0 && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">
                                {criticalCount} critical
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-[#8a8a8a] mt-0.5">
                        {doc.extension.toUpperCase()} · {formatBytes(doc.size_bytes)}
                        {doc.analyzed_at ? ` · analysed ${new Date(doc.analyzed_at).toLocaleString()}` : ''}
                    </p>
                    {summary && (
                        <p className="text-xs text-slate-700 mt-1.5 line-clamp-2">{summary}</p>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Link
                        href={`/crm/contract-reviews/${doc.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                        Open full review <ChevronRight className="h-3 w-3" />
                    </Link>
                    {canManage && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={onDelete}
                            disabled={deleting}
                            title="Delete document"
                        >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
