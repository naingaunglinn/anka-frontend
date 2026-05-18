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
import { globalOverheadSchema, type OverheadFormValues } from '@/lib/schemas/organization.schema';
import { useCurrencySymbol } from '@/hooks/useTenantCurrency';

const MONTHS: Array<{ value: number; labelKey: string }> = [
    { value: 1,  labelKey: 'month_january'   },
    { value: 2,  labelKey: 'month_february'  },
    { value: 3,  labelKey: 'month_march'     },
    { value: 4,  labelKey: 'month_april'     },
    { value: 5,  labelKey: 'month_may'       },
    { value: 6,  labelKey: 'month_june'      },
    { value: 7,  labelKey: 'month_july'      },
    { value: 8,  labelKey: 'month_august'    },
    { value: 9,  labelKey: 'month_september' },
    { value: 10, labelKey: 'month_october'   },
    { value: 11, labelKey: 'month_november'  },
    { value: 12, labelKey: 'month_december'  },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

interface OverheadFormProps {
    initialData?: OverheadFormValues | null;
    onSubmit: (data: OverheadFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function OverheadForm({ initialData, onSubmit, onCancel }: OverheadFormProps) {
    const t = useTranslations();
    const symbol = useCurrencySymbol();
    const form = useForm<OverheadFormValues>({
        resolver: zodResolver(globalOverheadSchema) as any,
        mode: 'onBlur',
        reValidateMode: 'onChange',
        // Explicitly coerce optional fields away from `null` (API may return
        // null for unset months/years — Zod's `.optional()` only accepts undefined).
        defaultValues: {
            category:       initialData?.category ?? '',
            description:    initialData?.description ?? '',
            monthlyCost:    initialData?.monthlyCost ?? 0,
            effectiveMonth: initialData?.effectiveMonth ?? undefined,
            effectiveYear:  initialData?.effectiveYear ?? undefined,
        },
    });

    const handleSubmit = async (data: OverheadFormValues) => {
        await onSubmit(data);
    };

    function onFormError(errors: FieldErrors<OverheadFormValues>) {
        const firstKey = Object.keys(errors)[0] as keyof OverheadFormValues | undefined;
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
                    name="category"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('category_name')} <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder={t('placeholder_software_licenses')} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('description_label')} <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder={t('placeholder_aws_github')} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="monthlyCost"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('monthly_cost_with_symbol', { symbol })} <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input type="number" placeholder={t('placeholder_cost_500')} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="effectiveMonth"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('month_label')} <span className="text-[#4a4a4a] font-normal">{t('optional_lowercase')}</span></FormLabel>
                                <Select
                                    onValueChange={(v) => field.onChange(v === 'none' ? undefined : Number(v))}
                                    defaultValue={field.value !== undefined ? String(field.value) : 'none'}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('all_months')} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">{t('all_months')}</SelectItem>
                                        {MONTHS.map(m => (
                                            <SelectItem key={m.value} value={String(m.value)}>{t(m.labelKey)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="effectiveYear"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('year_label')} <span className="text-[#4a4a4a] font-normal">{t('optional_lowercase')}</span></FormLabel>
                                <Select
                                    onValueChange={(v) => field.onChange(v === 'none' ? undefined : Number(v))}
                                    defaultValue={field.value !== undefined ? String(field.value) : 'none'}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('all_years')} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">{t('all_years')}</SelectItem>
                                        {YEARS.map(y => (
                                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <p className="text-xs text-[#4a4a4a]">
                    {t('fields_required_full')}
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
                        {form.formState.isSubmitting ? t('saving') : t('save_overhead')}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
