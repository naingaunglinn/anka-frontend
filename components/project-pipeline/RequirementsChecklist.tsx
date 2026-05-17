'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, AlertCircle, Edit3 } from 'lucide-react';
import type { Deal } from '@/types/business';

/**
 * "Customer Requirements" checklist on the deal detail page.
 *
 * Shows each requirement-shaped field with a captured / not-captured
 * indicator. The salesperson uses this as a glance-to-see-what's-still-
 * needed view; clicking through goes to the edit page where they fill
 * in the details (single canonical edit surface).
 *
 * Three groups:
 *   - Required at intake (the 3 spec-mandated fields — should always be filled)
 *   - OT policy (structured; affects ⑦ Profit Calculate)
 *   - Customer requirements (4 progressive fields; flow to ⑤ contract)
 *
 * "Captured" means non-null/non-empty. The OT row counts captured when
 * a model is set (rate / included hours can still be empty for
 * absorbed_by_provider / no_overtime_allowed models).
 */
export function RequirementsChecklist({ deal, dealId, canEdit }: { deal: Deal; dealId: string; canEdit: boolean }) {
    const items = buildChecklistItems(deal);
    const captured = items.filter((i) => i.captured).length;
    const total = items.length;
    const allCaptured = captured === total;
    const intakeMissing = items.filter((i) => i.group === 'intake' && !i.captured).length;

    return (
        <Card className="shadow-sm border-slate-100">
            <CardHeader className="border-b bg-slate-50/50 flex flex-row items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                        Customer Requirements
                        <Badge
                            variant="secondary"
                            className={
                                allCaptured
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                    : intakeMissing > 0
                                        ? 'bg-red-100 text-red-700 hover:bg-red-100'
                                        : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                            }
                        >
                            {captured} / {total} captured
                        </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Estimation reads these when pricing; the AI uses them when drafting the contract.
                        {intakeMissing > 0 && (
                            <span className="text-red-700 font-medium ml-1">
                                {intakeMissing} required field{intakeMissing === 1 ? '' : 's'} still missing.
                            </span>
                        )}
                    </CardDescription>
                </div>
                {canEdit && (
                    <Link href={`/project-pipeline/edit/${dealId}`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                        </Button>
                    </Link>
                )}
            </CardHeader>
            <CardContent className="p-4 space-y-1">
                {items.map((item) => (
                    <ChecklistRow key={item.label} item={item} />
                ))}
            </CardContent>
        </Card>
    );
}

interface ChecklistItem {
    label: string;
    captured: boolean;
    value: string | null;
    group: 'intake' | 'ot' | 'requirements';
    required?: boolean;
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
    const Icon = item.captured ? CheckCircle2 : item.required ? AlertCircle : Circle;
    const iconColor = item.captured
        ? 'text-emerald-500'
        : item.required
            ? 'text-red-500'
            : 'text-slate-300';

    return (
        <div className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-b-0">
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconColor}`} />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700">{item.label}</p>
                {item.value ? (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.value}</p>
                ) : (
                    <p className={`text-xs mt-0.5 italic ${item.required ? 'text-red-500' : 'text-slate-400'}`}>
                        {item.required ? 'Required — not captured' : 'Not yet captured'}
                    </p>
                )}
            </div>
        </div>
    );
}

function buildChecklistItems(deal: Deal): ChecklistItem[] {
    const fmt = (v: number | null | undefined, suffix = '') =>
        v == null ? null : `${v.toLocaleString()}${suffix}`;

    const otCaptured = !!deal.otPolicyModel;
    const otSummary = otCaptured
        ? formatOtSummary(deal)
        : null;

    return [
        // ── Intake (required by spec at rank C) ─────────────────────────
        {
            label: 'Requirement Description',
            captured: !!deal.workloadDescription,
            value: deal.workloadDescription ?? null,
            group: 'intake',
            required: true,
        },
        {
            label: 'Target Timeline',
            captured: deal.timelineMonths != null,
            value: fmt(deal.timelineMonths, ' months'),
            group: 'intake',
            required: true,
        },
        {
            label: 'Estimate Budget',
            captured: !!deal.clientBudget,
            value: fmt(deal.clientBudget),
            group: 'intake',
            required: true,
        },
        // ── OT (structured; drives ⑦ Profit Calculate) ──────────────────
        {
            label: 'OT / Overage Policy',
            captured: otCaptured,
            value: otSummary,
            group: 'ot',
        },
        // ── Customer requirements (progressive) ─────────────────────────
        {
            label: 'What the customer provides',
            captured: !!deal.customerSupportObligations,
            value: deal.customerSupportObligations ?? null,
            group: 'requirements',
        },
        {
            label: 'Out-of-scope policy',
            captured: !!deal.outOfScopePolicy,
            value: deal.outOfScopePolicy ?? null,
            group: 'requirements',
        },
        {
            label: 'Working hours',
            captured: !!deal.workingHours,
            value: deal.workingHours ?? null,
            group: 'requirements',
        },
        {
            label: 'Testing range',
            captured: !!deal.testingRange,
            value: deal.testingRange ?? null,
            group: 'requirements',
        },
    ];
}

export function formatOtSummary(deal: Deal): string {
    const labels: Record<string, string> = {
        customer_pays_per_hour: 'Customer pays per hour',
        capped_then_customer_pays: 'Capped — first N hours included',
        absorbed_by_provider: 'Absorbed by us',
        no_overtime_allowed: 'No overtime',
    };
    const base = labels[deal.otPolicyModel ?? ''] ?? deal.otPolicyModel ?? '';
    const extras: string[] = [];
    if (deal.otRatePerHour != null) extras.push(`@ ${deal.otRatePerHour}/hr`);
    if (deal.otIncludedHoursPerMonth != null) extras.push(`${deal.otIncludedHoursPerMonth} hrs/mo included`);
    return extras.length > 0 ? `${base} (${extras.join(', ')})` : base;
}
