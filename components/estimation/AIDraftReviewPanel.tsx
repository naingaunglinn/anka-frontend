'use client';

import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AIEstimationDraft } from '@/lib/queries/estimationVersions';

interface Props {
    draft: AIEstimationDraft;
    onDiscard: () => void;
}

const confidenceStyle: Record<string, { bg: string; fg: string; label: string }> = {
    high: { bg: 'bg-emerald-100', fg: 'text-emerald-700', label: 'High confidence' },
    medium: { bg: 'bg-amber-100', fg: 'text-amber-700', label: 'Medium confidence' },
    low: { bg: 'bg-rose-100', fg: 'text-rose-700', label: 'Low confidence' },
};

export function AIDraftReviewPanel({ draft, onDiscard }: Props) {
    const cs = confidenceStyle[draft.confidence] ?? confidenceStyle.medium;

    return (
        <div className="border-t bg-violet-50 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 mt-0.5 text-violet-600" />
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-violet-800 uppercase tracking-wider">
                                AI-generated draft
                            </p>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cs.bg} ${cs.fg}`}>
                                {cs.label}
                            </span>
                            <span className="text-[10px] text-violet-700/70">
                                {draft.sheet2Features.length} features · {draft.sheet5TeamStack.length} roles
                            </span>
                        </div>
                        {draft.reasoning && (
                            <p className="text-xs text-violet-900/80 max-w-2xl leading-relaxed">{draft.reasoning}</p>
                        )}
                        <p className="text-[10px] text-violet-700/60 italic">
                            Review and edit below, then Save to persist as a new version.
                        </p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-violet-700 hover:text-violet-900"
                    onClick={onDiscard}
                >
                    <X className="h-3 w-3" /> Discard AI draft
                </Button>
            </div>
        </div>
    );
}
