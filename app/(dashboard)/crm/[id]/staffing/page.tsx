"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBusinessStore } from "@/store/businessStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowLeft, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import toast from "react-hot-toast";
import { useDealDetail, useDealMutations } from "@/lib/queries/deals";
import { useOrganizationSync } from "@/hooks/useOrganizationSync";

export default function StaffingPage() {
    useOrganizationSync();
    const params = useParams();
    const router = useRouter();
    const dealId = params.id as string;

    const deals = useBusinessStore((state) => state.deals);
    const engineers = useBusinessStore((state) => state.engineers);
    const assignEngineer = useBusinessStore((state) => state.assignEngineer);
    const dealQuery = useDealDetail(dealId);
    const { updateDeal } = useDealMutations();

    const [allocations, setAllocations] = useState<Record<string, number>>({});
    const [isMounted, setIsMounted] = useState(false);

    const deal = dealQuery.data ?? deals.find((d) => d.id === dealId);

    useEffect(() => {
        setIsMounted(true);
        if (deal) {
            const initialAllocations: Record<string, number> = {};
            deal.hardAssignments?.forEach((a) => {
                initialAllocations[a.employeeId] = a.allocatedHours;
            });
            setAllocations(initialAllocations);
        }
    }, [deal]);

    if (!isMounted) return null;

    if (dealQuery.isLoading) {
        return <div className="p-8 text-sm text-muted-foreground">Loading staffing plan...</div>;
    }

    if (dealQuery.isError) {
        return (
            <div className="p-6">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>Could not load staffing data.</AlertDescription>
                </Alert>
                <Button className="mt-4" variant="outline" onClick={() => dealQuery.refetch()}>Retry</Button>
            </div>
        );
    }

    if (!deal) {
        return (
            <div className="p-6">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>Deal not found.</AlertDescription>
                </Alert>
                <Button className="mt-4" onClick={() => router.push("/crm")}>Back to Pipeline</Button>
            </div>
        );
    }

    const getEngineerBookedHours = (employeeId: string) => {
        let booked = 0;
        deals.forEach((d) => {
            if (d.status === "won" && d.id !== deal.id) {
                const assignment = d.hardAssignments?.find((a) => a.employeeId === employeeId);
                if (assignment) {
                    booked += assignment.allocatedHours;
                }
            }
        });
        return booked;
    };

    const handleAllocationChange = (employeeId: string, value: string) => {
        const hours = parseInt(value, 10);
        setAllocations((prev) => ({
            ...prev,
            [employeeId]: isNaN(hours) ? 0 : hours,
        }));
    };

    const hasConflicts = engineers.some((eng) => {
        const otherBooked = getEngineerBookedHours(eng.id);
        const currentlyAllocated = allocations[eng.id] || 0;
        return otherBooked + currentlyAllocated > eng.monthlyCapacityHours;
    });

    const handleSave = async () => {
        if (hasConflicts) {
            toast.error("Cannot save. Resolve capacity conflicts first.");
            return;
        }

        const hardAssignments = engineers
            .map((eng) => ({
                employeeId: eng.id,
                allocatedHours: allocations[eng.id] || 0,
            }))
            .filter((assignment) => assignment.allocatedHours > 0);

        engineers.forEach((eng) => {
            const allocated = allocations[eng.id] || 0;
            assignEngineer(deal.id, eng.id, allocated);
        });

        await updateDeal.mutateAsync({
            id: deal.id,
            updates: { hardAssignments },
        });

        toast.success("Staffing saved successfully!");
        router.push("/crm");
    };

    return (
        <div className="container mx-auto p-6 max-w-5xl space-y-6">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/crm">
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Hard Booking Staffing</h1>
                    <p className="text-muted-foreground flex items-center gap-2 mt-1">
                        Assigning engineers for <strong className="text-foreground">{deal.name}</strong>
                        <Badge variant="outline">{(deal.ghostRoles || []).length} Roles Required</Badge>
                    </p>
                </div>
            </div>

            {hasConflicts && (
                <Alert variant="destructive" className="bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Capacity Conflict</AlertTitle>
                    <AlertDescription>
                        One or more engineers are overallocated beyond their monthly capacity. Please reduce allocated hours before saving.
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Available Engineers</CardTitle>
                            <CardDescription>Allocate hours from the available capacity pool.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {engineers.map((eng) => {
                                const otherBooked = getEngineerBookedHours(eng.id);
                                const currentAllocated = allocations[eng.id] || 0;
                                const totalCalculated = otherBooked + currentAllocated;
                                const isOverallocated = totalCalculated > eng.monthlyCapacityHours;

                                return (
                                    <div key={eng.id} className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${isOverallocated ? "bg-red-50/30 border-red-200 dark:bg-red-900/10 dark:border-red-900/50" : "hover:bg-muted/50"}`}>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 font-medium">
                                                {eng.name}
                                                <Badge variant="secondary" className="capitalize text-xs">{eng.role}</Badge>
                                            </div>
                                            <div className="text-sm text-muted-foreground mt-1 flex gap-4">
                                                <span>Capacity: {eng.monthlyCapacityHours}h</span>
                                                <span>Other Deals: {otherBooked}h</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <div className={`text-sm font-medium ${isOverallocated ? "text-red-500" : "text-muted-foreground"}`}>
                                                    Available: {Math.max(0, eng.monthlyCapacityHours - otherBooked - currentAllocated)}h
                                                </div>
                                            </div>
                                            <div className="w-24">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    value={allocations[eng.id] || ""}
                                                    onChange={(e) => handleAllocationChange(eng.id, e.target.value)}
                                                    placeholder="0"
                                                    className={isOverallocated ? "border-red-500 focus-visible:ring-red-500" : ""}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="sticky top-6">
                        <CardHeader>
                            <CardTitle>Deal Requirements</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {(deal.ghostRoles || []).map((gr) => (
                                <div key={gr.id} className="flex justify-between items-center py-2 border-b last:border-0 last:pb-0">
                                    <div className="flex flex-col">
                                        <span className="capitalize font-medium">{gr.roleType}</span>
                                        <span className="text-xs text-muted-foreground">{gr.months} month(s)</span>
                                    </div>
                                    <Badge variant="secondary">Qty: {gr.quantity}</Badge>
                                </div>
                            ))}
                            <div className="pt-4 flex justify-between font-medium">
                                <span>Total Budget</span>
                                <span>${(deal.clientBudget || 0).toLocaleString()}</span>
                            </div>
                            <Button
                                className="w-full mt-4"
                                size="lg"
                                onClick={handleSave}
                                disabled={hasConflicts || updateDeal.isPending}
                            >
                                <Save className="mr-2 h-4 w-4" />
                                {updateDeal.isPending ? 'Saving...' : 'Save Assignments'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
