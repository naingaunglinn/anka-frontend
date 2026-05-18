'use client';

import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { OT_POLICY_OPTIONS, type DealFormValues } from '@/lib/schemas/deal.schema';

/**
 * OT / overage policy form section. Used in both new + edit deal pages.
 *
 * Conditional rendering:
 *   customer_pays_per_hour     → rate input
 *   capped_then_customer_pays  → rate input + included-hours input
 *   absorbed_by_provider       → no extra fields (just the notes)
 *   no_overtime_allowed        → no extra fields
 *
 * Why this lives in components/project-pipeline/ (not /crm/): chg-009
 * defined this as part of the Project Pipeline UI surface from day one.
 */
export function OtPolicySection() {
    const t = useTranslations();
    const form = useFormContext<DealFormValues>();
    const policyModel = form.watch('otPolicyModel');

    const showRate = policyModel === 'customer_pays_per_hour' || policyModel === 'capped_then_customer_pays';
    const showIncludedHours = policyModel === 'capped_then_customer_pays';
    const isAbsorbed = policyModel === 'absorbed_by_provider';

    return (
        <Card className="border-slate-200">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('ot_overage_policy')}</CardTitle>
                <CardDescription className="text-xs">
                    {t('ot_policy_desc')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <FormField
                    control={form.control}
                    name="otPolicyModel"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('policy_model')}</FormLabel>
                            <Select
                                onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                                value={field.value ?? '__none__'}
                            >
                                <FormControl>
                                    <SelectTrigger className="bg-white">
                                        <SelectValue placeholder={t('pick_how_ot_billed')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="__none__" className="text-slate-500">
                                        {t('not_yet_decided')}
                                    </SelectItem>
                                    {OT_POLICY_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{opt.label}</span>
                                                <span className="text-xs text-slate-500">{opt.help}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {isAbsorbed && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-amber-900">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                            {t('ot_absorbed_warning')}
                        </span>
                    </div>
                )}

                {(showRate || showIncludedHours) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {showRate && (
                            <FormField
                                control={form.control}
                                name="otRatePerHour"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('per_hour_rate')} <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder="e.g. 80"
                                                className="bg-white"
                                                {...field}
                                                value={field.value ?? ''}
                                                onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                            />
                                        </FormControl>
                                        <FormDescription className="text-[11px]">
                                            {t('ot_rate_help')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                        {showIncludedHours && (
                            <FormField
                                control={form.control}
                                name="otIncludedHoursPerMonth"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('included_hours_per_month')} <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                step="1"
                                                min="0"
                                                max="744"
                                                placeholder="e.g. 12"
                                                className="bg-white"
                                                {...field}
                                                value={field.value ?? ''}
                                                onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                            />
                                        </FormControl>
                                        <FormDescription className="text-[11px]">
                                            {t('included_hours_help')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                    </div>
                )}

                <FormField
                    control={form.control}
                    name="otNotes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('notes')} <span className="text-muted-foreground text-xs font-normal">{t('optional_lowercase')}</span></FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder={t('ot_notes_placeholder')}
                                    className="bg-white min-h-[60px]"
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
    );
}
