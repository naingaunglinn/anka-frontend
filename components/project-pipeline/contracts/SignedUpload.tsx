'use client';

import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileCheck2, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — matches backend validation

/**
 * Counter-signed PDF upload form. Hitting submit here fires the
 * mark-signed mutation which transitions the deal A → S via win_deal().
 * Component only owns the file picker + size guard; the parent owns
 * the mutation hook + toast/redirect handling.
 */
export function SignedUpload({
    onSubmit,
    isSubmitting = false,
}: {
    onSubmit: (file: File) => Promise<void> | void;
    isSubmitting?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [file, setFile] = useState<File | null>(null);

    function pick(f: File | null) {
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

    return (
        <Card className="border-emerald-200 bg-emerald-50/20">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-emerald-600" />
                    Mark as signed
                </CardTitle>
                <CardDescription className="text-xs">
                    Upload the counter-signed PDF. The deal will move to <strong>S — Won</strong>{' '}
                    automatically and the contract record will be created.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => inputRef.current?.click()}
                        disabled={isSubmitting}
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
                <Button
                    type="button"
                    onClick={() => file && onSubmit(file)}
                    disabled={!file || isSubmitting}
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
