"use client";

/**
 * Project Pipeline — new deal intake (③ Nego start).
 *
 * Captures only the customer inputs the manager's spec assigns to ③ Nego:
 * deal/client identity, contact info, requirement description, target
 * timeline, estimate budget, lead source. Cost calculation, ghost-role
 * planning, and AI Team Builder belong to ④ Estimation; hard-booking
 * belongs to ⑥ Task Assign — those features were hidden from this menu
 * in the chg-009 Phase A prep cleanup. The component files still exist
 * under components/crm/ ready to be relocated to their owning menus.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useTenantStore, type Currency } from "@/store/tenantStore";
import { CURRENCY_CONFIG } from "@/lib/currencyConfig";
import { Deal } from "@/types/business";
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
import { Upload, AlertCircle, ArrowLeft } from "lucide-react";
import { LEAD_SOURCE_OPTIONS, dealSchema, type DealFormValues } from "@/lib/schemas/deal.schema";
import { useDealMutations } from "@/lib/queries/deals";
import { usePermission } from "@/hooks/usePermission";
import { OtPolicySection } from "@/components/project-pipeline/OtPolicySection";
import { CustomerRequirementsSection } from "@/components/project-pipeline/CustomerRequirementsSection";

export default function NewDealPage() {
    const router = useRouter();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((t) => t.id === activeTenantId)?.currency ?? 'MMK';
    const { createDeal } = useDealMutations();
    const { allowed: canManageCrm, reason: rbacReason } = usePermission('manage_crm');

    const [dealId] = useState(() => uuidv4());
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

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
            winProbability: 30,
            workloadDescription: "",
            otPolicyModel: null,
            otRatePerHour: null,
            otIncludedHoursPerMonth: null,
            otNotes: null,
            customerSupportObligations: null,
            outOfScopePolicy: null,
            workingHours: null,
            testingRange: null,
            // The schema still requires at least one ghost role (legacy).
            // Estimation owns ghost-role detail; this menu just seeds an
            // empty placeholder so the schema validator passes.
            ghostRoles: [{ roleType: 'frontend', quantity: 1, months: 100, minMonthlySalary: 0, maxMonthlySalary: 0 }],
        },
    });

    const expectedCloseDate = form.watch("expectedCloseDate");
    const timelineMonths = form.watch("timelineMonths");

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type === 'text/plain') {
            const text = await file.text();
            form.setValue('workloadDescription', text);
            setUploadedFileName(file.name);
        }
    }

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
            status: "lead",
            // Cost / staffing fields are now owned by ④ Estimation and
            // ⑥ Task Assign respectively. Project Pipeline doesn't write them.
            ghostRoles: [],
            hardAssignments: [],
            wizardStep: 'context',
        };

        await createDeal.mutateAsync(newDeal);
        toast.success(`Deal "${data.name}" created`);
        router.push('/project-pipeline');
    }

    if (!canManageCrm) {
        return (
            <div className="container mx-auto p-6 max-w-3xl space-y-4">
                <h1 className="text-2xl font-bold tracking-tight">Permission required</h1>
                <p className="text-sm text-muted-foreground">{rbacReason}</p>
                <Button variant="outline" onClick={() => router.push('/project-pipeline')}>Back to pipeline</Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-3xl space-y-6">
            <div className="flex items-start gap-3">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => router.push('/project-pipeline')}
                    aria-label="Back to pipeline"
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">New Deal</h1>
                    <p className="text-[#4a4a4a] mt-1">
                        Capture the customer&apos;s intake. Estimation calculates the cost; this menu owns negotiation and contract drafting.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Deal Profile</CardTitle>
                    <CardDescription>
                        Required fields drive the AI contract drafting wizard later. The Estimation menu reads
                        these values when calculating cost and team structure.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit, onFormError)} className="space-y-6">
                            {form.formState.isSubmitted && Object.keys(form.formState.errors).length > 0 && (
                                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>
                                        Please fix {Object.keys(form.formState.errors).length} highlighted
                                        field{Object.keys(form.formState.errors).length === 1 ? '' : 's'} before saving.
                                    </span>
                                </div>
                            )}

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
                                            <FormLabel>Estimate Budget ({CURRENCY_CONFIG[currency].symbol}) <span className="text-destructive">*</span></FormLabel>
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
                                            <FormLabel>Target Timeline (Months) <span className="text-destructive">*</span></FormLabel>
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
                                        <FormLabel>Requirement Description <span className="text-muted-foreground text-xs font-normal">(feeds the AI contract drafting prompt)</span></FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="What does the customer need? Tech stack, scope, deliverables, integrations, special working-hours requirements, testing scope..."
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

                            <div>
                                <label className="text-sm font-medium leading-none">
                                    Upload Brief (.txt) <span className="text-muted-foreground font-normal">— optional</span>
                                </label>
                                <div className="mt-2 flex items-center gap-3">
                                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors">
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
                                        <span className="text-xs text-slate-500">{uploadedFileName}</span>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-500 mt-2">
                                    Pastes the file contents into the Requirement Description field above.
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="lg"
                                    onClick={() => router.push('/project-pipeline')}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" size="lg" disabled={createDeal.isPending}>
                                    {createDeal.isPending ? 'Creating…' : 'Create Deal'}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
