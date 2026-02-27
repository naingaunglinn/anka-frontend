"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { useBusinessStore } from "@/store/businessStore";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { calculateOverhead, calculateRiskBuffer, calculateTotalEstimatedCost, calculateEstimatedGrossProfit } from "@/lib/calculations";

const ghostRoleSchema = z.object({
    role: z.enum(["frontend", "backend", "pm", "qa"]),
    quantity: z.coerce.number().min(1, "At least 1"),
    months: z.coerce.number().min(1, "At least 1 month"),
    avgMonthlySalary: z.coerce.number().min(0, "Must be positive"),
});

const dealSchema = z.object({
    name: z.string().min(1, "Deal name is required"),
    clientBudget: z.coerce.number().min(1, "Budget is required"),
    timelineMonths: z.coerce.number().min(1, "Timeline is required"),
    workloadHours: z.coerce.number().min(1, "Workload is required"),
    probability: z.coerce.number().min(0).max(100),
    ghostRoles: z.array(ghostRoleSchema),
});

type DealFormValues = z.infer<typeof dealSchema>;

export default function EditDealPage() {
    const router = useRouter();
    const params = useParams();
    const dealId = params.id as string;

    const deals = useBusinessStore((state) => state.deals);
    const updateDeal = useBusinessStore((state) => state.updateDeal);
    const dealToEdit = deals.find((d) => d.id === dealId);
    const companySettings = useBusinessStore((state) => state.companySettings);

    const form = useForm<DealFormValues>({
        resolver: zodResolver(dealSchema) as any,
        defaultValues: {
            name: dealToEdit?.name || "",
            clientBudget: dealToEdit?.clientBudget || 0,
            timelineMonths: dealToEdit?.timelineMonths || 1,
            workloadHours: dealToEdit?.workloadHours || 0,
            probability: dealToEdit?.probability || 50,
            ghostRoles: dealToEdit?.ghostRoles || [{ role: "frontend", quantity: 1, months: 1, avgMonthlySalary: 8000 }],
        },
    });

    useEffect(() => {
        if (dealToEdit) {
            form.reset({
                name: dealToEdit.name,
                clientBudget: dealToEdit.clientBudget,
                timelineMonths: dealToEdit.timelineMonths,
                workloadHours: dealToEdit.workloadHours,
                probability: dealToEdit.probability,
                // @ts-ignore
                ghostRoles: dealToEdit.ghostRoles,
            });
        }
    }, [dealToEdit, form]);

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "ghostRoles",
    });

    // Watch values for live calculations
    const ghostRoles = form.watch("ghostRoles");
    const clientBudget = form.watch("clientBudget");

    const baseLaborCost = ghostRoles.reduce((total, role) => {
        return total + (role.quantity || 0) * (role.months || 0) * (role.avgMonthlySalary || 0);
    }, 0);

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

    function onSubmit(data: DealFormValues) {
        if (!dealToEdit) return;

        const roles: GhostRole[] = data.ghostRoles.map((gr: any) => ({
            id: gr.id || uuidv4(),
            role: gr.role as RoleType,
            quantity: gr.quantity,
            months: gr.months,
            avgMonthlySalary: gr.avgMonthlySalary,
        }));

        updateDeal(dealId, {
            name: data.name,
            clientBudget: data.clientBudget,
            timelineMonths: data.timelineMonths,
            workloadHours: data.workloadHours,
            probability: data.probability,
            ghostRoles: roles,
            baseLaborCost,
            overheadCost,
            bufferCost,
            totalEstimatedCost,
            estimatedGrossProfit,
        });

        router.push("/deals");
    }

    if (!dealToEdit) {
        return <div className="p-8">Deal not found.</div>;
    }

    return (
        <div className="container mx-auto p-6 max-w-5xl space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Edit Deal</h1>
                <p className="text-muted-foreground">Modify deal estimation and ghost roles.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Deal Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Deal Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="e.g. Acme Corp Web App" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="clientBudget"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Client Budget ($)</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" {...field} />
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
                                                        <Input type="number" {...field} />
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
                                                        <Input type="number" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="probability"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Win Probability (%)</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <div className="pt-4 border-t">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-medium">Ghost Roles</h3>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => append({ role: "frontend", quantity: 1, months: 1, avgMonthlySalary: 8000 })}
                                            >
                                                <Plus className="h-4 w-4 mr-2" /> Add Role
                                            </Button>
                                        </div>

                                        <div className="space-y-4">
                                            {fields.map((field, index) => (
                                                <div key={field.id} className="flex gap-4 items-end bg-muted/50 p-4 rounded-lg">
                                                    <FormField
                                                        control={form.control}
                                                        name={`ghostRoles.${index}.role`}
                                                        render={({ field }) => (
                                                            <FormItem className="flex-1">
                                                                <FormLabel>Role</FormLabel>
                                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                    <FormControl>
                                                                        <SelectTrigger>
                                                                            <SelectValue placeholder="Select" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="frontend">Frontend</SelectItem>
                                                                        <SelectItem value="backend">Backend</SelectItem>
                                                                        <SelectItem value="pm">Project Manager</SelectItem>
                                                                        <SelectItem value="qa">QA</SelectItem>
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
                                                            <FormItem className="w-24">
                                                                <FormLabel>Qty</FormLabel>
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
                                                            <FormItem className="w-24">
                                                                <FormLabel>Months</FormLabel>
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
                                                            <FormItem className="w-32">
                                                                <FormLabel>Mo. Salary</FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="icon"
                                                        onClick={() => remove(index)}
                                                        disabled={fields.length === 1}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <Button type="submit" size="lg">Save Changes</Button>
                                    </div>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </div>

                {/* Live Calculation Output Sidebar */}
                <div className="space-y-6">
                    <Card className="sticky top-6">
                        <CardHeader className="bg-muted/40 pb-4 border-b">
                            <CardTitle>Live Financials</CardTitle>
                            <CardDescription>Estimated metrics based on inputs</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Base Labor Cost</span>
                                <span className="font-medium">${baseLaborCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Overhead ({companySettings.overheadPercentage}%)</span>
                                <span className="font-medium text-red-500/80">+${overheadCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Risk Buffer ({companySettings.bufferPercentage}%)</span>
                                <span className="font-medium text-red-500/80">+${bufferCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>

                            <div className="border-t pt-4 mt-2">
                                <div className="flex justify-between font-bold text-lg mb-2">
                                    <span>Total Est. Cost</span>
                                    <span>${totalEstimatedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                </div>
                                <div className="flex justify-between font-bold text-xl">
                                    <span>Gross Profit</span>
                                    <span className={getMarginColor(profitMargin)}>
                                        ${estimatedGrossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm mt-1">
                                    <span className="text-muted-foreground">Est. Margin</span>
                                    <span className={`font-medium ${getMarginColor(profitMargin)}`}>
                                        {profitMargin.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    );
}
