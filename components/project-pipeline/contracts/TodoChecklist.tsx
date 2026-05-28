'use client';

import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RenderedSection } from '@/lib/queries/contractDrafts';

interface TodoItem {
    sectionKey: string;
    sectionTitle: string;
    text: string;
}

function extractTodos(sections: ReadonlyArray<RenderedSection>): TodoItem[] {
    const items: TodoItem[] = [];
    for (const section of sections) {
        const matches = section.rendered.matchAll(/\{\{TODO:?\s*([^}]*)\}\}/g);
        for (const m of matches) {
            items.push({
                sectionKey: section.key,
                sectionTitle: section.title,
                text: (m[1] ?? '').trim(),
            });
        }
    }
    return items;
}

export function sectionAnchorId(sectionKey: string): string {
    return `contract-section-${sectionKey}`;
}

interface TodoChecklistProps {
    sections: ReadonlyArray<RenderedSection>;
}

export function TodoChecklist({ sections }: Readonly<TodoChecklistProps>) {
    const todos = extractTodos(sections);
    if (todos.length === 0) return null;

    const handleJump = (sectionKey: string) => {
        const el = document.getElementById(sectionAnchorId(sectionKey));
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const textarea = el.querySelector('textarea');
        if (textarea instanceof HTMLTextAreaElement) {
            // Focus once scroll settles so the user lands ready to edit.
            window.setTimeout(() => textarea.focus({ preventScroll: true }), 350);
        }
    };

    return (
        <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {todos.length} item{todos.length === 1 ? '' : 's'} to resolve before sending
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                <ul className="space-y-1">
                    {todos.map((t, i) => (
                        <li key={`${t.sectionKey}-${i}`}>
                            <button
                                type="button"
                                onClick={() => handleJump(t.sectionKey)}
                                className="w-full text-left flex items-start gap-2 rounded px-2 py-1.5 hover:bg-amber-100/70 text-sm text-amber-900 group"
                            >
                                <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-amber-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                                <span className="min-w-0 flex-1">
                                    <span className="font-medium">{t.sectionTitle}</span>
                                    {t.text && (
                                        <span className="text-amber-800/80">: {t.text}</span>
                                    )}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}
