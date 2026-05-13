"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { AITeamBuilderResult } from "@/types/aiTeamBuilder";
import { useForm, useFieldArray } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useBusinessStore } from "@/store/businessStore";
import { useTenantStore, type Currency } from "@/store/tenantStore";
import { formatMoney } from "@/lib/currency";
import { CURRENCY_CONFIG } from "@/lib/currencyConfig";
import { Deal, GhostRole, RoleType } from "@/types/business";
import { v4 as uuidv4 } from "uuid";

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
import { Plus, Trash2, ArrowRight, Upload, UserPlus, AlertCircle } from "lucide-react";
import { LEAD_SOURCE_OPTIONS, CAPACITY_ROLE_OPTIONS } from "@/lib/schemas/deal.schema";
import { calculateOverhead, calculateRiskBuffer, calculateTotalEstimatedCost, calculateEstimatedGrossProfit } from "@/lib/calculations";
import { getSuggestedSalaryRange } from "@/lib/salaryRange";
import { AITeamBuilder } from "@/components/crm/AITeamBuilder";
import { dealSchema, type DealFormValues } from "@/lib/schemas/deal.schema";
import { useDealMutations } from "@/lib/queries/deals";
import { usePermission } from "@/hooks/usePermission";
import { useOrganizationSync } from "@/hooks/useOrganizationSync";
import { OrgSyncErrorBanner } from "@/components/OrgSyncErrorBanner";
// Table imports removed alongside the Staffing tab — it owned the only Table
// usage in this file. Hard-booking lives at /crm/[id]/staffing now.

