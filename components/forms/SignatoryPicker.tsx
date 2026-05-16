'use client';

import { useMemo } from 'react';
import { useBusinessStore } from '@/store/businessStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Sparkles } from 'lucide-react';

/**
 * Dropdown of employees eligible to sign on the Provider's behalf —
 * filtered to anyone above the "Lead / Tech Lead" rank (rank.level > 40).
 * Used in:
 *   - Org → Company → Authorized signatory (sets the tenant default)
 *   - Contract draft wizard step 1 → Provider signatory (per-draft override)
 *
 * On select, emits the employee's name + role title (job role, not the
 * rank bucket — "Managing Director" reads better than "Director").
 * The parent component owns the name/title input state; this picker
 * only fills it in. Manual text edits remain possible after picking,
 * since not every signer is necessarily on the employees roster.
 */
export function SignatoryPicker({
    id = 'signatory-picker',
    label = 'Pick from senior employees',
    helper,
    onSelect,
}: {
    id?: string;
    label?: string;
    helper?: string;
    onSelect: (employee: { name: string; title: string }) => void;
}) {
    const employees = useBusinessStore((s) => s.employees);

    const senior = useMemo(() => {
        return employees
            .filter((e) => (e.rank?.level ?? 0) > 40 && e.status === 'Active')
            .sort((a, b) => {
                // Sort by rank level desc, then by name asc.
                const rl = (b.rank?.level ?? 0) - (a.rank?.level ?? 0);
                return rl !== 0 ? rl : a.name.localeCompare(b.name);
            });
    }, [employees]);

    const hasOptions = senior.length > 0;

    return (
        <div className="space-y-1.5">
            <Label htmlFor={id} className="text-xs flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-indigo-500" />
                {label}
            </Label>
            <Select
                disabled={!hasOptions}
                onValueChange={(value) => {
                    const emp = senior.find((e) => e.id === value);
                    if (!emp) return;
                    onSelect({
                        name: emp.name,
                        title: emp.roleName ?? emp.rank?.name ?? '',
                    });
                }}
            >
                <SelectTrigger id={id} className="bg-white">
                    <SelectValue placeholder={
                        hasOptions
                            ? 'Choose an employee to auto-fill the fields below'
                            : 'No senior-rank employees yet — assign ranks in Organization → Employees'
                    } />
                </SelectTrigger>
                <SelectContent>
                    {senior.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                            <div className="flex flex-col items-start">
                                <span className="font-medium text-sm">{e.name}</span>
                                <span className="text-[11px] text-slate-500">
                                    {e.roleName ?? '(no role)'} · {e.rank?.name}
                                </span>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {helper && (
                <p className="text-[11px] text-slate-500">{helper}</p>
            )}
        </div>
    );
}
