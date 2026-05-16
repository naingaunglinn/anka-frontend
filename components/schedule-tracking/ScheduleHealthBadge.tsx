'use client';

import { Badge } from '@/components/ui/badge';
import type { ScheduleHealth } from '@/types/business';

const STYLES: Record<ScheduleHealth, string> = {
    on_track: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    at_risk:  'bg-amber-50 text-amber-700 border-amber-200',
    slipping: 'bg-rose-50 text-rose-700 border-rose-200',
};

const LABELS: Record<ScheduleHealth, string> = {
    on_track: 'On Track',
    at_risk:  'At Risk',
    slipping: 'Slipping',
};

export function ScheduleHealthBadge({
    health,
    varianceHours,
    compact = false,
}: {
    health: ScheduleHealth;
    varianceHours?: number;
    compact?: boolean;
}) {
    const sign = varianceHours !== undefined ? (varianceHours > 0 ? '+' : '') : '';
    return (
        <Badge variant="outline" className={`${STYLES[health]} ${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'}`}>
            {LABELS[health]}
            {varianceHours !== undefined && (
                <span className="ml-1">{sign}{varianceHours}h</span>
            )}
        </Badge>
    );
}
