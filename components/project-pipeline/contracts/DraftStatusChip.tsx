import { Badge } from '@/components/ui/badge';
import { FileEdit, Send, CheckCircle2, Archive } from 'lucide-react';
import type { DraftStatus } from '@/lib/queries/contractDrafts';

const STATUS_CONFIG: Record<DraftStatus, { label: string; className: string; Icon: typeof FileEdit }> = {
    draft: {
        label: 'Draft',
        className: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
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
        className: 'bg-slate-50 text-slate-500 hover:bg-slate-50 line-through',
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
