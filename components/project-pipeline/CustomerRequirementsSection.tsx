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
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { DealFormValues } from '@/lib/schemas/deal.schema';

/**
 * Customer requirements collected progressively during nego.
 *
 * All fields are optional. The salesperson fills them as customer
 * conversations surface the details. By the time the contract drafting
 * wizard runs, whatever is filled flows into the AI prompt as
 * structured DEAL CONTEXT; missing values become placeholder markers
 * the operator resolves in step 2.
 *
 * Per the manager's spec, ⑤ Contract must specify all four:
 *   - What the customer must support (devices, environments, accounts)
 *   - Out-of-scope policy (additional charges)
 *   - Working hours (esp. for offshore time-zone clarity)
 *   - Testing range (browsers, OS versions)
 */
export function CustomerRequirementsSection() {
    const t = useTranslations();
    const form = useFormContext<DealFormValues>();

    return (
        <Card className="border-slate-200">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('customer_requirements')}</CardTitle>
                <CardDescription className="text-xs">
                    {t('customer_requirements_desc')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <FormField
                    control={form.control}
                    name="customerSupportObligations"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('what_customer_provides')}</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder={t('customer_provides_placeholder')}
                                    className="bg-white min-h-[60px]"
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                                />
                            </FormControl>
                            <FormDescription className="text-[11px]">
                                {t('customer_provides_help')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="outOfScopePolicy"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('out_of_scope_policy')}</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder={t('oos_placeholder')}
                                    className="bg-white min-h-[60px]"
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                                />
                            </FormControl>
                            <FormDescription className="text-[11px]">
                                {t('oos_help')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="workingHours"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('working_hours')}</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder={t('working_hours_placeholder')}
                                    className="bg-white min-h-[50px]"
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                                />
                            </FormControl>
                            <FormDescription className="text-[11px]">
                                {t('working_hours_help')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="testingRange"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('testing_range')}</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder={t('testing_range_placeholder')}
                                    className="bg-white min-h-[50px]"
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                                />
                            </FormControl>
                            <FormDescription className="text-[11px]">
                                {t('testing_range_help')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
    );
}
