import { Badge } from '@/components/ui/badge';
import { FileEdit, Send, CheckCircle2, Archive } from 'lucide-react';
import type { DraftStatus } from '@/lib/queries/contractDrafts';

const STATUS_CONFIG: Record<DraftStatus, { label: string; className: string; Icon: typeof FileEdit }> = {
    draft: {
        label: 'Draft',
        className: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-default)] hover:bg-[var(--color-bg-subtle)]',
        Icon: FileEdit,
    },
    sent_to_customer: {
        label: 'Sent',
        className: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
        Icon: Send,
    },
    signed: {
        label: 'Signed',
        className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
        Icon: CheckCircle2,
    },
    superseded: {
        label: 'Superseded',
        className: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] line-through',
        Icon: Archive,
    },
};

export function DraftStatusChip({ status }: { status: DraftStatus }) {
    const cfg = STATUS_CONFIG[status];
    const { Icon } = cfg;
    return (
        <Badge variant="secondary" className={`gap-1 ${cfg.className}`}>
            <Icon className="h-3 w-3" />
            {cfg.label}
        </Badge>
    );
}
