"use client";

import { useTranslations } from "next-intl";

/**
 * Project Pipeline — edit deal (③ Nego data only).
 *
 * Same scope as the new-deal page: only the customer intake fields the
 * manager's spec assigns to ③ Nego. Cost / staffing / AI Team Builder
 * UI was removed in the chg-009 Phase A prep cleanup; those features
 * belong to ④ Estimation and ⑥ Task Assign.
 *
 * Deal terms LOCK once rank reaches A (negotiation, contract drafting
 * underway) or S (signed). The lock guard below redirects to the deal
 * detail page so users see a clear "locked" state instead of a form
 * that 422s on submit.
 */

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useParams } from "next/navigation";
import { useBusinessStore } from "@/store/businessStore";
import { useTenantStore, type Currency } from "@/store/tenantStore";
import { CURRENCY_CONFIG } from "@/lib/currencyConfig";

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, AlertCircle, Lock } from "lucide-react";
import { LEAD_SOURCE_OPTIONS, dealSchema, type DealFormValues } from "@/lib/schemas/deal.schema";
import { useDealDetail, useDealMutations } from "@/lib/queries/deals";
import { usePermission } from "@/hooks/usePermission";
import { isLockedStage } from "@/lib/dealRanks";
import { OtPolicySection } from "@/components/project-pipeline/OtPolicySection";
import { CustomerRequirementsSection } from "@/components/project-pipeline/CustomerRequirementsSection";

