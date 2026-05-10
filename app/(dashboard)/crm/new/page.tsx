"use client";

import { useState, useMemo, useEffect } from "react";
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export default function NewDealPage() {
    const router = useRouter();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((t) => t.id === activeTenantId)?.currency ?? 'MMK';
    const companySettings = useBusinessStore((state) => state.companySettings);
    const employees = useBusinessStore((state) => state.employees);
    const { createDeal } = useDealMutations();

    const [dealId] = useState(() => uuidv4());
    const [workloadDocText, setWorkloadDocText] = useState<string | undefined>(undefined);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
    const [acceptedAIResult, setAcceptedAIResult] = useState<AITeamBuilderResult | null>(null);

    const [hardAssignments, setHardAssignments] = useState<{ employeeId: string; allocatedHours: number }[]>([]);
    // Per-ghost-role input state for staffing add rows (key = ghost role index)
    const [staffingInputs, setStaffingInputs] = useState<Record<number, { employeeId: string; hours: number }>>({});

    function addHardAssignmentForRole(grIndex: number) {
        const input = staffingInputs[grIndex];
        if (!input?.employeeId || (input.hours || 0) <= 0) return;
        const already = hardAssignments.find(a => a.employeeId === input.employeeId);
        if (already) {
            setHardAssignments(prev => prev.map(a => a.employeeId === input.employeeId ? { ...a, allocatedHours: input.hours } : a));
        } else {
            setHardAssignments(prev => [...prev, { employeeId: input.employeeId, allocatedHours: input.hours }]);
        }
        setStaffingInputs(prev => ({ ...prev, [grIndex]: { employeeId: '', hours: 0 } }));
    }

    function removeHardAssignment(employeeId: string) {
        setHardAssignments(prev => prev.filter(a => a.employeeId !== employeeId));
    }

    function updateAssignmentHours(employeeId: string, hours: number) {
        setHardAssignments(prev => prev.map(a => a.employeeId === employeeId ? { ...a, allocatedHours: hours } : a));
    }

    function handleAcceptAIResult(result: AITeamBuilderResult) {
        setAcceptedAIResult(result);

        // Derive ghost roles from AI team composition
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

        setHardAssignments(result.team.map(m => ({
            employeeId: m.employeeId,
            allocatedHours: m.allocatedHours,
        })));
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

    const manualBaseLaborCost = ghostRoles.reduce((total, role) => {
        const avgSalary = ((role.minMonthlySalary || 0) + (role.maxMonthlySalary || 0)) / 2;
        return total + (role.quantity || 0) * (role.months || 100) / 100 * avgSalary;
    }, 0);

    const assignmentBaseLaborCost = hardAssignments.reduce((total, a) => {
        const emp = employees.find(e => e.id === a.employeeId);
        return total + (a.allocatedHours || 0) * (emp?.costPerHour || 0);
    }, 0);

    const baseLaborCost = acceptedAIResult?.baseLaborCost ?? (hardAssignments.length > 0 ? assignmentBaseLaborCost : manualBaseLaborCost);
    const overheadCost = calculateOverhead(baseLaborCost, companySettings.overheadPercentage);
    const bufferCost = calculateRiskBuffer(baseLaborCost, companySettings.bufferPercentage);
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
            hardAssignments: hardAssignments.length > 0 ? hardAssignments : [],
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

    return (
        <div className="container mx-auto p-6 max-w-5xl space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Draft New Deal</h1>
                <p className="text-[#4a4a4a] mt-1">Structure the client context, estimate costs, and prepare deliverables.</p>
            </div>

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
                                <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-100/50">
                                    <TabsTrigger value="context">Sales Context</TabsTrigger>
                                    <TabsTrigger value="estimation">Cost Estimate</TabsTrigger>
                                    <TabsTrigger value="staffing">Staffing</TabsTrigger>
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

                                            {hardAssignments.length > 0 && (
                                                <Card className="border-[#e6e9ee] shadow-sm">
                                                    <CardHeader className="pb-3 bg-slate-50/80 border-b border-[#e6e9ee] rounded-t-xl">
                                                        <CardTitle className="text-base">Previously Built Team</CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="pt-4 space-y-4">
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                            {hardAssignments.map(a => {
                                                                const emp = employees.find(e => e.id === a.employeeId);
                                                                if (!emp) return null;
                                                                const totalCost = (a.allocatedHours || 0) * (emp.costPerHour || 0);
                                                                return (
                                                                    <div key={a.employeeId} className="flex flex-col gap-1.5 p-3 rounded-lg border border-[#e6e9ee] bg-white shadow-sm">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                                                                                {emp.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <p className="text-sm font-semibold text-slate-800 truncate">{emp.name}</p>
                                                                                <p className="text-xs text-[#8a8a8a]">{emp.capacityRole}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex justify-between text-xs text-[#8a8a8a] mt-1 pt-1.5 border-t border-slate-50">
                                                                            <span>{a.allocatedHours}h allocated</span>
                                                                            <span className="font-medium text-slate-700">{formatMoney(totalCost, currency)}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        <div className="space-y-2 text-sm">
                                                            <div className="flex justify-between">
                                                                <span className="text-[#8a8a8a]">Labor Cost</span>
                                                                <span className="font-medium text-slate-700">{formatMoney(baseLaborCost, currency)}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-[#8a8a8a]">Overhead</span>
                                                                <span className="font-medium text-red-500/80">+{formatMoney(overheadCost, currency)}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-[#8a8a8a]">Risk Buffer</span>
                                                                <span className="font-medium text-red-500/80">+{formatMoney(bufferCost, currency)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="border-t border-[#e6e9ee] pt-3 space-y-2">
                                                            <div className="flex justify-between font-bold text-slate-800">
                                                                <span>Total Cost</span>
                                                                <span>{formatMoney(totalEstimatedCost, currency)}</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm">
                                                                <span className="text-[#8a8a8a]">Client Budget</span>
                                                                <span className="font-medium text-slate-700">{formatMoney(clientBudget, currency)}</span>
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            )}
                                            <AITeamBuilder
                                                dealId={dealId}
                                                clientBudget={clientBudget}
                                                timelineMonths={timelineMonths}
                                                workloadHours={workloadHours}
                                                workloadDescription={workloadDescription}
                                                workloadDocumentText={workloadDocText}
                                                onAccept={handleAcceptAIResult}
                                            />
                                        </TabsContent>

                                        <TabsContent value="staffing" className="space-y-6">
                                            {ghostRoles.length === 0 ? (
                                                <div className="bg-white border border-[#e6e9ee] border-dashed rounded-xl p-8 text-center">
                                                    <p className="text-sm text-[#8a8a8a]">No roles defined in Cost Estimate yet. Add roles in the Cost Estimate tab first.</p>
                                                </div>
                                            ) : (
                                                ghostRoles.map((gr, grIndex) => {
                                                    const roleLabel = CAPACITY_ROLE_OPTIONS.find(r => r.value === gr.roleType)?.label || gr.roleType;

                                                    const assigned = hardAssignments.filter(a => {
                                                        const emp = employees.find(e => e.id === a.employeeId);
                                                        if (!emp) return false;
                                                        return emp.capacityRole === gr.roleType;
                                                    });

                                                    const assignedCount = assigned.length;
                                                    const canAddMore = assignedCount < gr.quantity;

                                                    const availableEmployees = employees.filter(e =>
                                                        e.status === 'Active' &&
                                                        e.capacityRole === gr.roleType &&
                                                        e.monthlySalary >= gr.minMonthlySalary &&
                                                        e.monthlySalary <= gr.maxMonthlySalary &&
                                                        !hardAssignments.some(a => a.employeeId === e.id)
                                                    );

                                                    const input = staffingInputs[grIndex] || { employeeId: '', hours: 0 };

                                                    return (
                                                        <div key={gr.id || grIndex} className="bg-white p-6 rounded-lg border border-[#e6e9ee] shadow-sm space-y-4">
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <h3 className="text-sm font-semibold text-[#171717]">{roleLabel}</h3>
                                                                    <p className="text-xs text-[#4a4a4a] mt-1">
                                                                        Assigned {assignedCount} of {gr.quantity} • Salary range: {formatMoney(gr.minMonthlySalary, currency)} – {formatMoney(gr.maxMonthlySalary, currency)}
                                                                    </p>
                                                                </div>
                                                                {assignedCount > gr.quantity && (
                                                                    <span className="text-xs text-red-600 font-medium">
                                                                        ⚠️ Over-assigned ({assignedCount - gr.quantity} extra)
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {assigned.length > 0 ? (
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow>
                                                                            <TableHead>Name</TableHead>
                                                                            <TableHead className="text-right">Available Hrs</TableHead>
                                                                            <TableHead className="text-right">Hours in Deal</TableHead>
                                                                            <TableHead className="text-right">Mo. Salary</TableHead>
                                                                            <TableHead className="text-right">Total Cost</TableHead>
                                                                            <TableHead className="w-10"></TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {assigned.map((assignment) => {
                                                                            const emp = employees.find(e => e.id === assignment.employeeId);
                                                                            if (!emp) return null;
                                                                            const totalCost = assignment.allocatedHours * emp.costPerHour;
                                                                            const inRange = emp.monthlySalary >= gr.minMonthlySalary && emp.monthlySalary <= gr.maxMonthlySalary;
                                                                            return (
                                                                                <TableRow key={assignment.employeeId}>
                                                                                    <TableCell className="font-medium">
                                                                                        {emp.name}
                                                                                        {!inRange && (
                                                                                            <span className="ml-2 text-xs text-amber-600">(outside range)</span>
                                                                                        )}
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right">{emp.workableHours}</TableCell>
                                                                                    <TableCell className="text-right">
                                                                                        <Input
                                                                                            type="number"
                                                                                            className="w-20 ml-auto h-8 text-right"
                                                                                            value={assignment.allocatedHours}
                                                                                            onChange={(e) => updateAssignmentHours(assignment.employeeId, Number(e.target.value))}
                                                                                        />
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right">{formatMoney(emp.monthlySalary, currency)}</TableCell>
                                                                                    <TableCell className="text-right font-medium">{formatMoney(totalCost, currency)}</TableCell>
                                                                                    <TableCell>
                                                                                        <Button
                                                                                            type="button"
                                                                                            variant="ghost"
                                                                                            size="icon"
                                                                                            className="h-8 w-8 text-[#8a8a8a] hover:text-red-600 hover:bg-red-50"
                                                                                            onClick={() => removeHardAssignment(assignment.employeeId)}
                                                                                        >
                                                                                            <Trash2 className="h-4 w-4" />
                                                                                        </Button>
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            );
                                                                        })}
                                                                    </TableBody>
                                                                </Table>
                                                            ) : (
                                                                <p className="text-sm text-[#8a8a8a]">No staff assigned to this role yet.</p>
                                                            )}

                                                            {canAddMore && availableEmployees.length > 0 && (
                                                                <div className="flex gap-3 items-end pt-2 border-t border-[#e6e9ee]">
                                                                    <div className="flex-1">
                                                                        <label className="text-xs text-[#8a8a8a] block mb-1">Employee</label>
                                                                        <Select
                                                                            value={input.employeeId}
                                                                            onValueChange={(v) => setStaffingInputs(prev => ({ ...prev, [grIndex]: { ...input, employeeId: v } }))}
                                                                        >
                                                                            <SelectTrigger className="bg-white">
                                                                                <SelectValue placeholder="Select employee" />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {availableEmployees.map(e => (
                                                                                    <SelectItem key={e.id} value={e.id}>
                                                                                        {e.name} — {formatMoney(e.monthlySalary, currency)}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                    <div className="w-32">
                                                                        <label className="text-xs text-[#8a8a8a] block mb-1">Hours</label>
                                                                        <Input
                                                                            type="number"
                                                                            className="bg-white"
                                                                            value={input.hours || ""}
                                                                            onChange={(e) => setStaffingInputs(prev => ({ ...prev, [grIndex]: { ...input, hours: Number(e.target.value) } }))}
                                                                            placeholder="e.g. 160"
                                                                        />
                                                                    </div>
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="bg-white shadow-sm mb-0.5"
                                                                        onClick={() => addHardAssignmentForRole(grIndex)}
                                                                        disabled={!input.employeeId || (input.hours || 0) <= 0}
                                                                    >
                                                                        <UserPlus className="h-4 w-4 mr-2" /> Add
                                                                    </Button>
                                                                </div>
                                                            )}

                                                            {canAddMore && availableEmployees.length === 0 && (
                                                                <p className="text-xs text-amber-600 pt-2">
                                                                    No available employees match this role and salary range.
                                                                </p>
                                                            )}

                                                            {!canAddMore && (
                                                                <p className="text-xs text-[#8a8a8a] pt-2">
                                                                    Role capacity reached ({gr.quantity} of {gr.quantity} assigned).
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}

                                            {/* ── Unassigned employees warning ── */}
                                            {(() => {
                                                const unassigned = hardAssignments.filter(a => {
                                                    const emp = employees.find(e => e.id === a.employeeId);
                                                    if (!emp) return false;
                                                    return !ghostRoles.some(gr => emp.capacityRole === gr.roleType);
                                                });
                                                if (unassigned.length === 0) return null;
                                                return (
                                                    <div className="bg-amber-50 p-6 rounded-lg border border-amber-200 shadow-sm space-y-4">
                                                        <h3 className="text-sm font-semibold text-amber-900">Unassigned Employees</h3>
                                                        <p className="text-xs text-amber-700">
                                                            These employees&apos; roles don&apos;t match any role in Cost Estimate. Update Cost Estimate to include them.
                                                        </p>
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead>Name</TableHead>
                                                                    <TableHead>Role</TableHead>
                                                                    <TableHead className="text-right">Hours</TableHead>
                                                                    <TableHead className="text-right">Mo. Salary</TableHead>
                                                                    <TableHead className="w-10"></TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {unassigned.map((assignment) => {
                                                                    const emp = employees.find(e => e.id === assignment.employeeId);
                                                                    if (!emp) return null;
                                                                    return (
                                                                        <TableRow key={assignment.employeeId}>
                                                                            <TableCell className="font-medium">{emp.name}</TableCell>
                                                                            <TableCell className="text-[#8a8a8a]">{emp.roleName || emp.role}</TableCell>
                                                                            <TableCell className="text-right">{assignment.allocatedHours}</TableCell>
                                                                            <TableCell className="text-right">{formatMoney(emp.monthlySalary, currency)}</TableCell>
                                                                            <TableCell>
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className="h-8 w-8 text-[#8a8a8a] hover:text-red-600 hover:bg-red-50"
                                                                                    onClick={() => removeHardAssignment(assignment.employeeId)}
                                                                                >
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                </Button>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    );
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                );
                                            })()}

                                            {/* ── Team Engineers Summary ── */}
                                            {hardAssignments.length > 0 && (() => {
                                                const grouped = hardAssignments.reduce((acc, assignment) => {
                                                    const emp = employees.find(e => e.id === assignment.employeeId);
                                                    if (!emp) return acc;
                                                    const role = emp.roleName || emp.role;
                                                    if (!acc[role]) acc[role] = { qty: 0, hours: 0, cost: 0 };
                                                    acc[role].qty += 1;
                                                    acc[role].hours += assignment.allocatedHours;
                                                    acc[role].cost += assignment.allocatedHours * emp.costPerHour;
                                                    return acc;
                                                }, {} as Record<string, { qty: number; hours: number; cost: number }>);
                                                return (
                                                    <div className="bg-white p-6 rounded-lg border border-[#e6e9ee] shadow-sm space-y-4">
                                                        <h3 className="text-sm font-semibold text-[#171717]">Team Engineers</h3>
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead>Role</TableHead>
                                                                    <TableHead className="text-right">Qty</TableHead>
                                                                    <TableHead className="text-right">Hours in Deal</TableHead>
                                                                    <TableHead className="text-right">Total Cost</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {Object.entries(grouped).map(([role, data]) => (
                                                                    <TableRow key={role}>
                                                                        <TableCell className="font-medium">{role}</TableCell>
                                                                        <TableCell className="text-right">{data.qty}</TableCell>
                                                                        <TableCell className="text-right">{data.hours}</TableCell>
                                                                        <TableCell className="text-right font-medium">{formatMoney(data.cost, currency)}</TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                );
                                            })()}
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
