'use client';

import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, FileCheck2, Loader2, X, ShieldCheck, ShieldAlert, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useVerifySignedDraft, type VerifySignedResult } from '@/lib/queries/contractDrafts';
import { normalizeError, firstFieldError } from '@/lib/errorHandler';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — matches backend validation

/**
 * Three-step flow:
 *   1. Pick file
 *   2. Verify (AI checks: same contract? signature present?)
 *   3. Mark as signed → S (gated on verification pass OR explicit override)
 *
 * The verifier is read-only; it does not store the file or mutate the
 * draft. Only the final mark-signed mutation persists the signed PDF
 * and fires win_deal().
 */
export function SignedUpload({
    draftId,
    onSubmit,
    isSubmitting = false,
}: {
    draftId: string;
    onSubmit: (file: File) => Promise<void> | void;
    isSubmitting?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [verdict, setVerdict] = useState<VerifySignedResult | null>(null);
    const [override, setOverride] = useState(false);

    const verify = useVerifySignedDraft();

    function pick(f: File | null) {
        // New file → reset verdict + override.
        setVerdict(null);
        setOverride(false);
        if (!f) {
            setFile(null);
            return;
        }
        if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
            toast.error('Only PDF files are accepted.');
            return;
        }
        if (f.size > MAX_BYTES) {
            toast.error(`File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 25 MB.`);
            return;
        }
        setFile(f);
    }

    async function runVerify() {
        if (!file) return;
        try {
            const result = await verify.mutateAsync({ draftId, signedPdf: file });
            setVerdict(result);
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(firstFieldError(normalized) ?? normalized.message);
        }
    }

    const passed = verdict?.match === true && verdict?.signature === true;
    const canMarkSigned = !!file && !!verdict && (passed || override);

    return (
        <Card className="border-emerald-200 bg-emerald-50/20">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-emerald-600" />
                    Mark as signed
                </CardTitle>
                <CardDescription className="text-xs">
                    Upload the counter-signed PDF, run an AI check that it matches the contract
                    we sent and contains a customer signature, then submit. The deal will move to
                    {' '}<strong>S — Won</strong> and the contract record will be created.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* ── Step 1 · Pick file ─────────────────────────────────── */}
                <div className="flex items-center gap-3 flex-wrap">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => inputRef.current?.click()}
                        disabled={isSubmitting || verify.isPending}
                        className="bg-white"
                    >
                        <Upload className="h-3.5 w-3.5" />
                        {file ? 'Change file' : 'Choose PDF'}
                    </Button>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(e) => pick(e.target.files?.[0] ?? null)}
                    />
                    {file && (
                        <div className="flex items-center gap-2 text-xs text-slate-700 min-w-0">
                            <span className="truncate font-medium">{file.name}</span>
                            <span className="text-slate-400">({(file.size / 1024).toFixed(0)} KB)</span>
                            <button
                                type="button"
                                onClick={() => pick(null)}
                                className="text-slate-400 hover:text-red-600"
                                aria-label="Remove file"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Step 2 · Verify ────────────────────────────────────── */}
                {file && !verdict && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={runVerify}
                        disabled={verify.isPending || isSubmitting}
                        className="bg-white"
                    >
                        {verify.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                        )}
                        {verify.isPending ? 'Verifying (5–10s)…' : 'Verify signed PDF'}
                    </Button>
                )}

                {/* ── Verdict card ───────────────────────────────────────── */}
                {verdict && (
                    <div
                        className={`rounded-md border p-3 space-y-2 ${
                            passed
                                ? 'border-emerald-300 bg-emerald-50'
                                : 'border-amber-300 bg-amber-50'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            {passed ? (
                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            ) : (
                                <ShieldAlert className="h-4 w-4 text-amber-600" />
                            )}
                            <span className={`text-sm font-semibold ${passed ? 'text-emerald-800' : 'text-amber-800'}`}>
                                {passed ? 'Verification passed' : 'Verification failed'}
                            </span>
                        </div>
                        <ul className="text-xs space-y-1 ml-6 list-disc list-outside text-slate-700">
                            <li>
                                <strong>Matches the contract we sent:</strong>{' '}
                                {verdict.match ? <span className="text-emerald-700">yes</span>
                                              : <span className="text-amber-700">no</span>}
                            </li>
                            <li>
                                <strong>Customer signature present:</strong>{' '}
                                {verdict.signature ? <span className="text-emerald-700">yes</span>
                                                   : <span className="text-amber-700">no</span>}
                            </li>
                        </ul>
                        {verdict.notes && (
                            <p className="text-[11px] text-slate-600 italic ml-6">{verdict.notes}</p>
                        )}

                        {!passed && (
                            <div className="pt-2 border-t border-amber-200 flex items-start gap-2">
                                <input
                                    id="override-verify"
                                    type="checkbox"
                                    checked={override}
                                    onChange={(e) => setOverride(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                />
                                <Label htmlFor="override-verify" className="text-xs text-amber-900 leading-relaxed cursor-pointer">
                                    I have reviewed the PDF manually and confirm it&apos;s the correct
                                    counter-signed contract for this deal. Proceed anyway.
                                </Label>
                            </div>
                        )}

                        <div className="pt-2 flex gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => { setVerdict(null); setOverride(false); }}
                                disabled={isSubmitting}
                                className="text-xs"
                            >
                                Re-verify
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => pick(null)}
                                disabled={isSubmitting}
                                className="text-xs text-red-600 hover:text-red-700"
                            >
                                Choose different file
                            </Button>
                        </div>
                    </div>
                )}

                {/* ── Step 3 · Mark signed ───────────────────────────────── */}
                <Button
                    type="button"
                    onClick={() => file && onSubmit(file)}
                    disabled={!canMarkSigned || isSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-700"
                >
                    {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {isSubmitting ? 'Marking signed…' : 'Mark as signed → S'}
                </Button>
                <p className="text-[11px] text-slate-500">
                    PDF only, up to 25 MB. The signed file is stored alongside this draft for audit.
                </p>
            </CardContent>
        </Card>
    );
}