export default function EditDealPage() {
    const t = useTranslations();
    const router = useRouter();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((tenant) => tenant.id === activeTenantId)?.currency ?? 'MMK';
    const params = useParams();
    const dealId = params.id as string;

    const deals = useBusinessStore((state) => state.deals);
    const dealQuery = useDealDetail(dealId);
    const { updateDeal } = useDealMutations();
    const { allowed: canManageCrm, reason: rbacReason } = usePermission('manage_crm');
    const dealToEdit = dealQuery.data ?? deals.find((d) => d.id === dealId);

    const form = useForm<DealFormValues>({
        resolver: zodResolver(dealSchema) as Resolver<DealFormValues>,
        mode: 'onBlur',
        reValidateMode: 'onChange',
        defaultValues: {
            name: dealToEdit?.name || "",
            client: dealToEdit?.client || "",
            contactName: dealToEdit?.contactName || "",
            contactEmail: dealToEdit?.contactEmail || "",
            contactPhone: dealToEdit?.contactPhone || "",
            customerAddress: dealToEdit?.customerAddress || "",
            expectedCloseDate: dealToEdit?.expectedCloseDate || "",
            leadSource: dealToEdit?.leadSource,
            clientBudget: dealToEdit?.clientBudget || 0,
            timelineMonths: dealToEdit?.timelineMonths || 1,
            workloadHours: dealToEdit?.workloadHours || 0,
            winProbability: dealToEdit?.winProbability ?? 30,
            workloadDescription: dealToEdit?.workloadDescription || "",
            otPolicyModel: dealToEdit?.otPolicyModel ?? null,
            otRatePerHour: dealToEdit?.otRatePerHour ?? null,
            otIncludedHoursPerMonth: dealToEdit?.otIncludedHoursPerMonth ?? null,
            otNotes: dealToEdit?.otNotes ?? null,
            customerSupportObligations: dealToEdit?.customerSupportObligations ?? null,
            outOfScopePolicy: dealToEdit?.outOfScopePolicy ?? null,
            workingHours: dealToEdit?.workingHours ?? null,
            testingRange: dealToEdit?.testingRange ?? null,
            // Schema still requires at least one ghost role. Estimation
            // owns ghost-role detail; this menu seeds an empty placeholder
            // so save doesn't trip the validator.
            ghostRoles: dealToEdit?.ghostRoles && dealToEdit.ghostRoles.length > 0
                ? dealToEdit.ghostRoles
                : [{ roleType: 'frontend', quantity: 1, months: 100, minMonthlySalary: 0, maxMonthlySalary: 0 }],
        },
    });

    // Reset form ONCE per deal id when server data lands. Avoids clobbering
    // in-flight edits during background TanStack refetches.
    const formInitializedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!dealToEdit) return;
        if (formInitializedFor.current === dealToEdit.id) return;
        formInitializedFor.current = dealToEdit.id;
        form.reset({
            name: dealToEdit.name || "",
            client: dealToEdit.client || "",
            contactName: dealToEdit.contactName || "",
            contactEmail: dealToEdit.contactEmail || "",
            contactPhone: dealToEdit.contactPhone || "",
            customerAddress: dealToEdit.customerAddress || "",
            expectedCloseDate: dealToEdit.expectedCloseDate || "",
            leadSource: dealToEdit.leadSource,
            clientBudget: dealToEdit.clientBudget || 0,
            timelineMonths: dealToEdit.timelineMonths || 1,
            workloadHours: dealToEdit.workloadHours || 0,
            winProbability: dealToEdit.winProbability ?? 30,
            workloadDescription: dealToEdit.workloadDescription || "",
            otPolicyModel: dealToEdit.otPolicyModel ?? null,
            otRatePerHour: dealToEdit.otRatePerHour ?? null,
            otIncludedHoursPerMonth: dealToEdit.otIncludedHoursPerMonth ?? null,
            otNotes: dealToEdit.otNotes ?? null,
            customerSupportObligations: dealToEdit.customerSupportObligations ?? null,
            outOfScopePolicy: dealToEdit.outOfScopePolicy ?? null,
            workingHours: dealToEdit.workingHours ?? null,
            testingRange: dealToEdit.testingRange ?? null,
            ghostRoles: dealToEdit.ghostRoles && dealToEdit.ghostRoles.length > 0
                ? dealToEdit.ghostRoles
                : [{ roleType: 'frontend', quantity: 1, months: 100, minMonthlySalary: 0, maxMonthlySalary: 0 }],
        });
    }, [dealToEdit, form]);

    const expectedCloseDate = form.watch("expectedCloseDate");
    const timelineMonths = form.watch("timelineMonths");

    function onFormError() {
        const errors = form.formState.errors;
        const firstKey = Object.keys(errors)[0];
        if (!firstKey) return;
        const el = document.querySelector(`[name="${firstKey}"]`) as HTMLElement | null
                ?? document.getElementById(firstKey);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus?.();
    }

    async function onSubmit(data: DealFormValues) {
        if (!dealToEdit) return;

        await updateDeal.mutateAsync({
            id: dealId,
            updates: {
                name: data.name,
                client: data.client,
                contactName: data.contactName,
                contactEmail: data.contactEmail,
                contactPhone: data.contactPhone,
                customerAddress: data.customerAddress?.trim() || undefined,
                expectedCloseDate: data.expectedCloseDate || undefined,
                leadSource: data.leadSource,
                clientBudget: data.clientBudget,
                timelineMonths: data.timelineMonths,
                workloadDescription: data.workloadDescription,
                otPolicyModel: data.otPolicyModel ?? null,
                otRatePerHour: data.otRatePerHour ?? null,
                otIncludedHoursPerMonth: data.otIncludedHoursPerMonth ?? null,
                otNotes: data.otNotes ?? null,
                customerSupportObligations: data.customerSupportObligations ?? null,
                outOfScopePolicy: data.outOfScopePolicy ?? null,
                workingHours: data.workingHours ?? null,
                testingRange: data.testingRange ?? null,
                winProbability: data.winProbability,
            },
        });

        toast.success(t('deal_updated_toast', { name: data.name }));
        router.push(`/project-pipeline/${dealId}`);
    }

    // ── RBAC + state guards (after hooks for stable order) ────────────────

    if (!canManageCrm) {
        return (
            <div className="container mx-auto p-6 max-w-3xl space-y-4">
                <h1 className="text-2xl font-bold tracking-tight">{t('permission_required')}</h1>
                <p className="text-sm text-muted-foreground">{rbacReason}</p>
                <Button variant="outline" onClick={() => router.push('/project-pipeline')}>{t('back_to_pipeline_short')}</Button>
            </div>
        );
    }

    if (dealQuery.isLoading) {
        return <div className="p-8 text-sm text-muted-foreground">{t('loading_deal')}</div>;
    }

    if (dealQuery.isError) {
        return (
            <div className="p-8 space-y-3">
                <p className="text-sm text-destructive">{t('could_not_load_deal')}</p>
                <Button variant="outline" onClick={() => dealQuery.refetch()}>{t('retry')}</Button>
            </div>
        );
    }

    if (!dealToEdit) {
        return <div className="p-8">{t('deal_not_found')}</div>;
    }

    if (isLockedStage(dealToEdit.status)) {
        return (
            <div className="container mx-auto p-6 max-w-3xl space-y-4">
                <Card className="border-amber-200 bg-amber-50/40">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-amber-900">
                            <Lock className="h-5 w-5" />
                            {t('deal_locked')}
                        </CardTitle>
                        <CardDescription className="text-amber-800">
                            {dealToEdit.status === 'won'
                                ? t('deal_locked_won')
                                : t('deal_locked_drafting')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                        <Button variant="outline" onClick={() => router.push(`/project-pipeline/${dealId}`)}>
                            {t('view_deal_btn')}
                        </Button>
                        <Button variant="ghost" onClick={() => router.push('/project-pipeline')}>
                            {t('back_to_pipeline_short')}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-3xl space-y-6">
            <div className="flex items-start gap-3">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => router.push(`/project-pipeline/${dealId}`)}
                    aria-label={t('back_to_deal_short')}
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('edit_deal_title')}</h1>
                    <p className="text-[#4a4a4a] mt-1">
                        {t('edit_deal_subtitle')}
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('deal_profile')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit, onFormError)} className="space-y-6">
                            {form.formState.isSubmitted && Object.keys(form.formState.errors).length > 0 && (
                                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>
                                        {t('please_fix_highlighted_n', { count: Object.keys(form.formState.errors).length })}
                                    </span>
                                </div>
                            )}

                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('deal_name_label')} <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input placeholder={t('placeholder_acme_webapp')} className="bg-white" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="client"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('client_company_name')} <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input placeholder={t('placeholder_acme_corp')} className="bg-white" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-3 gap-4">
                                <FormField
                                    control={form.control}
                                    name="contactName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('contact_name_label')} <span className="text-destructive">*</span></FormLabel>
                                            <FormControl>
                                                <Input placeholder={t('placeholder_jane_smith')} className="bg-white" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="contactEmail"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('contact_email_label')} <span className="text-destructive">*</span></FormLabel>
                                            <FormControl>
                                                <Input type="email" placeholder={t('placeholder_acme_email')} className="bg-white" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="contactPhone"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('contact_phone_label')} <span className="text-destructive">*</span></FormLabel>
                                            <FormControl>
                                                <Input placeholder={t('placeholder_intl_phone')} className="bg-white" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="customerAddress"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('customer_address_label')} <span className="text-xs font-normal text-[var(--color-text-default)]/80">{t('opt_short')}</span></FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder={t('placeholder_customer_address')}
                                                rows={2}
                                                maxLength={1000}
                                                className="bg-white"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />


                            <div className="grid grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="expectedCloseDate"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('expected_start_date_label')} <span className="text-red-500">*</span></FormLabel>
                                            <FormControl>
                                                <Input type="date" className="bg-white" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormItem>
                                    <FormLabel>{t('expected_end_date_label')}</FormLabel>
                                    <div className="h-9 flex items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                                        {expectedCloseDate && timelineMonths
                                            ? new Date(new Date(expectedCloseDate).getTime() + Number(timelineMonths) * 30.44 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                                            : '—'}
                                    </div>
                                </FormItem>
                            </div>

                            <FormField
                                control={form.control}
                                name="leadSource"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('lead_source')} <span className="text-muted-foreground text-xs font-normal">{t('optional_lowercase')}</span></FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                            <FormControl>
                                                <SelectTrigger className="bg-white">
                                                    <SelectValue placeholder={t('how_did_they_find_you')} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {LEAD_SOURCE_OPTIONS.map((opt) => (
                                                    <SelectItem key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="clientBudget"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('estimate_budget_with_symbol', { symbol: CURRENCY_CONFIG[currency].symbol })} <span className="text-destructive">*</span></FormLabel>
                                            <FormControl>
                                                <Input type="number" className="bg-white" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="timelineMonths"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('target_timeline_months')} <span className="text-destructive">*</span></FormLabel>
                                            <FormControl>
                                                <Input type="number" step="1" min="1" className="bg-white" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="workloadDescription"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('requirement_description')} <span className="text-muted-foreground text-xs font-normal">{t('feeds_ai_contract_hint')}</span></FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder={t('requirement_placeholder')}
                                                className="bg-white min-h-[120px]"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <OtPolicySection />

                            <CustomerRequirementsSection />

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="lg"
                                    onClick={() => router.push(`/project-pipeline/${dealId}`)}
                                >
                                    {t('cancel')}
                                </Button>
                                <Button type="submit" size="lg" disabled={updateDeal.isPending}>
                                    {updateDeal.isPending ? t('saving') : t('save_changes')}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
