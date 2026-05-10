"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useBusinessStore } from "@/store/businessStore";
import { useTenantStore, type Currency } from "@/store/tenantStore";
import { formatMoney } from "@/lib/currency";
import { CURRENCY_CONFIG } from "@/lib/currencyConfig";
import { GhostRole, RoleType } from "@/types/business";
import { v4 as uuidv4 } from "uuid";
import { useOrganizationSync } from "@/hooks/useOrganizationSync";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, ArrowRight, ArrowLeft, UserPlus, AlertCircle, FileText, CheckCircle2, Users } from "lucide-react";
import { getSuggestedSalaryRange } from "@/lib/salaryRange";
import { EstimationSimulator } from "@/components/estimation/EstimationSimulator";
import { dealSchema, type DealFormValues, LEAD_SOURCE_OPTIONS, CAPACITY_ROLE_OPTIONS } from "@/lib/schemas/deal.schema";
import { useDealDetail, useDealMutations } from "@/lib/queries/deals";
import { useLinkedContract } from "@/lib/queries/contracts";

function EditDealContent() {
    useOrganizationSync();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((t) => t.id === activeTenantId)?.currency ?? 'MMK';
    const params = useParams();
    const dealId = params.id as string;

    const deals = useBusinessStore((state) => state.deals);
    const contracts = useBusinessStore((state) => state.contracts);
    const dealQuery = useDealDetail(dealId);
    const linkedContractQuery = useLinkedContract(dealId);
    const { updateDeal } = useDealMutations();
    const dealToEdit = dealQuery.data ?? deals.find((d) => d.id === dealId);
    const employees = useBusinessStore((state) => state.employees);

    // Wizard state — prefer ?tab URL param, then deal's saved wizardStep
    const [activeTab, setActiveTab] = useState<string>(() => {
        const urlTab = searchParams.get('tab');
        if (urlTab === 'estimation' || urlTab === 'staffing' || urlTab === 'contracts') return urlTab;
        const step = dealToEdit?.wizardStep;
        if (step === 'estimation') return 'estimation';
        if (step === 'staffing') return 'staffing';
        return 'context';
    });

    useEffect(() => {
        const urlTab = searchParams.get('tab');
        if (urlTab) return; // URL param wins, don't override
        if (dealToEdit?.wizardStep) {
            const step = dealToEdit.wizardStep;
            if (step === 'context') setActiveTab('context');
            else if (step === 'estimation') setActiveTab('estimation');
            else if (step === 'staffing') setActiveTab('staffing');
        }
    }, [dealToEdit?.wizardStep, searchParams]);

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
            expectedCloseDate: dealToEdit?.expectedCloseDate || "",
            leadSource: dealToEdit?.leadSource,
            clientBudget: dealToEdit?.clientBudget || 0,
            timelineMonths: dealToEdit?.timelineMonths || 1,
            workloadHours: dealToEdit?.workloadHours || 0,
            winProbability: dealToEdit?.winProbability ?? 20,
            workloadDescription: dealToEdit?.workloadDescription || "",
            ghostRoles: dealToEdit?.ghostRoles && dealToEdit.ghostRoles.length > 0
                ? dealToEdit.ghostRoles
                : [{ roleType: 'frontend', quantity: 1, months: 100, minMonthlySalary: 0, maxMonthlySalary: 0 }],
        },
    });

    useEffect(() => {
        if (dealToEdit) {
            form.reset({
                name: dealToEdit.name || "",
                client: dealToEdit.client || "",
                contactName: dealToEdit.contactName || "",
                contactEmail: dealToEdit.contactEmail || "",
                contactPhone: dealToEdit.contactPhone || "",
                expectedCloseDate: dealToEdit.expectedCloseDate || "",
                leadSource: dealToEdit.leadSource,
                clientBudget: dealToEdit.clientBudget || 0,
                timelineMonths: dealToEdit.timelineMonths || 1,
                workloadHours: dealToEdit.workloadHours || 0,
                winProbability: dealToEdit.winProbability ?? 20,
                workloadDescription: dealToEdit.workloadDescription || "",
                ghostRoles: dealToEdit.ghostRoles && dealToEdit.ghostRoles.length > 0
                    ? dealToEdit.ghostRoles
                    : [{ roleType: 'frontend', quantity: 1, months: 100, minMonthlySalary: 0, maxMonthlySalary: 0 }],
            });
        }
    }, [dealToEdit, form]);

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "ghostRoles",
    });

    const ghostRoles = form.watch("ghostRoles") ?? [];
    const clientBudget = form.watch("clientBudget") ?? 0;
    const timelineMonths = form.watch("timelineMonths") ?? 1;
    const workloadHours = form.watch("workloadHours") ?? 0;
    const expectedCloseDate = form.watch("expectedCloseDate");

    // Auto-calculate workload hours from ghost roles
    const computedWorkloadHours = useMemo(() => {
        const months = Number(timelineMonths) || 1;
        return ghostRoles.reduce((total, role) => {
            return total + (role.quantity || 0) * 160 * months * ((role.months || 100) / 100);
        }, 0);
    }, [ghostRoles, timelineMonths]);

    useEffect(() => {
        form.setValue('workloadHours', Math.round(computedWorkloadHours), { shouldValidate: true });
    }, [computedWorkloadHours, form]);

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

        const roles: GhostRole[] = data.ghostRoles.map((gr) => ({
            id: gr.id || uuidv4(),
            roleType: gr.roleType as RoleType,
            quantity: gr.quantity,
            months: gr.months,
            minMonthlySalary: gr.minMonthlySalary,
            maxMonthlySalary: gr.maxMonthlySalary,
        }));

        await updateDeal.mutateAsync({
            id: dealId,
            updates: {
                name: data.name,
                client: data.client,
                contactName: data.contactName,
                contactEmail: data.contactEmail,
                contactPhone: data.contactPhone,
                expectedCloseDate: data.expectedCloseDate || undefined,
                leadSource: data.leadSource,
                clientBudget: data.clientBudget,
                timelineMonths: data.timelineMonths,
                workloadHours: data.workloadHours,
                workloadDescription: data.workloadDescription,
                winProbability: data.winProbability,
                ghostRoles: roles,
            },
        });

        router.push("/crm");
    }

    if (dealQuery.isLoading) {
        return <div className="p-8 text-sm text-muted-foreground">Loading deal...</div>;
    }

    if (dealQuery.isError) {
        return (
            <div className="p-8 space-y-3">
                <p className="text-sm text-destructive">Could not load this deal.</p>
                <Button variant="outline" onClick={() => dealQuery.refetch()}>Retry</Button>
            </div>
        );
    }

    if (!dealToEdit) {
        return <div className="p-8">Deal not found.</div>;
    }

    const savedTotalCost = dealToEdit.totalEstimatedCost ?? 0;
    const savedGrossProfit = dealToEdit.estimatedGrossProfit ?? 0;
    const marginPct = clientBudget > 0 && savedGrossProfit !== undefined
        ? (savedGrossProfit / clientBudget) * 100
        : 0;
    const getMarginColor = (m: number) => {
        if (m < 0) return "text-red-500";
        if (m < 10) return "text-yellow-500";
        return "text-green-500";
    };

    return (
        <div className={`container mx-auto p-6 space-y-6 ${activeTab === 'estimation' ? 'max-w-7xl' : 'max-w-5xl'}`}>
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Edit Deal Profile</h1>
                <p className="text-muted-foreground mt-1">Refine the client context, update cost estimates, and check deliverables.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className={`space-y-6 ${activeTab === 'estimation' ? 'md:col-span-3' : 'md:col-span-2'}`}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Deal Profile</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit, onFormError)} className="space-y-6">
                                    {form.formState.isSubmitted && Object.keys(form.formState.errors).length > 0 && (
                                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                            <span>
                                                {Object.keys(form.formState.errors).length === 1
                                                    ? 'Please fix the highlighted field before saving.'
                                                    : `Please fix ${Object.keys(form.formState.errors).length} fields before saving.`}
                                            </span>
                                        </div>
                                    )}
                                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                        <TabsList className="grid w-full grid-cols-4 mb-6 bg-slate-100/50">
                                            <TabsTrigger value="context">Sales Context</TabsTrigger>
                                            <TabsTrigger value="estimation">Estimation</TabsTrigger>
                                            <TabsTrigger value="staffing">Team Shape</TabsTrigger>
                                            <TabsTrigger value="contracts">Contracts</TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="context" className="space-y-6">
                                            <div className="bg-slate-50/50 p-6 rounded-lg border border-slate-100 space-y-6">
                                                <FormField
                                                    control={form.control}
                                                    name="name"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Deal Name <span className="text-destructive">*</span></FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="e.g. Acme Corp Web App" className="bg-white" {...field} />
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
                                                            <FormLabel>Client / Company Name <span className="text-destructive">*</span></FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="e.g. Acme Corporation" className="bg-white" {...field} />
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
                                                                <FormLabel>Contact Name <span className="text-destructive">*</span></FormLabel>
                                                                <FormControl>
                                                                    <Input placeholder="e.g. Jane Smith" className="bg-white" {...field} />
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
                                                                <FormLabel>Contact Email <span className="text-destructive">*</span></FormLabel>
                                                                <FormControl>
                                                                    <Input type="email" placeholder="jane@acme.com" className="bg-white" {...field} />
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
                                                                <FormLabel>Contact Phone <span className="text-destructive">*</span></FormLabel>
                                                                <FormControl>
                                                                    <Input placeholder="+1 555 000 0000" className="bg-white" {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-6">
                                                    <FormField
                                                        control={form.control}
                                                        name="expectedCloseDate"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Expected Start Date <span className="text-muted-foreground text-xs font-normal">(optional)</span></FormLabel>
                                                                <FormControl>
                                                                    <Input type="date" className="bg-white" {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormItem>
                                                        <FormLabel>Expected End Date</FormLabel>
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
                                                            <FormLabel>Lead Source <span className="text-muted-foreground text-xs font-normal">(optional)</span></FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                                                <FormControl>
                                                                    <SelectTrigger className="bg-white">
                                                                        <SelectValue placeholder="How did they find you?" />
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
                                                                <FormLabel>Client Budget ({CURRENCY_CONFIG[currency].symbol}) <span className="text-destructive">*</span></FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" className="bg-white" {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name="winProbability"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Win Probability (%) <span className="text-destructive">*</span></FormLabel>
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
                                                                <FormLabel>Timeline (Months) <span className="text-destructive">*</span></FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" step="0.5" className="bg-white" {...field} />
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
                                                            <FormLabel>Project Scope / Workload Description <span className="text-muted-foreground text-xs font-normal">(optional)</span></FormLabel>
                                                            <FormControl>
                                                                <Textarea
                                                                    placeholder="Describe the project scope, deliverables, tech stack requirements, and any other details..."
                                                                    className="bg-white min-h-25"
                                                                    {...field}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </TabsContent>

                                        {/* ── Estimation tab: full EstimationSimulator ── */}
                                        <TabsContent value="estimation" className="space-y-4">
                                            <EstimationSimulator initialDealId={dealId} />
                                        </TabsContent>

                                        {/* ── Team Shape tab: ghost roles + hard booking link ── */}
                                        <TabsContent value="staffing" className="space-y-6">
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-sky-100 bg-sky-50/60 p-4">
                                                <div>
                                                    <h3 className="text-sm font-semibold text-slate-900">Planned Team Shape</h3>
                                                    <p className="text-sm text-slate-600 mt-1">
                                                        Define the roles needed for this deal. Named employee booking is handled separately.
                                                    </p>
                                                </div>
                                                <Button type="button" variant="outline" className="bg-white shrink-0" onClick={() => router.push(`/crm/${dealId}/staffing`)}>
                                                    <Users className="mr-2 h-4 w-4" />
                                                    Open Hard Booking
                                                </Button>
                                            </div>

                                            <div className="bg-slate-50/50 p-6 rounded-lg border border-slate-100">
                                                <div className="flex items-center justify-between mb-6 pb-4 border-b">
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-slate-900">Ghost Roles Required</h3>
                                                        <p className="text-xs text-muted-foreground mt-1">Estimate the shape of the team needed to deliver this deal.</p>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            <p className="text-xs text-muted-foreground">Computed Workload</p>
                                                            <p className="text-sm font-semibold text-indigo-600">{Math.round(computedWorkloadHours).toLocaleString()} hrs</p>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="bg-white shadow-sm"
                                                            onClick={() => {
                                                                const range = getSuggestedSalaryRange('frontend', employees);
                                                                append({ roleType: 'frontend', quantity: 1, months: 100, minMonthlySalary: range.min, maxMonthlySalary: range.max });
                                                            }}
                                                        >
                                                            <Plus className="h-4 w-4 mr-2" /> Add Role
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    {fields.map((field, index) => (
                                                        <div key={field.id} className="flex gap-4 items-end bg-white p-4 rounded-lg border shadow-sm overflow-x-auto">
                                                            <FormField
                                                                control={form.control}
                                                                name={`ghostRoles.${index}.roleType`}
                                                                render={({ field }) => (
                                                                    <FormItem className="flex-1 shrink-0 min-w-30">
                                                                        <FormLabel className="text-xs text-slate-500">Role</FormLabel>
                                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                                            <FormControl>
                                                                                <SelectTrigger>
                                                                                    <SelectValue placeholder="Select a role" />
                                                                                </SelectTrigger>
                                                                            </FormControl>
                                                                            <SelectContent>
                                                                                {CAPACITY_ROLE_OPTIONS.map((role) => (
                                                                                    <SelectItem key={role.value} value={role.value}>
                                                                                        {role.label}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name={`ghostRoles.${index}.quantity`}
                                                                render={({ field }) => (
                                                                    <FormItem className="w-20 shrink-0">
                                                                        <FormLabel className="text-xs text-slate-500">Qty</FormLabel>
                                                                        <FormControl>
                                                                            <Input type="number" {...field} />
                                                                        </FormControl>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name={`ghostRoles.${index}.months`}
                                                                render={({ field }) => (
                                                                    <FormItem className="w-20 shrink-0">
                                                                        <FormLabel className="text-xs text-slate-500">Alloc %</FormLabel>
                                                                        <FormControl>
                                                                            <Input type="number" step="10" min="10" max="100" {...field} />
                                                                        </FormControl>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <div className="flex items-end gap-1 shrink-0">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`ghostRoles.${index}.minMonthlySalary`}
                                                                    render={({ field }) => (
                                                                        <FormItem className="w-24 shrink-0">
                                                                            <FormLabel className="text-xs text-slate-500">Min Salary</FormLabel>
                                                                            <FormControl>
                                                                                <Input type="number" {...field} />
                                                                            </FormControl>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`ghostRoles.${index}.maxMonthlySalary`}
                                                                    render={({ field }) => (
                                                                        <FormItem className="w-24 shrink-0">
                                                                            <FormLabel className="text-xs text-slate-500">Max Salary</FormLabel>
                                                                            <FormControl>
                                                                                <Input type="number" {...field} />
                                                                            </FormControl>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-9 w-9 text-slate-400 hover:text-indigo-600 shrink-0"
                                                                    title="Pull salary range from organization"
                                                                    onClick={() => {
                                                                        const gr = form.getValues(`ghostRoles.${index}`);
                                                                        const range = getSuggestedSalaryRange(gr.roleType, employees);
                                                                        form.setValue(`ghostRoles.${index}.minMonthlySalary`, range.min);
                                                                        form.setValue(`ghostRoles.${index}.maxMonthlySalary`, range.max);
                                                                    }}
                                                                >
                                                                    <UserPlus className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                onClick={() => remove(index)}
                                                                disabled={fields.length === 1}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="bg-white p-6 rounded-lg border border-slate-100 shadow-sm space-y-3">
                                                <h3 className="text-sm font-semibold text-slate-900">Booking Boundary</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                                    <div>
                                                        <p className="text-xs text-muted-foreground">Estimated Positions</p>
                                                        <p className="font-semibold text-slate-900">{ghostRoles.reduce((sum, role) => sum + (role.quantity || 0), 0)}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-muted-foreground">Estimated Hours</p>
                                                        <p className="font-semibold text-slate-900">{workloadHours}h</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-muted-foreground">Hard Booked</p>
                                                        <p className="font-semibold text-slate-900">{dealToEdit.hardAssignments?.length || 0} employees</p>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-slate-500">
                                                    Saving this wizard updates team shape. It does not add, remove, or rebalance hard-booked employees.
                                                </p>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="contracts" className="space-y-6">
                                            {dealToEdit.status === 'won' && (() => {
                                                const linkedContract = linkedContractQuery.data ?? contracts.find(c => c.dealId === dealId);
                                                if (linkedContractQuery.isLoading) {
                                                    return (
                                                        <div className="bg-slate-50 border border-slate-100 border-dashed rounded-xl p-8 text-center">
                                                            <p className="text-sm text-slate-500 animate-pulse">Loading contract...</p>
                                                        </div>
                                                    );
                                                }
                                                if (!linkedContract) return (
                                                    <div className="bg-slate-50 border border-slate-100 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center space-y-3">
                                                        <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                                                            <ArrowRight className="h-6 w-6 text-indigo-600" />
                                                        </div>
                                                        <h3 className="text-lg font-semibold text-slate-800">Deal Won</h3>
                                                        <p className="text-sm text-slate-500 max-w-sm">
                                                            This deal has been won. Contract and project records were created automatically.
                                                        </p>
                                                    </div>
                                                );
                                                return (
                                                    <div className="bg-white p-6 rounded-lg border border-slate-100 shadow-sm space-y-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                                                                <FileText className="h-5 w-5 text-emerald-600" />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-sm font-semibold text-slate-900">Contract Created</h3>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {linkedContract.contractNumber || linkedContract.id.slice(0, 8)} · {linkedContract.status} · {formatMoney(linkedContract.totalValue, currency)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() => router.push('/contracts')}
                                                        >
                                                            View in Contracts
                                                        </Button>
                                                    </div>
                                                );
                                            })()}
                                            {dealToEdit.status !== 'won' && (
                                                <div className="bg-slate-50 border border-slate-100 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center space-y-3">
                                                    <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                                                        <ArrowRight className="h-6 w-6 text-indigo-600" />
                                                    </div>
                                                    <h3 className="text-lg font-semibold text-slate-800">Deliverables & Invoicing</h3>
                                                    <p className="text-sm text-slate-500 max-w-sm">
                                                        Contract generation, milestone planning, and project scaffolding will unlock once this deal is <b>Won</b>.
                                                    </p>
                                                </div>
                                            )}
                                        </TabsContent>
                                    </Tabs>

                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-6 border-t mt-6">
                                        <p className="text-xs text-muted-foreground">
                                            {activeTab === 'context' && "Fill in the client details and click Next to move to Estimation."}
                                            {activeTab === 'estimation' && "Build the cost estimate above, then continue to Team Shape."}
                                            {activeTab === 'staffing' && "Define ghost roles here. Use Hard Booking for named employee assignments."}
                                            {activeTab === 'contracts' && "Contract details are managed after the deal is won."}
                                        </p>
                                        <div className="flex gap-2">
                                            {(activeTab === 'estimation' || activeTab === 'staffing') && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="lg"
                                                    onClick={() => {
                                                        if (activeTab === 'estimation') setActiveTab('context');
                                                        if (activeTab === 'staffing') setActiveTab('estimation');
                                                    }}
                                                >
                                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                                    Previous
                                                </Button>
                                            )}
                                            {activeTab === 'context' && (
                                                <Button
                                                    type="button"
                                                    size="lg"
                                                    disabled={updateDeal.isPending}
                                                    onClick={async () => {
                                                        const valid = await form.trigger(['name', 'client', 'contactName', 'contactEmail', 'contactPhone', 'clientBudget', 'timelineMonths']);
                                                        if (!valid) {
                                                            onFormError();
                                                            return;
                                                        }
                                                        const data = form.getValues();
                                                        await updateDeal.mutateAsync({
                                                            id: dealId,
                                                            updates: {
                                                                name: data.name,
                                                                client: data.client,
                                                                contactName: data.contactName,
                                                                contactEmail: data.contactEmail,
                                                                contactPhone: data.contactPhone,
                                                                expectedCloseDate: data.expectedCloseDate || undefined,
                                                                leadSource: data.leadSource,
                                                                clientBudget: data.clientBudget,
                                                                timelineMonths: data.timelineMonths,
                                                                workloadHours: data.workloadHours,
                                                                workloadDescription: data.workloadDescription,
                                                                winProbability: data.winProbability,
                                                                wizardStep: 'estimation',
                                                            },
                                                        });
                                                        setActiveTab('estimation');
                                                    }}
                                                >
                                                    {updateDeal.isPending ? 'Saving...' : 'Next'}
                                                    <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            )}
                                            {activeTab === 'estimation' && (
                                                <Button
                                                    type="button"
                                                    size="lg"
                                                    onClick={() => setActiveTab('staffing')}
                                                >
                                                    Continue to Team Shape
                                                    <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            )}
                                            {activeTab === 'staffing' && (
                                                <>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="lg"
                                                        onClick={() => router.push(`/crm/${dealId}/staffing`)}
                                                    >
                                                        <Users className="mr-2 h-4 w-4" />
                                                        Hard Booking
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="lg"
                                                        disabled={updateDeal.isPending}
                                                        onClick={async () => {
                                                            const data = form.getValues();
                                                            const roles: GhostRole[] = data.ghostRoles.map((gr) => ({
                                                                id: gr.id || uuidv4(),
                                                                roleType: gr.roleType as RoleType,
                                                                quantity: gr.quantity,
                                                                months: gr.months,
                                                                minMonthlySalary: gr.minMonthlySalary,
                                                                maxMonthlySalary: gr.maxMonthlySalary,
                                                            }));
                                                            await updateDeal.mutateAsync({
                                                                id: dealId,
                                                                updates: {
                                                                    name: data.name,
                                                                    client: data.client,
                                                                    contactName: data.contactName,
                                                                    contactEmail: data.contactEmail,
                                                                    contactPhone: data.contactPhone,
                                                                    expectedCloseDate: data.expectedCloseDate || undefined,
                                                                    leadSource: data.leadSource,
                                                                    clientBudget: data.clientBudget,
                                                                    timelineMonths: data.timelineMonths,
                                                                    workloadHours: data.workloadHours,
                                                                    workloadDescription: data.workloadDescription,
                                                                    winProbability: data.winProbability,
                                                                    ghostRoles: roles,
                                                                    wizardStep: 'complete',
                                                                },
                                                            });
                                                            router.push('/crm');
                                                        }}
                                                    >
                                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                                        {updateDeal.isPending ? 'Saving...' : 'Save Deal'}
                                                    </Button>
                                                </>
                                            )}
                                            {activeTab === 'contracts' && (
                                                <Button type="submit" size="lg" disabled={updateDeal.isPending}>
                                                    {updateDeal.isPending ? 'Saving...' : 'Save Changes'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </div>

                {/* Live Financials sidebar — hidden on estimation tab (simulator has its own Margin panel) */}
                <div className={`space-y-6 ${activeTab === 'estimation' ? 'hidden' : ''}`}>
                    <Card className="sticky top-6 shadow-sm border-slate-100">
                        <CardHeader className="bg-slate-50/80 pb-4 border-b border-slate-100 rounded-t-xl">
                            <CardTitle className="text-lg">Live Financials</CardTitle>
                            <CardDescription>Last saved estimation values</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-5">
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Overhead</span>
                                    <span className="font-medium text-red-500/80">+{formatMoney(dealToEdit.overheadCost ?? 0, currency)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Risk Buffer</span>
                                    <span className="font-medium text-red-500/80">+{formatMoney(dealToEdit.bufferCost ?? 0, currency)}</span>
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-5">
                                <div className="flex justify-between font-bold text-slate-800 mb-3">
                                    <span>Total Est. Cost</span>
                                    <span>{formatMoney(savedTotalCost, currency)}</span>
                                </div>
                                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <span className="font-bold text-slate-800">Gross Profit</span>
                                    <div className="flex flex-col items-end">
                                        <span className={`font-bold text-lg ${getMarginColor(marginPct)}`}>
                                            {formatMoney(savedGrossProfit, currency)}
                                        </span>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${getMarginColor(marginPct)}`}>
                                            {marginPct.toFixed(1)}% Margin
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function EditDealPage() {
    return (
        <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading...</div>}>
            <EditDealContent />
        </Suspense>
    );
}
