'use client';

import { useEffect, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, Loader2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { normalizeError } from '@/lib/errorHandler';

/**
 * Renders the rendered contract draft PDF inline so the salesperson can
 * preview the actual customer-facing document before sending. The PDF is
 * fetched as a blob (so the Bearer token from lib/api attaches) and
 * displayed in an iframe via an object URL.
 *
 * The backend endpoint reuses the per-draft+version PDF cache, which
 * invalidates on section edit/regenerate — so this preview always
 * reflects the latest edits.
 */
export function PdfPreviewDialog({
    open,
    onOpenChange,
    draftId,
    title = 'Contract preview',
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    draftId: string;
    title?: string;
}) {
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    // Track the URL we created so we can revoke it on unmount/close
    // without race conditions if open toggles fast.
    const activeUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!open) {
            // Cleanup on close: revoke the object URL to free memory.
            if (activeUrlRef.current) {
                URL.revokeObjectURL(activeUrlRef.current);
                activeUrlRef.current = null;
            }
            setObjectUrl(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        api.get(`/contract-drafts/${draftId}/preview-pdf`, { responseType: 'blob' })
            .then((response) => {
                if (cancelled) return;
                const blob = response.data as Blob;
                const url = URL.createObjectURL(blob);
                activeUrlRef.current = url;
                setObjectUrl(url);
            })
            .catch((err) => {
                if (cancelled) return;
                const normalized = normalizeError(err);
                toast.error(normalized.message);
                onOpenChange(false);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open, draftId, onOpenChange]);

    // Always revoke on unmount.
    useEffect(() => {
        return () => {
            if (activeUrlRef.current) {
                URL.revokeObjectURL(activeUrlRef.current);
                activeUrlRef.current = null;
            }
        };
    }, []);

    const handleDownload = () => {
        if (!objectUrl) return;
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const handleOpenInTab = () => {
        if (!objectUrl) return;
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:max-w-300 h-[92vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b flex flex-row items-start justify-between gap-4 shrink-0">
                    <div>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <FileText className="h-4 w-4 text-indigo-600" />
                            {title}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Live preview of the contract PDF the customer will receive. Reflects
                            current edits — close, edit, and reopen to see updates.
                        </DialogDescription>
                    </div>
                    <div className="flex gap-2 shrink-0 mr-8">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownload}
                            disabled={!objectUrl}
                            className="gap-1.5"
                        >
                            <Download className="h-3.5 w-3.5" /> Download
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleOpenInTab}
                            disabled={!objectUrl}
                            className="gap-1.5"
                        >
                            <ExternalLink className="h-3.5 w-3.5" /> New tab
                        </Button>
                    </div>
                </DialogHeader>
                <div className="flex-1 bg-slate-100 min-h-0">
                    {loading && (
                        <div className="h-full flex items-center justify-center text-sm text-slate-500 gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Rendering PDF…
                        </div>
                    )}
                    {!loading && objectUrl && (
                        <iframe
                            src={objectUrl}
                            className="w-full h-full border-0"
                            title="Contract PDF preview"
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
