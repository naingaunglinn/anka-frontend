"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { useBusinessStore } from "@/store/businessStore";
import { Deal, GhostRole, RoleType } from "@/types/business";
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
import { Plus, Trash2, ArrowRight, Upload } from "lucide-react";
import { calculateOverhead, calculateRiskBuffer, calculateTotalEstimatedCost, calculateEstimatedGrossProfit } from "@/lib/calculations";
import { AITeamBuilder } from "@/components/crm/AITeamBuilder";
import { dealSchema, type DealFormValues } from "@/lib/schemas/deal.schema";
import { useDealDetail, useDealMutations } from "@/lib/queries/deals";

export default function EditDealPage() {
    const router = useRouter();
    const params = useParams();
    const dealId = params.id as string;

    const deals = useBusinessStore((state) => state.deals);
    const dealQuery = useDealDetail(dealId);
    const { updateDeal } = useDealMutations();
    const dealToEdit = dealQuery.data ?? deals.find((d) => d.id === dealId);
    const companySettings = useBusinessStore((state) => state.companySettings);

    const [workloadDocText, setWorkloadDocText] = useState<string | undefined>(undefined);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
    const [acceptedAIResult, setAcceptedAIResult] = useState<AITeamBuilderResult | null>(null);

    async function handleAcceptAIResult(result: AITeamBuilderResult) {
        setAcceptedAIResult(result);
        await updateDeal.mutateAsync({
            id: dealId,
            updates: {
                baseLaborCost: result.baseLaborCost,
                overheadCost: result.overheadCost,
                bufferCost: result.bufferCost,
                totalEstimatedCost: result.totalEstimatedCost,
                estimatedGrossProfit: result.estimatedGrossProfit,
                hardAssignments: result.team.map(m => ({
                    employeeId: m.employeeId,
                    allocatedHours: m.allocatedHours,
                })),
            },
        });
    }

    const form = useForm<DealFormValues>({
        resolver: zodResolver(dealSchema) as Resolver<DealFormValues>,
        defaultValues: {
            name: dealToEdit?.name || "",
            client: dealToEdit?.client || "",
            clientBudget: dealToEdit?.clientBudget || 0,
            timelineMonths: dealToEdit?.timelineMonths || 1,
            workloadHours: dealToEdit?.workloadHours || 0,
            winProbability: dealToEdit?.winProbability || 50,
            workloadDescription: ((dealToEdit as unknown as Record<string, unknown>)?.workloadDescription as string) || "",
            ghostRoles: dealToEdit?.ghostRoles ?? [],
        },
    });

    useEffect(() => {
        if (dealToEdit) {
            form.reset({
                name: dealToEdit.name || "",
                client: dealToEdit.client || "",
                clientBudget: dealToEdit.clientBudget || 0,
                timelineMonths: dealToEdit.timelineMonths || 1,
                workloadHours: dealToEdit.workloadHours || 0,
                winProbability: dealToEdit.winProbability || 50,
                workloadDescription: dealToEdit.workloadDescription || "",
                ghostRoles: dealToEdit.ghostRoles ?? [],
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
        return total + (role.quantity || 0) * (role.months || 0) * (role.avgMonthlySalary || 0);
    }, 0);

    const baseLaborCost = acceptedAIResult?.baseLaborCost ?? manualBaseLaborCost;
    const overheadCost = acceptedAIResult?.overheadCost ?? calculateOverhead(manualBaseLaborCost, companySettings.overheadPercentage);
    const bufferCost = acceptedAIResult?.bufferCost ?? calculateRiskBuffer(manualBaseLaborCost, companySettings.bufferPercentage);
    const totalEstimatedCost = acceptedAIResult?.totalEstimatedCost ?? calculateTotalEstimatedCost(manualBaseLaborCost, overheadCost, bufferCost);
    const estimatedGrossProfit = acceptedAIResult?.estimatedGrossProfit ?? calculateEstimatedGrossProfit(clientBudget, totalEstimatedCost);

    const profitMargin = clientBudget > 0 ? (estimatedGrossProfit / clientBudget) * 100 : 0;

    const getMarginColor = (margin: number) => {
        if (margin < 0) return "text-red-500";
        if (margin < 10) return "text-yellow-500";
        return "text-green-500";
    };

    async function onSubmit(data: DealFormValues) {
        if (!dealToEdit) return;

        const roles: GhostRole[] = data.ghostRoles.map((gr) => ({
            id: gr.id || uuidv4(),
            roleType: gr.roleType as RoleType,
            quantity: gr.quantity,
            months: gr.months,
            avgMonthlySalary: gr.avgMonthlySalary,
        }));

        await updateDeal.mutateAsync({
            id: dealId,
            updates: {
                name: data.name,
                client: data.client || undefined,
                clientBudget: data.clientBudget,
                timelineMonths: data.timelineMonths,
                workloadHours: data.workloadHours,
                workloadDescription: data.workloadDescription,
                winProbability: data.winProbability,
                ghostRoles: roles,
                hardAssignments: acceptedAIResult
                    ? acceptedAIResult.team.map(m => ({ employeeId: m.employeeId, allocatedHours: m.allocatedHours }))
                    : dealToEdit?.hardAssignments,
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
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                    <Tabs defaultValue="context" className="w-full">
                                        <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-100/50">
                                            <TabsTrigger value="context">Sales Context</TabsTrigger>
                                            <TabsTrigger value="estimation">Staffing & Est.</TabsTrigger>
                                            <TabsTrigger value="contracts">Contracts</TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="context" className="space-y-6">
                                            <div className="bg-slate-50/50 p-6 rounded-lg border border-slate-100 space-y-6">
                                                <FormField
                                                    control={form.control}
                                                    name="name"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Deal Name</FormLabel>
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
                                                            <FormLabel>Client Name</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="e.g. Acme Corporation" className="bg-white" {...field} />
                                                            </FormControl>
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
                                                                <FormLabel>Client Budget ($)</FormLabel>
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
                                                                <FormLabel>Win Probability (%)</FormLabel>
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
                                                                <FormLabel>Timeline (Months)</FormLabel>
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
                                                                <FormLabel>Total Workload (Hours)</FormLabel>
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
                                                            <FormLabel>Project Scope / Workload Description</FormLabel>
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
                                                        onClick={() => append({ roleType: "frontend", quantity: 1, months: 1, avgMonthlySalary: 0 })}
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
                                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                            <FormControl>
                                                                                <SelectTrigger>
                                                                                    <SelectValue placeholder="Select" />
                                                                                </SelectTrigger>
                                                                            </FormControl>
                                                                            <SelectContent>
                                                                                <SelectItem value="frontend">Frontend Eng.</SelectItem>
                                                                                <SelectItem value="backend">Backend Eng.</SelectItem>
                                                                                <SelectItem value="pm">Project Manager</SelectItem>
                                                                                <SelectItem value="qa">QA Engineer</SelectItem>
                                                                                <SelectItem value="design">UI/UX Designer</SelectItem>
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
                                                            <FormField
                                                                control={form.control}
                                                                name={`ghostRoles.${index}.avgMonthlySalary`}
                                                                render={({ field }) => (
                                                                    <FormItem className="w-28">
                                                                        <FormLabel className="text-xs text-slate-500">Mo. Salary</FormLabel>
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
                                        </TabsContent>

                                        <TabsContent value="contracts" className="space-y-6">
                                            <div className="bg-slate-50 border border-slate-100 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center space-y-3">
                                                <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                                                    <ArrowRight className="h-6 w-6 text-indigo-600" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-slate-800">Deliverables & Invoicing</h3>
                                                <p className="text-sm text-slate-500 max-w-sm">
                                                    Contract generation, milestone planning, and project scaffolding will unlock once this deal transitions to the <b>Contract</b> stage.
                                                </p>
                                            </div>
                                        </TabsContent>
                                    </Tabs>

                                    <div className="flex justify-end pt-6 border-t mt-6">
                                        <Button type="submit" size="lg" className="w-full md:w-auto shadow-sm" disabled={updateDeal.isPending}>
                                            {updateDeal.isPending ? 'Saving...' : 'Save Changes'}
                                        </Button>
                                    </div>

                                    <AITeamBuilder
                                        dealId={dealId}
                                        clientBudget={clientBudget}
                                        timelineMonths={timelineMonths}
                                        workloadHours={workloadHours}
                                        workloadDescription={workloadDescription}
                                        workloadDocumentText={workloadDocText}
                                        onAccept={handleAcceptAIResult}
                                    />
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
