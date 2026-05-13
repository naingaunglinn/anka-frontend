'use client';

import { useMemo, useState } from 'react';
import {
    CheckCircle2, XCircle, AlertTriangle, AlertCircle, ChevronDown, ChevronRight,
    FileText, Sparkles, TrendingUp, TrendingDown, Minus, Quote,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
    ContractDocument,
    ContractDocumentAnalysis,
    FieldGrade,
    FieldStatus,
    FieldSeverity,
    PaymentPattern,
} from '@/lib/queries/contractDocuments';

interface Props {
    document: ContractDocument;
}

const PAYMENT_PATTERN_LABEL: Record<PaymentPattern, string> = {
    monthly_recurring: 'Monthly recurring',
    milestone_based: 'Milestone-based',
    per_phase: 'Per-phase (SOW)',
    one_time: 'One-time payment',
    unknown: 'Pattern unclear',
};

const SEVERITY_LABEL: Record<FieldSeverity, string> = {
    critical: 'Critical',
    required: 'Required',
    recommended: 'Recommended',
};

function statusIcon(status: FieldStatus) {
    const cls = 'h-4 w-4 shrink-0';
    if (status === 'present') return <CheckCircle2 className={`${cls} text-emerald-600`} />;
    if (status === 'partial') return <AlertTriangle className={`${cls} text-amber-600`} />;
    if (status === 'not_applicable') return <Minus className={`${cls} text-slate-400`} />;
    return <XCircle className={`${cls} text-red-600`} />;
}

function statusChip(status: FieldStatus) {
    const map: Record<FieldStatus, string> = {
        present: 'bg-emerald-100 text-emerald-700',
        partial: 'bg-amber-100 text-amber-700',
        missing: 'bg-red-100 text-red-700',
        not_applicable: 'bg-slate-100 text-slate-600',
    };
    const label: Record<FieldStatus, string> = {
        present: 'Present',
        partial: 'Partial',
        missing: 'Missing',
        not_applicable: 'N/A',
    };
    return <Badge className={`${map[status]} hover:${map[status]} font-medium`}>{label[status]}</Badge>;
}

/**
 * Big score gauge with severity-tier colouring.
 *  80-100 emerald · 60-79 amber · 0-59 red
 */
function ScoreGauge({ score }: { score: number }) {
    const colour =
        score >= 80 ? 'text-emerald-600 border-emerald-200 bg-emerald-50' :
        score >= 60 ? 'text-amber-600 border-amber-200 bg-amber-50' :
                      'text-red-600 border-red-200 bg-red-50';
    return (
        <div className={`flex flex-col items-center justify-center rounded-lg border-2 ${colour} h-20 w-20 shrink-0`}>
            <div className="text-2xl font-bold leading-none">{score}</div>
            <div className="text-[10px] uppercase tracking-wide mt-0.5">/ 100</div>
        </div>
    );
}

