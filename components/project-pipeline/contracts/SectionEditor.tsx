'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { RenderedSection } from '@/lib/queries/contractDrafts';
import { sectionAnchorId } from './TodoChecklist';

/**
 * One section's editor card. Shows title + status chips + a textarea
 * pre-filled with the rendered content. Operator can hand-edit the
 * content (debounced save) or hit "Regenerate" to re-run AI for this
 * section only. Unresolved placeholder markers are surfaced in a header
 * chip so the operator knows what still needs filling in.
 *
 * Section-level edit/regenerate is preferred over a global "edit
 * everything" textarea because most edits are scoped to one section
 * and regenerate per-section costs ~5s vs the full draft's 60-90s.
 */

interface SectionEditorProps {
    section: RenderedSection;
    onSave: (content: string) => void;
    onRegenerate?: () => void;
    canRegenerate: boolean;
    isSaving?: boolean;
    isRegenerating?: boolean;
    readOnly?: boolean;
}

export function SectionEditor({
    section,
    onSave,
    onRegenerate,
    canRegenerate,
    isSaving = false,
    isRegenerating = false,
    readOnly = false,
}: Readonly<SectionEditorProps>) {
    const [content, setContent] = useState(section.rendered);
    // Mirror of section.rendered to detect external resets (regenerate / save
    // round-trip). React docs' "deriving state from props" pattern: compare
    // during render and reset both at once. Avoids the useEffect → setState
    // anti-pattern flagged by react-hooks/set-state-in-effect.
    const [lastRendered, setLastRendered] = useState(section.rendered);
    const [dirty, setDirty] = useState(false);
    if (section.rendered !== lastRendered) {
        setLastRendered(section.rendered);
        setContent(section.rendered);
        setDirty(false);
    }

    const todoCount = (content.match(/\{\{TODO/g) ?? []).length;

    return (
        <Card
            id={sectionAnchorId(section.key)}
            className={`scroll-mt-4 ${section.has_todo && !dirty ? 'border-amber-200' : 'border-slate-200'}`}
        >
            <CardHeader className="pb-3 flex flex-row items-start gap-3 justify-between">
                <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                        <span>{section.title}</span>
                        <Badge variant="outline" className="text-[10px] font-normal capitalize">
                            {section.type.replaceAll('_', ' ')}
                        </Badge>
                        {todoCount > 0 ? (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {todoCount} TODO{todoCount === 1 ? '' : 's'}
                            </Badge>
                        ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Complete
                            </Badge>
                        )}
                        {section.user_edited && (
                            <Badge variant="secondary" className="text-[10px]">
                                Edited
                            </Badge>
                        )}
                    </CardTitle>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {dirty && !readOnly && (
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => onSave(content)}
                            disabled={isSaving}
                            className="bg-[var(--color-ai-600)] hover:bg-[var(--color-ai-700)]"
                        >
                            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                        </Button>
                    )}
                    {canRegenerate && onRegenerate && !readOnly && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onRegenerate}
                            disabled={isRegenerating}
                            title="Re-run AI for this section with the current wizard answers"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                            {isRegenerating ? '' : ' Regenerate'}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <Textarea
                    value={content}
                    readOnly={readOnly}
                    onChange={(e) => {
                        setContent(e.target.value);
                        setDirty(e.target.value !== section.rendered);
                    }}
                    rows={Math.min(20, Math.max(4, content.split('\n').length + 1))}
                    className={`font-mono text-xs leading-relaxed ${
                        section.has_todo && !dirty ? 'bg-amber-50/30' : 'bg-white'
                    }`}
                />
                {todoCount > 0 && (
                    <p className="text-[11px] text-amber-700 mt-2">
                        Resolve <code>{'{{TODO: ...}}'}</code> markers before sending to the customer.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
