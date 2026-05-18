'use client';

import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Mail, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { useSendEstimationXlsx } from '@/lib/queries/estimationVersions';
import { normalizeError } from '@/lib/errorHandler';
import type { Deal } from '@/types/business';

/**
 * Post-confirm prompt (spec ④.G option C — auto-prompt, manual confirm).
 * Opens automatically after the user clicks "Confirm contract terms" in
 * ContractReadyDialog. Customer email defaults to deal.contact_email so
 * the happy path is one click; Skip lets the user defer the send.
 *
 * Re-opening this dialog later (e.g. to resend) is supported — same
 * endpoint just overwrites the version's sent_at timestamp.
 */
export function SendEstimateDialog({
    open,
    onOpenChange,
    deal,
    versionId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    deal: Deal;
    versionId: string | null;
}) {
    const send = useSendEstimationXlsx();

    const [toEmail, setToEmail] = useState('');
    const [message, setMessage] = useState('');

    // Default the recipient to the deal's contact email each time the
    // dialog opens. Reset the personal message — likely different per send.
    useEffect(() => {
        if (open) {
            setToEmail(deal.contactEmail ?? '');
            setMessage('');
        }
    }, [open, deal.contactEmail]);

    const handleSend = async () => {
        if (!versionId) {
            toast.error('No saved estimation version to send. Save the estimate first.');
            return;
        }
        const trimmedEmail = toEmail.trim();
        if (!trimmedEmail) {
            toast.error('Please enter the customer email address.');
            return;
        }
        try {
            await send.mutateAsync({
                versionId,
                toEmail: trimmedEmail,
                message: message.trim() || null,
            });
            toast.success(`Estimate emailed to ${trimmedEmail}.`);
            onOpenChange(false);
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(normalized.message || 'Could not send the estimate.');
        }
    };

    const handleSkip = () => {
        // No regret — user can still re-open this dialog or use the
        // "Send estimate" affordance on the deal detail page later.
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-indigo-600" />
                        Send estimate to customer?
                    </DialogTitle>
                    <DialogDescription>
                        Contract terms confirmed. The Estimate Doc (XLSX) is ready to email to the
                        customer. Send now, or skip and send later.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="send-estimate-to">Send to</Label>
                        <Input
                            id="send-estimate-to"
                            type="email"
                            value={toEmail}
                            onChange={(e) => setToEmail(e.target.value)}
                            placeholder="customer@example.com"
                        />
                        <p className="text-xs text-slate-500">
                            Defaulted to the deal&apos;s primary contact. Override here if needed.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="send-estimate-message">Personal note (optional)</Label>
                        <Textarea
                            id="send-estimate-message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Looking forward to hearing your feedback…"
                            rows={3}
                            maxLength={2000}
                        />
                    </div>

                    {!versionId && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                            No saved estimation version found for this deal. Save the estimate first
                            (the &quot;Save version&quot; button on the Estimation page), then re-open
                            this dialog.
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleSkip} disabled={send.isPending}>
                        Skip for now
                    </Button>
                    <Button onClick={handleSend} disabled={send.isPending || !versionId}>
                        {send.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                            </>
                        ) : (
                            'Send estimate'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
