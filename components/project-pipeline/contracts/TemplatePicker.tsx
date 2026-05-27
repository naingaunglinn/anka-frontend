'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, Server, Users, FileText } from 'lucide-react';
import type { ContractTemplate } from '@/lib/queries/contractDrafts';

const VARIANT_ICONS: Record<string, typeof Cloud> = {
    cloud_backup: Cloud,
    managed_hosting: Server,
    engineer_dispatch: Users,
};

const VARIANT_DESCRIPTIONS: Record<string, string> = {
    cloud_backup:
        'Backup-as-a-service. Storage management, retention, data deletion clauses. Modeled on the Yazaki contract.',
    managed_hosting:
        '24/7 cloud operations. SLA-tier monitoring, incident response, capacity reviews.',
    engineer_dispatch:
        'Traditional SES — engineers assigned for X hours/month. Working hours and out-of-scope clauses.',
};

export function TemplatePicker({
    templates,
    selectedId,
    onSelect,
    suggestedSlug,
}: {
    templates: ContractTemplate[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    /** Hint from the deal's `suggestedTemplateVariant` so we can highlight a default. */
    suggestedSlug?: string | null;
}) {
    if (templates.length === 0) {
        return (
            <Card className="border-amber-200 bg-amber-50/40">
                <CardContent className="p-4 text-sm text-amber-800">
                    No active contract templates available. Ask an admin to seed at least one.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {templates.map((t) => {
                const Icon = VARIANT_ICONS[t.slug] ?? FileText;
                const isSelected = selectedId === t.id;
                const isSuggested = !!suggestedSlug && t.slug === suggestedSlug;
                const description = VARIANT_DESCRIPTIONS[t.slug] ?? `${t.section_count} sections`;

                return (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => onSelect(t.id)}
                        className={`text-left rounded-lg border-2 p-4 transition-all ${
                            isSelected
                                ? 'border-[var(--color-ai-500)] bg-[var(--color-ai-50)]/50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className={`h-9 w-9 rounded-md flex items-center justify-center ${
                                isSelected ? 'bg-[var(--color-ai-100)] text-[var(--color-ai-700)]' : 'bg-slate-100 text-slate-600'
                            }`}>
                                <Icon className="h-5 w-5" />
                            </div>
                            {isSuggested && (
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">
                                    Suggested
                                </Badge>
                            )}
                        </div>
                        <div className="font-semibold text-sm text-slate-900">{t.name}</div>
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{description}</p>
                        <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-wide">
                            {t.section_count} sections · v{t.version}
                            {t.is_global ? ' · Global' : ' · Tenant override'}
                        </p>
                    </button>
                );
            })}
        </div>
    );
}
