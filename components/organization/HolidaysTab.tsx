'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useHolidays, useHolidayMutations, type Holiday } from '@/lib/queries/holidays';
import { normalizeError } from '@/lib/errorHandler';

export function HolidaysTab() {
    const { data: holidays = [], isLoading } = useHolidays();
    const { create, update, destroy } = useHolidayMutations();

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [editing, setEditing] = useState<Holiday | null>(null);
    const [yearFilter, setYearFilter] = useState<string>('all');

    const years = useMemo(() => {
        const set = new Set<string>();
        for (const h of holidays) set.add(h.date.slice(0, 4));
        return Array.from(set).sort();
    }, [holidays]);

    const filtered = useMemo(() => {
        if (yearFilter === 'all') return holidays;
        return holidays.filter((h) => h.date.startsWith(yearFilter));
    }, [holidays, yearFilter]);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                <div>
                    <h3 className="text-xl font-bold tracking-tight text-[#171717]">Public Holidays</h3>
                    <p className="text-[#4a4a4a] text-sm mt-1">
                        Days the AI scheduler will skip, and that reduce each month&apos;s available team capacity.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={yearFilter}
                        onChange={(e) => setYearFilter(e.target.value)}
                        className="h-9 rounded border border-slate-200 px-3 text-sm"
                    >
                        <option value="all">All years</option>
                        {years.map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                <Plus className="w-4 h-4" /> Add Holiday
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[460px]">
                            <DialogHeader>
                                <DialogTitle>Add Holiday</DialogTitle>
                                <DialogDescription>
                                    The AI scheduler skips this date when planning task dates. If the holiday repeats every year on the same date, mark it as recurring.
                                </DialogDescription>
                            </DialogHeader>
                            <HolidayForm
                                onSubmit={async (input) => {
                                    try {
                                        await create.mutateAsync(input);
                                        toast.success('Holiday added.');
                                        setIsAddOpen(false);
                                    } catch (err) {
                                        toast.error(normalizeError(err).message);
                                    }
                                }}
                                onCancel={() => setIsAddOpen(false)}
                                submitting={create.isPending}
                            />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Card className="p-0 overflow-hidden border-[#e6e9ee]">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-slate-700">Date</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-700">Name</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-700">Recurring</th>
                            <th className="px-4 py-3 text-right font-medium text-slate-700 w-[140px]">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No holidays. Add one to start.</td></tr>
                        ) : filtered.map((h) => (
                            <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                <td className="px-4 py-2.5 font-mono text-slate-700">{h.date}</td>
                                <td className="px-4 py-2.5 text-slate-800">{h.name}</td>
                                <td className="px-4 py-2.5">
                                    {h.isRecurring ? (
                                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 gap-1">
                                            <RotateCcw className="h-3 w-3" /> Every year
                                        </Badge>
                                    ) : (
                                        <span className="text-slate-400 text-xs">One-off</span>
                                    )}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                    <div className="inline-flex items-center gap-1">
                                        <Button size="sm" variant="ghost" onClick={() => setEditing(h)} className="h-7 px-2">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            onClick={async () => {
                                                if (!confirm(`Delete "${h.name}" on ${h.date}?`)) return;
                                                try {
                                                    await destroy.mutateAsync(h.id);
                                                    toast.success('Holiday deleted.');
                                                } catch (err) {
                                                    toast.error(normalizeError(err).message);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle>Edit Holiday</DialogTitle>
                    </DialogHeader>
                    {editing && (
                        <HolidayForm
                            initial={editing}
                            onSubmit={async (input) => {
                                try {
                                    await update.mutateAsync({ id: editing.id, ...input });
                                    toast.success('Holiday updated.');
                                    setEditing(null);
                                } catch (err) {
                                    toast.error(normalizeError(err).message);
                                }
                            }}
                            onCancel={() => setEditing(null)}
                            submitting={update.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function HolidayForm({
    initial,
    onSubmit,
    onCancel,
    submitting,
}: {
    initial?: Holiday;
    onSubmit: (input: { date: string; name: string; isRecurring: boolean }) => void | Promise<void>;
    onCancel: () => void;
    submitting: boolean;
}) {
    const [date, setDate] = useState(initial?.date ?? '');
    const [name, setName] = useState(initial?.name ?? '');
    const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? false);

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (!date || !name.trim()) return;
                void onSubmit({ date, name: name.trim(), isRecurring });
            }}
            className="space-y-4"
        >
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Date</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Name</label>
                <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 元日, Independence Day" required maxLength={150} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="h-4 w-4"
                />
                Recurs every year on the same date
            </label>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                <Button type="submit" className="bg-[#171717] hover:bg-[#00a7f4]" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Save'}
                </Button>
            </DialogFooter>
        </form>
    );
}