function FieldGradeRow({ grade, defaultOpen = false }: { grade: FieldGrade; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    const hasDetail = !!(grade.evidence || grade.reasoning || grade.suggested_fix);

    return (
        <div className="border border-slate-200 rounded-md">
            <button
                type="button"
                onClick={() => hasDetail && setOpen(o => !o)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left ${
                    hasDetail ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
                }`}
            >
                <div className="pt-0.5">{statusIcon(grade.status)}</div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{grade.label}</span>
                        {statusChip(grade.status)}
                        <span className="text-xs text-slate-500">score {grade.score}</span>
                        {grade.evidence_location && (
                            <span className="text-[10px] text-slate-400 italic">· {grade.evidence_location}</span>
                        )}
                    </div>
                    {!open && grade.reasoning && (
                        <p className="text-xs text-slate-600 mt-1 line-clamp-1">{grade.reasoning}</p>
                    )}
                </div>
                {hasDetail && (
                    <div className="pt-0.5 text-slate-400">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                )}
            </button>

            {open && hasDetail && (
                <div className="px-3 pb-3 pl-10 space-y-2 border-t border-slate-100 pt-2">
                    {grade.reasoning && (
                        <p className="text-xs text-slate-700">{grade.reasoning}</p>
                    )}
                    {grade.evidence && (
                        <div className="flex gap-2 items-start text-xs bg-slate-50 border-l-2 border-slate-300 px-2 py-1.5 rounded">
                            <Quote className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                            <span className="italic text-slate-600">&ldquo;{grade.evidence}&rdquo;</span>
                        </div>
                    )}
                    {grade.suggested_fix && (
                        <div className="flex gap-2 items-start text-xs bg-blue-50 border-l-2 border-blue-300 px-2 py-1.5 rounded">
                            <Sparkles className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />
                            <span className="text-blue-900">{grade.suggested_fix}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Rich verdict card. Renders the full analysis (score gauge, executive
 * summary, diff banner, grouped field grades, dispute risks). Falls back
 * to a simple message for failure-path verdicts (text extraction broke).
 */
export function AnalysisResultCard({ document: doc }: Props) {
    const a = doc.analysis_result;
    const [showAll, setShowAll] = useState(false);

    // ── Failure path: extraction broke before grading even ran ──────────
    if (doc.analysis_status === 'failed' || (a && a.error)) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                <div className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <h4 className="text-sm font-semibold text-red-900">Analysis failed</h4>
                        <p className="text-sm text-red-800 mt-1">
                            {a?.error ?? 'Could not analyse this document.'}
                        </p>
                        {a?.suggestion && (
                            <p className="text-xs text-red-700 italic mt-1.5">{a.suggestion}</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Pending / analyzing: no verdict yet ──────────────────────────────
    if (!a || !a.field_grades || a.field_grades.length === 0) {
        return (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                    <FileText className="h-4 w-4" />
                    {doc.analysis_status === 'analyzing' ? 'Analysing…' : 'Pending analysis'}
                </div>
            </div>
        );
    }

    return <RichVerdict document={doc} analysis={a} showAll={showAll} onToggleAll={() => setShowAll(s => !s)} />;
}

function RichVerdict({
    document: doc, analysis: a, showAll, onToggleAll,
}: {
    document: ContractDocument;
    analysis: ContractDocumentAnalysis;
    showAll: boolean;
    onToggleAll: () => void;
}) {
    const grades = a.field_grades ?? [];

    // Group field grades by severity, missing/partial first within each tier.
    const groups = useMemo(() => {
        const bySeverity: Record<FieldSeverity, FieldGrade[]> = {
            critical: [], required: [], recommended: [],
        };
        for (const g of grades) bySeverity[g.severity]?.push(g);

        const sortFn = (a: FieldGrade, b: FieldGrade) => {
            const rank: Record<FieldStatus, number> = {
                missing: 0, partial: 1, present: 2, not_applicable: 3,
            };
            return rank[a.status] - rank[b.status];
        };
        for (const tier of Object.keys(bySeverity) as FieldSeverity[]) {
            bySeverity[tier].sort(sortFn);
        }
        return bySeverity;
    }, [grades]);

    const failing = grades.filter(g =>
        (g.severity === 'critical' || g.severity === 'required') &&
        (g.status === 'missing' || g.status === 'partial')
    );

    const approved = doc.analysis_status === 'approved';
    const score = a.overall_score ?? doc.overall_score ?? 0;
    const pattern = a.detected_payment_pattern ?? doc.detected_payment_pattern ?? 'unknown';
    const diff = a.diff_vs_previous;
    const mismatch = a.deal_match && a.deal_match.is_match === false ? a.deal_match : null;

    return (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            {/* ── Deal mismatch banner: appears ABOVE everything else when
                  Claude (or the heuristic fallback) decided this contract
                  isn't for the current deal. Hard-blocks approval — no
                  matter how complete the contract is, a wrong-customer
                  upload must never auto-fire win_deal(). ─────────────────── */}
            {mismatch && (
                <div className="px-4 py-3 bg-red-50 border-b-2 border-red-300">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-red-900">
                                Wrong contract uploaded — doesn&apos;t match this deal
                            </h4>
                            <p className="text-xs text-red-800 mt-1">
                                {mismatch.reasoning ?? 'The uploaded contract appears to be for a different customer or project.'}
                            </p>
                            {mismatch.deal_client && (
                                <p className="text-[11px] text-red-700 mt-1">
                                    <span className="font-medium">Deal expects:</span> {mismatch.deal_client}
                                    {mismatch.doc_parties.length > 0 && (
                                        <>
                                            {' · '}<span className="font-medium">Contract parties:</span>{' '}
                                            {mismatch.doc_parties.join(', ')}
                                        </>
                                    )}
                                </p>
                            )}
                            {mismatch.discrepancies.length > 0 && (
                                <ul className="mt-2 space-y-0.5">
                                    {mismatch.discrepancies.map((d, i) => (
                                        <li key={i} className="text-[11px] text-red-700 flex gap-1.5 items-start">
                                            <span className="shrink-0">✗</span>
                                            <span>{d}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <p className="text-[10px] text-red-600 italic mt-2">
                                Approval is blocked until the correct contract is uploaded.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Top bar: status + filename + score gauge ─────────────────── */}
            <div className={`px-4 py-3 flex items-start gap-3 ${
                approved ? 'bg-emerald-50/50 border-b border-emerald-100'
                         : 'bg-red-50/40 border-b border-red-100'
            }`}>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {approved
                            ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                            : <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />}
                        <span className="text-sm font-semibold text-slate-900 truncate">
                            {doc.original_filename}
                        </span>
                    </div>
                    <p className="text-xs text-slate-700 mt-1.5">
                        {approved
                            ? 'All critical and required fields are present. Deal moved to Won.'
                            : a.executive_summary ?? 'Cannot approve — see field details below.'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] bg-white">
                            {PAYMENT_PATTERN_LABEL[pattern]}
                        </Badge>
                        {a.critical_failures && a.critical_failures.length > 0 && (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">
                                {a.critical_failures.length} critical {a.critical_failures.length === 1 ? 'issue' : 'issues'}
                            </Badge>
                        )}
                        {a.model === 'keyword-fallback' && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                                fallback grading
                            </Badge>
                        )}
                    </div>
                </div>
                <ScoreGauge score={score} />
            </div>

            {/* ── Diff banner (re-uploads only) ─────────────────────────── */}
            {diff && (
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-slate-700">Changes since last upload:</span>
                        <span className="flex items-center gap-1 text-slate-600">
                            {diff.score_delta > 0
                                ? <TrendingUp className="h-3 w-3 text-emerald-600" />
                                : diff.score_delta < 0
                                    ? <TrendingDown className="h-3 w-3 text-red-600" />
                                    : <Minus className="h-3 w-3 text-slate-400" />}
                            {diff.previous_score} → {score} ({diff.score_delta > 0 ? '+' : ''}{diff.score_delta})
                        </span>
                    </div>
                    {(diff.improvements.length > 0 || diff.regressions.length > 0) && (
                        <ul className="mt-1.5 space-y-0.5">
                            {diff.improvements.map((s, i) => (
                                <li key={`i-${i}`} className="text-[11px] text-emerald-700 flex gap-1.5">
                                    <span>✓</span><span>{s}</span>
                                </li>
                            ))}
                            {diff.regressions.map((s, i) => (
                                <li key={`r-${i}`} className="text-[11px] text-red-700 flex gap-1.5">
                                    <span>✗</span><span>{s}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* ── Failing fields (always shown) ─────────────────────────── */}
            {failing.length > 0 && (
                <div className="px-4 py-3 space-y-2 border-b border-slate-100">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Needs attention ({failing.length})
                    </h4>
                    <div className="space-y-1.5">
                        {failing.map((g) => (
                            <FieldGradeRow key={g.field} grade={g} defaultOpen />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Dispute risks ──────────────────────────────────────────── */}
            {a.dispute_risks && a.dispute_risks.length > 0 && (
                <div className="px-4 py-3 border-b border-slate-100">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Dispute risks ({a.dispute_risks.length})
                    </h4>
                    <ul className="mt-2 space-y-2">
                        {a.dispute_risks.map((r, i) => (
                            <li key={i} className="text-xs bg-amber-50 border border-amber-200 rounded p-2">
                                <div className="flex items-start gap-2">
                                    <Badge className={`text-[10px] shrink-0 ${
                                        r.severity === 'high'   ? 'bg-red-100 text-red-700 hover:bg-red-100'   :
                                        r.severity === 'medium' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' :
                                                                  'bg-slate-100 text-slate-700 hover:bg-slate-100'
                                    }`}>
                                        {r.severity}
                                    </Badge>
                                    <span className="font-medium text-amber-900">{r.concern}</span>
                                </div>
                                {r.clause_quote && (
                                    <p className="text-[11px] italic text-amber-800 mt-1 ml-1">
                                        &ldquo;{r.clause_quote}&rdquo;
                                    </p>
                                )}
                                <p className="text-[11px] text-amber-900 mt-1 ml-1 flex gap-1.5 items-start">
                                    <Sparkles className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                                    <span>{r.suggested_remediation}</span>
                                </p>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* ── Show-all toggle + full grade list ─────────────────────── */}
            <div className="px-4 py-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-slate-600 hover:text-slate-900 px-2"
                    onClick={onToggleAll}
                >
                    {showAll ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                    {showAll ? 'Hide' : 'Show'} all {grades.length} graded fields
                </Button>
            </div>

            {showAll && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                    {(['critical', 'required', 'recommended'] as FieldSeverity[]).map(tier => (
                        groups[tier].length > 0 && (
                            <section key={tier}>
                                <h5 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                                    {SEVERITY_LABEL[tier]} ({groups[tier].length})
                                </h5>
                                <div className="space-y-1.5">
                                    {groups[tier].map(g => (
                                        <FieldGradeRow key={g.field} grade={g} />
                                    ))}
                                </div>
                            </section>
                        )
                    ))}
                </div>
            )}
        </div>
    );
}
