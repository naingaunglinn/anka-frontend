'use client';

import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
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
    const t = useTranslations();
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
                                ? t('please_fix_highlighted')
                                : t('please_fill_required_fields', { count: errorCount })}
                        </span>
                    </div>
                )}
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('department_name')} <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder={t('placeholder_engineering')} {...field} />
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
                            <FormLabel>{t('manager_label')} <span className="text-[#4a4a4a] text-xs font-normal">{t('manager_optional_hint')}</span></FormLabel>
                            <Select
                                onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}
                                defaultValue={field.value ?? 'none'}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('assign_later')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="none">{t('unassigned_dash')}</SelectItem>
                                    {activeEmployees.map(e => (
                                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <p className="text-xs text-[#4a4a4a]">
                    {t('fields_required_explainer')} <span className="text-destructive">*</span> {t('are_required_short')}
                </p>
                <div className="flex justify-end gap-2 pt-2">
                    {onCancel ? (
                        <Button type="button" variant="outline" onClick={onCancel}>
                            {t('cancel')}
                        </Button>
                    ) : (
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                {t('cancel')}
                            </Button>
                        </DialogClose>
                    )}
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? t('saving') : t('save_department')}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
