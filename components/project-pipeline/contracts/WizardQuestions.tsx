'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { HelpCircle } from 'lucide-react';
import type { TemplateSection, WizardQuestion } from '@/lib/queries/contractDrafts';

/**
 * Renders the structured Path C questions for every section in a template
 * that has them. Section sub-headers group related questions so the
 * wizard step 1 reads as a coherent intake form, not a wall of inputs.
 */
export function WizardQuestions({
    sections,
    answers,
    onChange,
}: {
    sections: TemplateSection[];
    answers: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}) {
    const sectionsWithQuestions = sections.filter(
        (s) => Array.isArray(s.wizard_questions) && s.wizard_questions.length > 0,
    );

    if (sectionsWithQuestions.length === 0) {
        return (
            <Card className="border-slate-200 bg-slate-50/40">
                <CardContent className="p-4 text-sm text-slate-600">
                    This template has no structured questions — the AI fills everything from the
                    deal&apos;s Requirement Description.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-5">
            {sectionsWithQuestions.map((section) => (
                <div key={section.key}>
                    <h4 className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                        {section.title}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(section.wizard_questions ?? []).map((q) => (
                            <QuestionField
                                key={q.key}
                                question={q}
                                value={answers[q.key]}
                                onChange={(v) => onChange(q.key, v)}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function QuestionField({
    question,
    value,
    onChange,
}: {
    question: WizardQuestion;
    value: unknown;
    onChange: (value: unknown) => void;
}) {
    const valueOrDefault = value ?? question.default ?? '';

    const labelEl = (
        <Label htmlFor={question.key} className="text-xs text-slate-700">
            {question.label}
            {question.required && <span className="text-red-500 ml-1">*</span>}
            {question.help && (
                <span title={question.help} className="ml-1 inline-flex">
                    <HelpCircle className="inline h-3 w-3 text-slate-400" />
                </span>
            )}
        </Label>
    );

    if (question.type === 'select') {
        return (
            <div className="space-y-1">
                {labelEl}
                <Select value={String(valueOrDefault)} onValueChange={onChange}>
                    <SelectTrigger className="bg-white">
                        <SelectValue placeholder={`Choose ${question.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                        {(question.options ?? []).map((opt) => (
                            <SelectItem key={opt} value={opt}>
                                {opt}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        );
    }

    if (question.type === 'multiselect') {
        // Lightweight v1: comma-separated text. Full multiselect UI deferred
        // because none of the seeded questions absolutely need it; the AI
        // accepts whatever string we send.
        return (
            <div className="space-y-1">
                {labelEl}
                <Input
                    id={question.key}
                    type="text"
                    value={Array.isArray(value) ? value.join(', ') : String(valueOrDefault)}
                    onChange={(e) =>
                        onChange(
                            e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                        )
                    }
                    placeholder={(question.options ?? []).join(', ')}
                    className="bg-white"
                />
                <p className="text-[10px] text-slate-400">Comma-separated. Options: {(question.options ?? []).join(', ')}</p>
            </div>
        );
    }

    if (question.type === 'date') {
        return (
            <div className="space-y-1">
                {labelEl}
                <Input
                    id={question.key}
                    type="date"
                    value={String(valueOrDefault)}
                    onChange={(e) => onChange(e.target.value)}
                    className="bg-white"
                />
            </div>
        );
    }

    if (question.type === 'time') {
        // Use text since the seeded values are formatted strings like "09:00 AM".
        return (
            <div className="space-y-1">
                {labelEl}
                <Input
                    id={question.key}
                    type="text"
                    value={String(valueOrDefault)}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={question.placeholder ?? '09:00 AM'}
                    className="bg-white"
                />
            </div>
        );
    }

    if (question.type === 'number') {
        return (
            <div className="space-y-1">
                {labelEl}
                <Input
                    id={question.key}
                    type="number"
                    value={String(valueOrDefault)}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange(v === '' ? '' : Number(v));
                    }}
                    placeholder={question.placeholder}
                    className="bg-white"
                />
            </div>
        );
    }

    return (
        <div className="space-y-1">
            {labelEl}
            <Input
                id={question.key}
                type="text"
                value={String(valueOrDefault)}
                onChange={(e) => onChange(e.target.value)}
                placeholder={question.placeholder}
                className="bg-white"
            />
        </div>
    );
}
