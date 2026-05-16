'use client';

import { ChevronRight } from 'lucide-react';

// ── Workflow status bar ───────────────────────────────────────────────────────
// Shared between /project-pipeline/[id] (Deal → Contract → Project flow for
// any rank) and /contracts/[id] (Contract stage onward, when the deal is
// already won). Visual styling is identical so the two pages feel like the
// same workflow, viewed from different anchors.

export interface WorkflowStep {
    label: string;
    detail: string;
    active: boolean;
    done: boolean;
}

export function WorkflowBar({ steps }: { steps: WorkflowStep[] }) {
    return (
        <div className="flex items-center gap-0 rounded-lg border border-slate-200 bg-white overflow-hidden">
            {steps.map((step, i) => (
                <div key={step.label} className="flex items-center flex-1">
                    <div className={`flex-1 px-4 py-3 ${step.done ? 'bg-emerald-50' : step.active ? 'bg-blue-50' : 'bg-slate-50'}`}>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${step.done ? 'text-emerald-700' : step.active ? 'text-blue-700' : 'text-slate-400'}`}>
                            {step.label}
                        </p>
                        <p className={`text-xs mt-0.5 ${step.done ? 'text-emerald-600' : step.active ? 'text-blue-600' : 'text-slate-400'}`}>
                            {step.detail}
                        </p>
                    </div>
                    {i < steps.length - 1 && (
                        <ChevronRight className={`h-4 w-4 flex-shrink-0 ${step.done ? 'text-emerald-400' : 'text-slate-300'}`} />
                    )}
                </div>
            ))}
        </div>
    );
}
