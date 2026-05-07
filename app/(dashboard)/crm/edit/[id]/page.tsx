"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { useBusinessStore } from "@/store/businessStore";
import { GhostRole, RoleType } from "@/types/business";
import type { AITeamBuilderResult } from "@/types/aiTeamBuilder";
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, ArrowRight, ArrowLeft, Upload, UserPlus, AlertCircle, FileText, Wand2, CheckCircle2, Sparkles } from "lucide-react";
import { calculateOverhead, calculateRiskBuffer, calculateTotalEstimatedCost, calculateEstimatedGrossProfit } from "@/lib/calculations";
import { getSuggestedSalaryRange } from "@/lib/salaryRange";
import { autoStaffFromGhostRoles } from "@/lib/autoStaffing";
import { AITeamBuilder } from "@/components/crm/AITeamBuilder";
import { dealSchema, type DealFormValues, LEAD_SOURCE_OPTIONS, CAPACITY_ROLE_OPTIONS } from "@/lib/schemas/deal.schema";
import { useDealDetail, useDealMutations } from "@/lib/queries/deals";
import { useLinkedContract } from "@/lib/queries/contracts";

export default function EditDealPage() {
    const router = useRouter();
    const params = useParams();
    const dealId = params.id as string;

    const deals = useBusinessStore((state) => state.deals);
    const contracts = useBusinessStore((state) => state.contracts);
    const dealQuery = useDealDetail(dealId);
    const linkedContractQuery = useLinkedContract(dealId);
    const { updateDeal } = useDealMutations();
    const dealToEdit = dealQuery.data ?? deals.find((d) => d.id === dealId);
    const companySettings = useBusinessStore((state) => state.companySettings);
    const employees = useBusinessStore((state) => state.employees);

    const [workloadDocText, setWorkloadDocText] = useState<string | undefined>(undefined);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
    const [acceptedAIResult, setAcceptedAIResult] = useState<AITeamBuilderResult | null>(null);

    // Local hard-assignments state so user can add / remove staff before saving
    const [hardAssignments, setHardAssignments] = useState<{ employeeId: string; allocatedHours: number }[]>([]);

    // Per-ghost-role input state for staffing add rows (key = ghost role index)
    const [staffingInputs, setStaffingInputs] = useState<Record<number, { employeeId: string; hours: number }>>({});

    // Wizard state — initialised from deal wizardStep to avoid a setState-in-effect
    const [activeTab, setActiveTab] = useState<string>(() => {
        const step = dealToEdit?.wizardStep;
        if (step === 'estimation') return 'estimation';
        if (step === 'staffing') return 'staffing';
        return 'context';
    });
    const [estimationMode, setEstimationMode] = useState<'ai' | 'manual'>('manual');
    const [autoStaffWarnings, setAutoStaffWarnings] = useState<string[]>([]);

    // Sync local hardAssignments when deal loads or AI result is accepted
    useEffect(() => {
        if (dealToEdit?.hardAssignments) {
            setHardAssignments(dealToEdit.hardAssignments.map(a => ({ ...a })));
        }
    }, [dealToEdit?.hardAssignments]);

    // Resume at the saved wizard step once the deal is loaded
    useEffect(() => {
        if (dealToEdit?.wizardStep) {
            const step = dealToEdit.wizardStep;
            if (step === 'context') setActiveTab('context');
            else if (step === 'estimation') setActiveTab('estimation');
            else if (step === 'staffing') setActiveTab('staffing');
        }
    }, [dealToEdit?.wizardStep]);



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

    async function handleAcceptAIResult(result: AITeamBuilderResult) {
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
            months: timelineMonths,
            minMonthlySalary: group.minSalary,
            maxMonthlySalary: group.maxSalary,
        }));

        form.setValue('ghostRoles', newGhostRoles);

        const newAssignments = result.team.map(m => ({
            employeeId: m.employeeId,
            allocatedHours: m.allocatedHours,
        }));
        setHardAssignments(newAssignments);

        await updateDeal.mutateAsync({
            id: dealId,
            updates: {
                baseLaborCost: result.baseLaborCost,
                overheadCost: result.overheadCost,
                bufferCost: result.bufferCost,
                totalEstimatedCost: result.totalEstimatedCost,
                estimatedGrossProfit: result.estimatedGrossProfit,
                ghostRoles: newGhostRoles,
                hardAssignments: newAssignments,
            },
        });
    }

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
                : [{ roleType: 'frontend', quantity: 1, months: 1, minMonthlySalary: 0, maxMonthlySalary: 0 }],
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
                    : [{ roleType: 'frontend', quantity: 1, months: 1, minMonthlySalary: 0, maxMonthlySalary: 0 }],
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
    const workloadDescription = form.watch("workloadDescription") || "";

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type === 'text/plain') {
            const text = await file.text();
            setWorkloadDocText(text);
            setUploadedFileName(file.name);
        }
    }

    const manualBaseLaborCost = ghostRoles.reduce((total, role) => {
        const avgSalary = ((role.minMonthlySalary || 0) + (role.maxMonthlySalary || 0)) / 2;
        return total + (role.quantity || 0) * (role.months || 0) * avgSalary;
    }, 0);

    const assignmentBaseLaborCost = hardAssignments.reduce((total, a) => {
        const emp = employees.find(e => e.id === a.employeeId);
        return total + (a.allocatedHours || 0) * (emp?.costPerHour || 0);
    }, 0);

    // When AI result is fresh, use it; otherwise compute from hardAssignments if present, else ghost roles
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
                hardAssignments,
                baseLaborCost,
                overheadCost,
                bufferCost,
                totalEstimatedCost,
                estimatedGrossProfit,
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

    return (
        <div className="container mx-auto p-6 max-w-5xl space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Edit Deal Profile</h1>
                <p className="text-muted-foreground mt-1">Refine the client context, update cost estimates, and check deliverables.</p>
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
                                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                        <TabsList className="grid w-full grid-cols-4 mb-6 bg-slate-100/50">
                                            <TabsTrigger value="context">Sales Context</TabsTrigger>
                                            <TabsTrigger value="estimation">Estimation</TabsTrigger>
                                            <TabsTrigger value="staffing">Staffing</TabsTrigger>
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
                                                                <FormLabel>Expected Close Date <span className="text-muted-foreground text-xs font-normal">(optional)</span></FormLabel>
                                                                <FormControl>
                                                                    <Input type="date" className="bg-white" {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
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
                                                </div>

                                                <div className="grid grid-cols-2 gap-6">
                                                    <FormField
                                                        control={form.control}
                                                        name="clientBudget"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Client Budget ($) <span className="text-destructive">*</span></FormLabel>
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
                                                                    <Input type="number" className="bg-white" {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name="workloadHours"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Total Workload (Hours) <span className="text-muted-foreground text-xs font-normal">(optional)</span></FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" className="bg-white" {...field} />
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
                                                </div>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="estimation" className="space-y-6">
                                            <div className="flex gap-2 mb-2">
                                                <Button
                                                    type="button"
                                                    variant={estimationMode === 'manual' ? 'default' : 'outline'}
                                                    size="sm"
                                                    onClick={() => setEstimationMode('manual')}
                                                >
                                                    Manual
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant={estimationMode === 'ai' ? 'default' : 'outline'}
                                                    size="sm"
                                                    onClick={() => setEstimationMode('ai')}
                                                >
                                                    <Sparkles className="mr-2 h-4 w-4" />
                                                    AI Team Builder
                                                </Button>
                                            </div>

                                            {estimationMode === 'manual' && (
                                                <div className="bg-slate-50/50 p-6 rounded-lg border border-slate-100">
                                                    <div className="flex items-center justify-between mb-6 pb-4 border-b">
                                                        <div>
                                                            <h3 className="text-sm font-semibold text-slate-900">Ghost Roles Required</h3>
                                                            <p className="text-xs text-muted-foreground mt-1">Estimate the shape of the team needed to deliver this deal.</p>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="bg-white shadow-sm"
                                                                onClick={() => {
                                                                    const range = getSuggestedSalaryRange('frontend', employees);
                                                                    append({ roleType: 'frontend', quantity: 1, months: timelineMonths || 1, minMonthlySalary: range.min, maxMonthlySalary: range.max });
                                                                }}
                                                        >
                                                            <Plus className="h-4 w-4 mr-2" /> Add Role
                                                        </Button>
                                                    </div>

                                                    <div className="space-y-4">
                                                        {fields.map((field, index) => (
                                                            <div key={field.id} className="flex gap-4 items-end bg-white p-4 rounded-lg border shadow-sm">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`ghostRoles.${index}.roleType`}
                                                                    render={({ field }) => (
                                                                        <FormItem className="flex-1">
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
                                                                        <FormItem className="w-20">
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
                                                                        <FormItem className="w-20">
                                                                            <FormLabel className="text-xs text-slate-500">Mos.</FormLabel>
                                                                            <FormControl>
                                                                                <Input type="number" {...field} />
                                                                            </FormControl>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                                 <div className="flex items-end gap-1">
                                                                     <FormField
                                                                         control={form.control}
                                                                         name={`ghostRoles.${index}.minMonthlySalary`}
                                                                         render={({ field }) => (
                                                                             <FormItem className="w-24">
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
                                                                             <FormItem className="w-24">
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
                                                                         className="h-9 w-9 text-slate-400 hover:text-indigo-600"
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
                                            )}

                                            {estimationMode === 'ai' && (
                                                <AITeamBuilder
                                                    dealId={dealId}
                                                    clientBudget={clientBudget}
                                                    timelineMonths={timelineMonths}
                                                    workloadHours={workloadHours}
                                                    workloadDescription={workloadDescription}
                                                    workloadDocumentText={workloadDocText}
                                                    onAccept={handleAcceptAIResult}
                                                />
                                            )}
                                        </TabsContent>

                                        <TabsContent value="staffing" className="space-y-6">
                                            {autoStaffWarnings.length > 0 && (
                                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                                                    <h4 className="text-sm font-semibold text-amber-900">Auto-Staff Warnings</h4>
                                                    {autoStaffWarnings.map((w, i) => (
                                                        <p key={i} className="text-xs text-amber-700">{w}</p>
                                                    ))}
                                                </div>
                                            )}

                                            {ghostRoles.length === 0 ? (
                                                <div className="bg-slate-50 border border-slate-100 border-dashed rounded-xl p-8 text-center">
                                                    <p className="text-sm text-slate-500">No roles defined in Estimation yet. Add roles in the Estimation tab first.</p>
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
                                                        <div key={gr.id || grIndex} className="bg-white p-6 rounded-lg border border-slate-100 shadow-sm space-y-4">
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <h3 className="text-sm font-semibold text-slate-900">{roleLabel}</h3>
                                                                    <p className="text-xs text-muted-foreground mt-1">
                                                                        Assigned {assignedCount} of {gr.quantity} • Salary range: ${gr.minMonthlySalary.toLocaleString()} – ${gr.maxMonthlySalary.toLocaleString()}
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
                                                                                    <TableCell className="text-right">${emp.monthlySalary.toLocaleString()}</TableCell>
                                                                                    <TableCell className="text-right font-medium">${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                                                                    <TableCell>
                                                                                        <Button
                                                                                            type="button"
                                                                                            variant="ghost"
                                                                                            size="icon"
                                                                                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
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
                                                                <p className="text-sm text-slate-400">No staff assigned to this role yet.</p>
                                                            )}

                                                            {canAddMore && availableEmployees.length > 0 && (
                                                                <div className="flex gap-3 items-end pt-2 border-t border-slate-100">
                                                                    <div className="flex-1">
                                                                        <label className="text-xs text-slate-500 block mb-1">Employee</label>
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
                                                                                        {e.name} — ${e.monthlySalary.toLocaleString()}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                    <div className="w-32">
                                                                        <label className="text-xs text-slate-500 block mb-1">Hours</label>
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
                                                                <p className="text-xs text-slate-400 pt-2">
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
                                                            These employees&apos; roles don&apos;t match any role in Estimation. Update Estimation to include them.
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
                                                                            <TableCell className="text-slate-500">{emp.roleName || emp.role}</TableCell>
                                                                            <TableCell className="text-right">{assignment.allocatedHours}</TableCell>
                                                                            <TableCell className="text-right">${emp.monthlySalary.toLocaleString()}</TableCell>
                                                                            <TableCell>
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
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
                                                    <div className="bg-white p-6 rounded-lg border border-slate-100 shadow-sm space-y-4">
                                                        <h3 className="text-sm font-semibold text-slate-900">Team Engineers</h3>
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
                                                                        <TableCell className="text-right font-medium">${data.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                );
                                            })()}
                                        </TabsContent>

                                        <TabsContent value="contracts" className="space-y-6">
                                            {dealToEdit.status === 'won' && (() => {
                                                // Prefer the dedicated API query, fall back to Zustand store
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
                                                                    {linkedContract.contractNumber || linkedContract.id.slice(0, 8)} · {linkedContract.status} · ${linkedContract.totalValue.toLocaleString()}
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
                                            {activeTab === 'estimation' && "Define the team structure and click Save & Next to move to Staffing."}
                                            {activeTab === 'staffing' && "Assign employees to roles. Use Auto-Staff to fill automatically."}
                                            {activeTab === 'contracts' && "Contract details are managed after the deal is won."}
                                        </p>
                                        <div className="flex gap-2">
                                            {activeTab !== 'context' && activeTab !== 'contracts' && (
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
                                                    disabled={updateDeal.isPending}
                                                    onClick={async () => {
                                                        const valid = await form.trigger('ghostRoles');
                                                        if (!valid) {
                                                            onFormError();
                                                            return;
                                                        }
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
                                                                ghostRoles: roles,
                                                                baseLaborCost,
                                                                overheadCost,
                                                                bufferCost,
                                                                totalEstimatedCost,
                                                                estimatedGrossProfit,
                                                                wizardStep: 'staffing',
                                                            },
                                                        });
                                                        setActiveTab('staffing');
                                                    }}
                                                >
                                                    {updateDeal.isPending ? 'Saving...' : 'Save & Next'}
                                                    <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            )}
                                            {activeTab === 'staffing' && (
                                                <>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="lg"
                                                        onClick={() => {
                                                            const { assignments, warnings } = autoStaffFromGhostRoles(ghostRoles, employees, hardAssignments);
                                                            setHardAssignments(assignments);
                                                            setAutoStaffWarnings(warnings);
                                                            if (warnings.length === 0) {
                                                                toast.success('Auto-staffing complete!');
                                                            }
                                                        }}
                                                    >
                                                        <Wand2 className="mr-2 h-4 w-4" />
                                                        Auto-Staff
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
                                                                    hardAssignments,
                                                                    baseLaborCost,
                                                                    overheadCost,
                                                                    bufferCost,
                                                                    totalEstimatedCost,
                                                                    estimatedGrossProfit,
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

                {/* Live Calculation Output Sidebar */}
                <div className="space-y-6">
                    <Card className="sticky top-6 shadow-sm border-slate-100">
                        <CardHeader className="bg-slate-50/80 pb-4 border-b border-slate-100 rounded-t-xl">
                            <CardTitle className="text-lg">Live Financials</CardTitle>
                            <CardDescription>Estimated metrics based on inputs</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-5">
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Base Labor Cost</span>
                                    <span className="font-medium text-slate-700">${baseLaborCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Overhead ({companySettings.overheadPercentage}%)</span>
                                    <span className="font-medium text-red-500/80">+${overheadCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Risk Buffer ({companySettings.bufferPercentage}%)</span>
                                    <span className="font-medium text-red-500/80">+${bufferCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-5">
                                <div className="flex justify-between font-bold text-slate-800 mb-3">
                                    <span>Total Est. Cost</span>
                                    <span>${totalEstimatedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                </div>
                                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <span className="font-bold text-slate-800">Gross Profit</span>
                                    <div className="flex flex-col items-end">
                                        <span className={`font-bold text-lg ${getMarginColor(profitMargin)}`}>
                                            ${estimatedGrossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
