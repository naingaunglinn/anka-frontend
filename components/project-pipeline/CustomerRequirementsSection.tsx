'use client';

import { useFormContext } from 'react-hook-form';
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
    const form = useFormContext<DealFormValues>();

    return (
        <Card className="border-slate-200">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">Customer Requirements</CardTitle>
                <CardDescription className="text-xs">
                    Optional — fill in as customer conversations surface details. Estimation reads these
                    when pricing; the AI uses them when drafting the contract. Locked once contract drafting starts.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <FormField
                    control={form.control}
                    name="customerSupportObligations"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>What the customer provides</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="e.g. AWS account access, staging environment, test devices, SSO accounts for our engineers..."
                                    className="bg-white min-h-[60px]"
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                                />
                            </FormControl>
                            <FormDescription className="text-[11px]">
                                Devices, environments, credentials the customer must supply for us to deliver.
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
                            <FormLabel>Out-of-scope policy</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="e.g. Out-of-scope work billed at OT rate; requires written change order from authorised signatory..."
                                    className="bg-white min-h-[60px]"
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                                />
                            </FormControl>
                            <FormDescription className="text-[11px]">
                                How additional / out-of-scope work is handled. Leave blank to use the contract template default.
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
                            <FormLabel>Working hours</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="e.g. 9 AM – 6 PM MMT (UTC+6:30), Mon–Fri. After-hours emergencies via on-call rotation."
                                    className="bg-white min-h-[50px]"
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                                />
                            </FormControl>
                            <FormDescription className="text-[11px]">
                                Important for offshore deals — capture timezone explicitly to avoid disputes.
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
                            <FormLabel>Testing range</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="e.g. Chrome / Firefox / Safari latest 2 versions; iOS 16+; Android 12+; viewport widths 360-1920px..."
                                    className="bg-white min-h-[50px]"
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                                />
                            </FormControl>
                            <FormDescription className="text-[11px]">
                                Browsers, OS versions, device classes covered. Drives QA hours in Estimation.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
    );
}
