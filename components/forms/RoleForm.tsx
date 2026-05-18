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
import { DialogClose } from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Department } from '@/types/business';
import { roleSchema, type RoleFormValues } from '@/lib/schemas/organization.schema';

interface RoleFormProps {
    initialData?: RoleFormValues | null;
    departments: Department[];
    onSubmit: (data: RoleFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function RoleForm({ initialData, departments, onSubmit, onCancel }: RoleFormProps) {
    const t = useTranslations();
    const form = useForm<RoleFormValues>({
        resolver: zodResolver(roleSchema) as any,
        mode: 'onBlur',
        reValidateMode: 'onChange',
        defaultValues: {
            title:        initialData?.title ?? '',
            // departmentId is required (min(1)). API may return null if a role
            // has no linked department — treat that as an empty string so the
            // schema's "select one" message fires instead of the generic "expected string".
            departmentId: initialData?.departmentId ?? '',
            rate:         initialData?.rate ?? 0,
        },
    });

    const handleSubmit = async (data: RoleFormValues) => {
        await onSubmit(data);
    };

    function onFormError(errors: FieldErrors<RoleFormValues>) {
        const firstKey = Object.keys(errors)[0] as keyof RoleFormValues | undefined;
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
                    name="title"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('role_title')} <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder={t('placeholder_senior_dev')} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="departmentId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('department_label')} <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('select_a_department')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {departments.map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="rate"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('standard_bill_rate')} <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input type="number" placeholder={t('placeholder_rate_85')} {...field} />
                            </FormControl>
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
                        {form.formState.isSubmitting ? t('saving') : t('save_role')}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
