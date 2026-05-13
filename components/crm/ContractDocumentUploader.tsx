'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, UploadCloud, Loader2, CheckCircle2, XCircle, AlertTriangle, Trash2 } from 'lucide-react';
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
                            <li key={doc.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-2 min-w-0">
                                        {statusIcon(doc.analysis_status)}
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">{doc.original_filename}</p>
                                            <p className="text-xs text-[#8a8a8a]">
                                                {doc.extension.toUpperCase()} · {formatBytes(doc.size_bytes)}
                                                {doc.analyzed_at ? ` · ${new Date(doc.analyzed_at).toLocaleString()}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {statusBadge(doc.analysis_status)}
                                        {canManage && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => remove.mutate(doc.id)}
                                                disabled={remove.isPending}
                                                title="Delete document"
                                            >
                                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {doc.analysis_result && (
                                    <div className="text-xs text-[#4a4a4a] space-y-1 bg-slate-50 rounded p-2">
                                        {doc.analysis_result.reasoning && (
                                            <p>{doc.analysis_result.reasoning}</p>
                                        )}
                                        {doc.analysis_result.error && (
                                            <p className="text-red-600">{doc.analysis_result.error}</p>
                                        )}
                                        {doc.analysis_result.suggestion && (
                                            <p className="text-[#8a8a8a] italic">{doc.analysis_result.suggestion}</p>
                                        )}
                                        {Array.isArray(doc.analysis_result.missing_fields)
                                            && doc.analysis_result.missing_fields.length > 0 && (
                                            <p>
                                                <span className="font-semibold">Missing:</span>{' '}
                                                {doc.analysis_result.missing_fields.join(', ')}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
