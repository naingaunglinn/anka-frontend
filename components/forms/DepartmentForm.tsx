'use client';

import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { DialogClose } from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';
import { Employee } from '@/types/business';
import { departmentSchema, type DepartmentFormValues } from '@/lib/schemas/organization.schema';

interface DepartmentFormProps {
    initialData?: DepartmentFormValues | null;
    employees?: Employee[];
    onSubmit: (data: DepartmentFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function DepartmentForm({ initialData, employees = [], onSubmit, onCancel }: DepartmentFormProps) {
    const form = useForm<DepartmentFormValues>({
        resolver: zodResolver(departmentSchema) as any,
        mode: 'onBlur',
        reValidateMode: 'onChange',
        // Explicit normalization so a `null` managerId from the API doesn't trip
        // Zod's `.optional()` validator (which rejects null).
        defaultValues: {
            name:      initialData?.name ?? '',
            managerId: initialData?.managerId ?? undefined,
        },
    });

    const activeEmployees = employees.filter(e => e.status === 'Active');

    const handleSubmit = async (data: DepartmentFormValues) => {
        await onSubmit(data);
    };

    function onFormError(errors: FieldErrors<DepartmentFormValues>) {
        const firstKey = Object.keys(errors)[0] as keyof DepartmentFormValues | undefined;
        if (!firstKey) return;
        const el = document.querySelector(`[name="${firstKey}"]`) as HTMLElement | null
                ?? document.getElementById(firstKey);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus?.();
    }

    const errorCount = Object.keys(form.formState.errors).length;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit, onFormError)} className="space-y-4">
                {form.formState.isSubmitted && errorCount > 0 && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            {errorCount === 1
                                ? 'Please fix the highlighted field before saving.'
                                : `Please fill in ${errorCount} required fields before saving.`}
                        </span>
                    </div>
                )}
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Department Name <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder="e.g. Engineering" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="managerId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Manager <span className="text-muted-foreground text-xs font-normal">(optional — assign after adding employees)</span></FormLabel>
                            <Select
                                onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}
                                defaultValue={field.value ?? 'none'}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Assign later" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="none">— Unassigned —</SelectItem>
                                    {activeEmployees.map(e => (
                                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <p className="text-xs text-muted-foreground">
                    Fields marked <span className="text-destructive">*</span> are required.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                    {onCancel ? (
                        <Button type="button" variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                    ) : (
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Cancel
                            </Button>
                        </DialogClose>
                    )}
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? "Saving..." : "Save Department"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