export default function NewDealPage() {
    // Hydrate employees / roles / skills / settings into the store. Salary
    // range suggestions, the AI Team Builder employee pool, and computed
    // workload hours all depend on these. Without this sync, a direct
    // visit (e.g. a deep link) shows zero-range salary suggestions and
    // an empty AI candidate pool.
    const { syncing: orgSyncing, syncError: orgSyncError, retry: retryOrgSync } = useOrganizationSync();

    const router = useRouter();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((t) => t.id === activeTenantId)?.currency ?? 'MMK';
    const companySettings = useBusinessStore((state) => state.companySettings);
    const employees = useBusinessStore((state) => state.employees);
    const { createDeal } = useDealMutations();
    const { allowed: canManageCrm, reason: rbacReason } = usePermission('manage_crm');

    const [dealId] = useState(() => uuidv4());
    const [workloadDocText, setWorkloadDocText] = useState<string | undefined>(undefined);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
    const [acceptedAIResult, setAcceptedAIResult] = useState<AITeamBuilderResult | null>(null);

    function handleAcceptAIResult(result: AITeamBuilderResult) {
        setAcceptedAIResult(result);

        // Derive ghost roles from the AI team composition. The wizard writes
        // estimated team SHAPE (ghost roles) only — specific employees
        // (hardAssignments) are assigned later on /crm/[id]/staffing, so the
        // suggested members aren't materialised as hard bookings here.
        const roleGroups = result.team.reduce((acc, member) => {
            if (!acc[member.role]) {
                acc[member.role] = { members: [], minSalary: Infinity, maxSalary: -Infinity };
            }
            acc[member.role].members.push(member);
            acc[member.role].minSalary = Math.min(acc[member.role].minSalary, member.monthlySalary);
            acc[member.role].maxSalary = Math.max(acc[member.role].maxSalary, member.monthlySalary);
            return acc;
        }, {} as Record<string, { members: typeof result.team; minSalary: number; maxSalary: number }>);

        const newGhostRoles: GhostRole[] = Object.entries(roleGroups).map(([roleName, group]) => ({
            id: uuidv4(),
            roleType: roleName as RoleType,
            quantity: group.members.length,
            months: 100, // percentage allocation — AI result always means 100%
            minMonthlySalary: group.minSalary,
            maxMonthlySalary: group.maxSalary,
        }));

        form.setValue('ghostRoles', newGhostRoles);
    }

    const form = useForm<DealFormValues>({
        resolver: zodResolver(dealSchema) as Resolver<DealFormValues>,
        mode: 'onBlur',
        reValidateMode: 'onChange',
        defaultValues: {
            name: "",
            client: "",
            contactName: "",
            contactEmail: "",
            contactPhone: "",
            expectedCloseDate: "",
            leadSource: undefined,
            clientBudget: 0,
            timelineMonths: 1,
            workloadHours: 0,
            winProbability: 10,
            workloadDescription: "",
            ghostRoles: [(() => {
                const range = getSuggestedSalaryRange('frontend', useBusinessStore.getState().employees);
                return { roleType: 'frontend', quantity: 1, months: 100, minMonthlySalary: range.min, maxMonthlySalary: range.max };
            })()],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "ghostRoles",
    });

    // The default ghost role gets seeded from `useBusinessStore.getState().employees`
    // at useState time. On a direct visit to /crm/new (cold cache) employees
    // may not be hydrated yet, so the default role ends up with min=max=0.
    // Once useOrganizationSync populates employees, patch the salary range on
    // the default role ONCE — but only while the user hasn't typed a number
    // into either salary field (signalled by both being 0). `form.setValue`
    // here is not a React setState so it doesn't trip set-state-in-effect.
    const defaultSalaryPatchedRef = useRef(false);
    useEffect(() => {
        if (defaultSalaryPatchedRef.current) return;
        if (!employees.length) return;
        const currentRoles = form.getValues('ghostRoles');
        if (!currentRoles?.length) return;
        const role = currentRoles[0];
        // Only patch if the user hasn't touched the salary fields.
        if ((role.minMonthlySalary ?? 0) !== 0 || (role.maxMonthlySalary ?? 0) !== 0) {
            defaultSalaryPatchedRef.current = true;
            return;
        }
        const range = getSuggestedSalaryRange(role.roleType, employees);
        if (range.min === 0 && range.max === 0) return; // nothing to suggest
        form.setValue('ghostRoles.0.minMonthlySalary', range.min, { shouldDirty: false });
        form.setValue('ghostRoles.0.maxMonthlySalary', range.max, { shouldDirty: false });
        defaultSalaryPatchedRef.current = true;
    }, [employees, form]);

    const ghostRoles = form.watch("ghostRoles");
    const clientBudget = form.watch("clientBudget");
    const timelineMonths = form.watch("timelineMonths");
    const workloadHours = form.watch("workloadHours");
    const workloadDescription = form.watch("workloadDescription") || "";
    const expectedCloseDate = form.watch("expectedCloseDate");

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type === 'text/plain') {
            const text = await file.text();
            setWorkloadDocText(text);
            setUploadedFileName(file.name);
        }
    }

    // Auto-calculate workload hours from ghost roles. `monthlyCapacity` falls
    // back to 160 when company settings haven't hydrated, matching the
    // historical default.
    const monthlyCapacity = companySettings.defaultMonthlyCapacityHours || 160;
    const computedWorkloadHours = useMemo(() => {
        const months = Number(timelineMonths) || 1;
        return ghostRoles.reduce((total, role) => {
            return total + (role.quantity || 0) * monthlyCapacity * months * ((role.months || 100) / 100);
        }, 0);
    }, [ghostRoles, timelineMonths, monthlyCapacity]);

    useEffect(() => {
        form.setValue('workloadHours', Math.round(computedWorkloadHours), { shouldValidate: true });
    }, [computedWorkloadHours, form]);

    // Base labor cost = qty × allocationFraction × timelineMonths × avgSalary.
    // Previously this skipped × timelineMonths, undercounting by N× for an
    // N-month deal. `role.months` is an allocation percentage, not a month count.
    const tlMonths = Number(timelineMonths) || 1;
    const manualBaseLaborCost = ghostRoles.reduce((total, role) => {
        const avgSalary = ((role.minMonthlySalary || 0) + (role.maxMonthlySalary || 0)) / 2;
        return total + (role.quantity || 0) * ((role.months || 100) / 100) * tlMonths * avgSalary;
    }, 0);

    // Base labor cost: prefer the fresh AI result, else derive from the
    // ghost-roles manual estimate. The wizard no longer manages
    // hardAssignments, so there's no assignment-based fallback to consider.
    const baseLaborCost = acceptedAIResult?.baseLaborCost ?? manualBaseLaborCost;
    const overheadCost = calculateOverhead(baseLaborCost, companySettings.overheadPercentage);
    const bufferCost = calculateRiskBuffer(baseLaborCost, overheadCost, companySettings.bufferPercentage);
    const totalEstimatedCost = calculateTotalEstimatedCost(baseLaborCost, overheadCost, bufferCost);
    const estimatedGrossProfit = calculateEstimatedGrossProfit(clientBudget, totalEstimatedCost);

    const profitMargin = clientBudget > 0 ? (estimatedGrossProfit / clientBudget) * 100 : 0;

    const getMarginColor = (margin: number) => {
        if (margin < 0) return "text-red-500";
        if (margin < 10) return "text-yellow-500";
        return "text-green-500";
    };

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
        const roles: GhostRole[] = data.ghostRoles.map((gr) => ({
            id: uuidv4(),
            roleType: gr.roleType as RoleType,
            quantity: gr.quantity,
            months: gr.months,
            minMonthlySalary: gr.minMonthlySalary,
            maxMonthlySalary: gr.maxMonthlySalary,
        }));

        const newDeal: Deal = {
            id: dealId,
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
            winProbability: data.winProbability,
            workloadDescription: data.workloadDescription,
            status: "lead",
            ghostRoles: roles,
            // hardAssignments are owned by /crm/[id]/staffing — leave empty here.
            hardAssignments: [],
            baseLaborCost: acceptedAIResult?.baseLaborCost ?? baseLaborCost,
            overheadCost: acceptedAIResult?.overheadCost ?? overheadCost,
            bufferCost: acceptedAIResult?.bufferCost ?? bufferCost,
            totalEstimatedCost: acceptedAIResult?.totalEstimatedCost ?? totalEstimatedCost,
            estimatedGrossProfit: acceptedAIResult?.estimatedGrossProfit ?? estimatedGrossProfit,
            targetMargin: 30,
            wizardStep: 'estimation',
        };

        const created = await createDeal.mutateAsync(newDeal);
        router.push(`/crm/edit/${created.id}`);
    }

    // Route-level RBAC. Placed AFTER every hook in this component so the order
    // of hooks stays stable across renders (Rules of Hooks). Roles without
    // `manage_crm` (e.g. Delivery, HR) get an explicit denial — defence in
    // depth alongside the sidebar/button guards on /crm.
    if (!canManageCrm) {
        return (
            <div className="container mx-auto p-6 max-w-3xl space-y-4">
                <h1 className="text-2xl font-bold tracking-tight">Permission required</h1>
                <p className="text-sm text-muted-foreground">{rbacReason}</p>
                <Button variant="outline" onClick={() => router.push('/crm')}>Back to pipeline</Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-5xl space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Draft New Deal</h1>
                <p className="text-[#4a4a4a] mt-1">Structure the client context, estimate costs, and prepare deliverables.</p>
            </div>

            <OrgSyncErrorBanner
                error={orgSyncError}
                onRetry={retryOrgSync}
                retrying={orgSyncing}
                context="Salary-range suggestions and the AI candidate pool will be empty until organization data loads."
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
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
                            <Tabs defaultValue="context" className="w-full">
                                {/* Staffing tab removed: ghost-role planning lives in
                                    Cost Estimate; named-employee hard booking lives at
                                    /crm/[id]/staffing as the single canonical writer of
                                    `hardAssignments`. New deals redirect to /crm/edit/[id]
                                    on save and the user assigns staff from there. */}
                                <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100/50">
                                    <TabsTrigger value="context">Sales Context</TabsTrigger>
                                    <TabsTrigger value="estimation">Cost Estimate</TabsTrigger>
                                </TabsList>

                                        <TabsContent value="context" className="space-y-6">
                                            <div className="bg-slate-50/50 p-6 rounded-lg border border-[#e6e9ee] space-y-6">
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
                                                                <FormLabel>Expected Start Date <span className="text-[#4a4a4a] text-xs font-normal">(optional)</span></FormLabel>
                                                                <FormControl>
                                                                    <Input type="date" className="bg-white" {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormItem>
                                                        <FormLabel>Expected End Date</FormLabel>
                                                        <div className="h-9 flex items-center rounded-md border border-[#e6e9ee] bg-white px-3 text-sm text-[#4a4a4a]">
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
                                                            <FormLabel>Lead Source <span className="text-[#4a4a4a] text-xs font-normal">(optional)</span></FormLabel>
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
                                                            <FormLabel>Project Scope / Workload Description <span className="text-[#4a4a4a] text-xs font-normal">(optional)</span></FormLabel>
                                                            <FormControl>
                                                                <Textarea
                                                                    placeholder="Describe the project scope, deliverables, tech stack requirements, and any other details that will help AI assemble the right team..."
                                                                    className="bg-white min-h-[100px]"
                                                                    {...field}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <div>
                                                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                        Upload Brief (.txt) <span className="text-[#4a4a4a] font-normal">— optional</span>
                                                    </label>
                                                    <div className="mt-2 flex items-center gap-3">
                                                        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#e6e9ee] bg-white text-sm font-medium text-slate-700 hover:bg-white shadow-sm transition-colors">
                                                            <Upload className="h-4 w-4" />
                                                            Choose file
                                                            <input
                                                                type="file"
                                                                accept=".txt"
                                                                className="hidden"
                                                                onChange={handleFileUpload}
                                                            />
                                                        </label>
                                                        {uploadedFileName && (
                                                            <span className="text-xs text-[#8a8a8a]">{uploadedFileName}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="estimation" className="space-y-6">
                                            <div className="bg-slate-50/50 p-6 rounded-lg border border-[#e6e9ee]">
                                                <div className="flex items-center justify-between mb-6 pb-4 border-b">
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-[#171717]">Ghost Roles Required</h3>
                                                        <p className="text-xs text-[#4a4a4a] mt-1">Estimate the shape of the team needed to deliver this deal.</p>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            <p className="text-xs text-[#8a8a8a]">Computed Workload</p>
                                                            <p className="text-sm font-semibold text-[#00a7f4]">{Math.round(computedWorkloadHours).toLocaleString()} hrs</p>
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
                                                                    <FormItem className="flex-1 shrink-0 min-w-[120px]">
                                                                        <FormLabel className="text-xs text-[#8a8a8a]">Role</FormLabel>
                                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                                            <FormControl>
                                                                                <SelectTrigger>
                                                                                    <SelectValue placeholder="Select Role" />
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
                                                                        <FormLabel className="text-xs text-[#8a8a8a]">Qty</FormLabel>
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
                                                                        <FormLabel className="text-xs text-[#8a8a8a]">Alloc %</FormLabel>
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
                                                                             <FormLabel className="text-xs text-[#8a8a8a]">Min Salary</FormLabel>
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
                                                                             <FormLabel className="text-xs text-[#8a8a8a]">Max Salary</FormLabel>
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
                                                                     className="h-9 w-9 text-[#8a8a8a] hover:text-indigo-600 shrink-0"
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
                                                                className="text-[#8a8a8a] hover:text-red-600 hover:bg-red-50"
                                                                onClick={() => remove(index)}
                                                                disabled={fields.length === 1}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* "Previously Built Team" card removed: on /crm/new there's
                                                no existing deal yet, so hardAssignments are always empty.
                                                The Live Financials sidebar already shows labor/overhead/buffer
                                                summary. */}
                                            <AITeamBuilder
                                                dealId={dealId}
                                                clientBudget={clientBudget}
                                                timelineMonths={timelineMonths}
                                                workloadHours={workloadHours}
                                                workloadDescription={workloadDescription}
                                                workloadDocumentText={workloadDocText}
                                                ghostRoles={ghostRoles}
                                                onAccept={handleAcceptAIResult}
                                            />
                                        </TabsContent>


                                    </Tabs>

                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-6 border-t mt-6">
                                        <p className="text-xs text-[#4a4a4a]">
                                            Fields marked <span className="text-destructive">*</span> are required.
                                        </p>
                                        <Button type="submit" size="lg" className="w-full sm:w-auto shadow-sm" disabled={createDeal.isPending}>
                                            {createDeal.isPending ? 'Saving...' : 'Next'}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </div>

                {/* Live Calculation Output Sidebar */}
                <div className="space-y-6">
                    <Card className="sticky top-6 shadow-sm border-[#e6e9ee]">
                        <CardHeader className="bg-slate-50/80 pb-4 border-b border-[#e6e9ee] rounded-t-xl">
                            <CardTitle className="text-lg">Live Financials</CardTitle>
                            <CardDescription>Estimated metrics based on inputs</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-5">
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8a8a8a]">Base Labor Cost</span>
                                    <span className="font-medium text-slate-700">{formatMoney(baseLaborCost, currency)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8a8a8a]">Overhead ({companySettings.overheadPercentage}%)</span>
                                    <span className="font-medium text-red-500/80">+{formatMoney(overheadCost, currency)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#8a8a8a]">Risk Buffer ({companySettings.bufferPercentage}%)</span>
                                    <span className="font-medium text-red-500/80">+{formatMoney(bufferCost, currency)}</span>
                                </div>
                            </div>

                            <div className="border-t border-[#e6e9ee] pt-5">
                                <div className="flex justify-between font-bold text-slate-800 mb-3">
                                    <span>Total Est. Cost</span>
                                    <span>{formatMoney(totalEstimatedCost, currency)}</span>
                                </div>
                                <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-[#e6e9ee]">
                                    <span className="font-bold text-slate-800">Gross Profit</span>
                                    <div className="flex flex-col items-end">
                                        <span className={`font-bold text-lg ${getMarginColor(profitMargin)}`}>
                                            {formatMoney(estimatedGrossProfit, currency)}
                                        </span>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${getMarginColor(profitMargin)}`}>
                                            {profitMargin.toFixed(1)}% Margin
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