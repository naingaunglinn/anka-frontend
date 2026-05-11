"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBusinessStore } from "@/store/businessStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, ArrowLeft, Save, Sparkles, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import toast from "react-hot-toast";
import { useDealDetail, useDealMutations } from "@/lib/queries/deals";
import { useOrganizationSync } from "@/hooks/useOrganizationSync";
import { formatMoney } from "@/lib/currency";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { extractRequiredSkills } from "@/lib/skillMatching";
import { usePermission } from "@/hooks/usePermission";
import type { Employee, GhostRole } from "@/types/business";

// Pretty-printed labels for the small set of capacity_role buckets.
const ROLE_LABELS: Record<string, string> = {
    frontend: "Frontend",
    backend:  "Backend",
    pm:       "Project Manager",
    qa:       "QA Engineer",
    design:   "Designer",
};

export default function StaffingPage() {
    useOrganizationSync();
    const params = useParams();
    const router = useRouter();
    const dealId = params.id as string;
    const currency = useTenantCurrency();

    const deals      = useBusinessStore((state) => state.deals);
    const employees  = useBusinessStore((state) => state.employees);
    const skills     = useBusinessStore((state) => state.skills);
    const dealQuery  = useDealDetail(dealId);
    const { updateDeal } = useDealMutations();
    const { allowed: canManageCrm, reason: rbacReason } = usePermission('manage_crm');

    const [allocations, setAllocations] = useState<Record<string, number>>({});
    const [isMounted, setIsMounted] = useState(false);

    const deal = dealQuery.data ?? deals.find((d) => d.id === dealId);

    useEffect(() => {
        setIsMounted(true);
        if (deal) {
            const initial: Record<string, number> = {};
            deal.hardAssignments?.forEach((a) => { initial[a.employeeId] = a.allocatedHours; });
            setAllocations(initial);
        }
    }, [deal]);

    // ── Derived state (HOOKS — must run on every render before early returns) ──
    // React's Rules of Hooks: useMemo/useEffect/etc. must always be called in
    // the same order on every render. If we put these AFTER `if (!deal) return`,
    // they wouldn't run on the loading render and would run on the loaded
    // render, which trips the "change in the order of Hooks" detector. Each
    // memo is defensive against `deal` being undefined for that brief window.

    // Required skills extracted from the deal brief via whole-word matching
    // against the tenant's skill catalog (shared with AI Team Builder and the
    // Auto-Staff button so "covered"/"gap" labels stay consistent across views).
    // Substring matching used to produce false positives like "Java" matching
    // "JavaScript" — `extractRequiredSkills` uses `\bskill\b`.
    const requiredSkills = useMemo(() => {
        const text = deal?.workloadDescription ?? "";
        return extractRequiredSkills(text, skills.map(s => s.name));
    }, [deal?.workloadDescription, skills]);

    // Only Active employees with a capacityRole can be staffed. Terminated /
    // on-leave employees are excluded.
    const activeEmployees = useMemo(
        () => employees.filter((e) => e.status === "Active" && !!e.capacityRole),
        [employees],
    );

    // Map ghost roles by capacity_role for fast lookup.
    const ghostRoleByType = useMemo(() => {
        const m = new Map<string, GhostRole>();
        (deal?.ghostRoles ?? []).forEach((gr) => m.set(gr.roleType, gr));
        return m;
    }, [deal?.ghostRoles]);

    // Bucket active employees by their capacityRole.
    const employeesByRole = useMemo(() => {
        const groups = new Map<string, Employee[]>();
        for (const emp of activeEmployees) {
            if (!emp.capacityRole) continue;
            if (!groups.has(emp.capacityRole)) groups.set(emp.capacityRole, []);
            groups.get(emp.capacityRole)!.push(emp);
        }
        return groups;
    }, [activeEmployees]);

    // "Orphan" assignments — employees currently allocated to this deal whose
    // capacityRole isn't in any ghost role. Surfaces stale assignments left
    // behind after the salesperson edited the ghost roles.
    const orphanAssignments = useMemo(() => {
        return activeEmployees.filter(
            (e) => (allocations[e.id] ?? 0) > 0 &&
                   (!e.capacityRole || !ghostRoleByType.has(e.capacityRole)),
        );
    }, [activeEmployees, allocations, ghostRoleByType]);

    // Skill coverage = union of skills across employees who currently have a
    // non-zero allocation. Used to compute missingSkills for the sidebar.
    const coveredSkillNames = useMemo(() => {
        const set = new Set<string>();
        for (const emp of activeEmployees) {
            if ((allocations[emp.id] ?? 0) <= 0) continue;
            (emp.skills ?? []).forEach((s) => set.add(s.name.toLowerCase()));
        }
        return set;
    }, [activeEmployees, allocations]);

    const missingSkills = useMemo(
        () => requiredSkills.filter((rs) => !coveredSkillNames.has(rs.toLowerCase())),
        [requiredSkills, coveredSkillNames],
    );

    // ── Early returns (after all hooks have run) ──────────────────────────────

    if (!isMounted) return null;

    // Route-level RBAC. Placed AFTER every hook in this component so the
    // order of hooks stays stable across renders (Rules of Hooks). Users
    // without manage_crm (Delivery, HR) get an explicit denial — the page
    // is reachable via the Kanban menu and the Hard Booking button on the
    // deal detail page, so a guard here is the only chokepoint.
    if (!canManageCrm) {
        return (
            <div className="container mx-auto p-6 max-w-3xl space-y-4">
                <h1 className="text-2xl font-bold tracking-tight">Permission required</h1>
                <p className="text-sm text-muted-foreground">{rbacReason}</p>
                <Button variant="outline" onClick={() => router.push('/crm')}>Back to pipeline</Button>
            </div>
        );
    }

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

    // ── Helpers (non-hook; safe to declare here since `deal` is now defined) ──

    // Per-deal allocations are stored as lifetime hours. Project to per-month
    // for capacity comparisons so the math matches monthlyCapacityHours.
    const toMonthlyHours = (lifetimeHours: number, timelineMonths?: number) => {
        const months = Math.max(1, timelineMonths || 1);
        return lifetimeHours / months;
    };

    // Monthly load this employee carries from every non-lost deal except the
    // one we're editing. Soft bookings on open proposals/negotiations count.
    const getEmployeeMonthlyLoad = (employeeId: string) => {
        let monthly = 0;
        deals.forEach((d) => {
            if (d.id === deal.id || d.status === "lost") return;
            const a = d.hardAssignments?.find((x) => x.employeeId === employeeId);
            if (a) monthly += toMonthlyHours(a.allocatedHours, d.timelineMonths);
        });
        return monthly;
    };

    const handleAllocationChange = (employeeId: string, value: string) => {
        const hours = parseInt(value, 10);
        setAllocations((prev) => ({ ...prev, [employeeId]: isNaN(hours) ? 0 : hours }));
    };

    const isAssigned = (employeeId: string) => (allocations[employeeId] ?? 0) > 0;

    const hasConflicts = activeEmployees.some((e) => {
        const otherMonthly    = getEmployeeMonthlyLoad(e.id);
        const thisDealMonthly = toMonthlyHours(allocations[e.id] || 0, deal.timelineMonths);
        return otherMonthly + thisDealMonthly > (e.workableHours ?? 0);
    });

    // ── Save flow ─────────────────────────────────────────────────────────────

    const handleSave = async () => {
        if (hasConflicts) {
            toast.error("Cannot save. Resolve capacity conflicts first.");
            return;
        }

        const hardAssignments = Object.entries(allocations)
            .filter(([, hours]) => (hours ?? 0) > 0)
            .map(([employeeId, allocatedHours]) => ({ employeeId, allocatedHours }));

        await updateDeal.mutateAsync({ id: deal.id, updates: { hardAssignments } });

        // updateDeal catches API errors internally (rolls back + toasts), so
        // mutateAsync resolves either way. Confirm the change actually
        // persisted before navigating away.
        const refreshed = useBusinessStore.getState().deals.find((d) => d.id === deal.id);
        const sig = (rows: { employeeId: string; allocatedHours: number }[]) =>
            rows.map((r) => `${r.employeeId}:${r.allocatedHours}`).sort().join("|");
        if (sig(refreshed?.hardAssignments ?? []) !== sig(hardAssignments)) return;

        toast.success("Staffing saved successfully!");
        router.push(`/crm/${deal.id}`);
    };

    const handleCancel = () => {
        // Reset local allocations to whatever's on the persisted deal so the
        // user sees the round-trip is a no-op, then navigate back. We could
        // skip the reset, but doing it here makes the cancel path explicit
        // and prevents a flash of "modified" state on the way out.
        const reset: Record<string, number> = {};
        deal.hardAssignments?.forEach((a) => { reset[a.employeeId] = a.allocatedHours; });
        setAllocations(reset);
        router.push(`/crm/${deal.id}`);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const totalAssigned = Object.values(allocations).filter((h) => (h ?? 0) > 0).length;
    const totalRequired = (deal.ghostRoles ?? []).reduce((sum, gr) => sum + gr.quantity, 0);

    return (
        <div className="container mx-auto p-6 max-w-6xl space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={handleCancel} aria-label="Back">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Hard Booking Staffing</h1>
                        <p className="text-muted-foreground flex items-center gap-2 mt-1">
                            Assigning team for <strong className="text-foreground">{deal.name}</strong>
                            <Badge variant="outline">{totalAssigned} of {totalRequired} positions</Badge>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleCancel} disabled={updateDeal.isPending}>Cancel</Button>
                    <Button
                        onClick={handleSave}
                        disabled={hasConflicts || updateDeal.isPending}
                        className="gap-2"
                    >
                        <Save className="h-4 w-4" />
                        {updateDeal.isPending ? "Saving..." : "Save"}
                    </Button>
                </div>
            </div>

            {hasConflicts && (
                <Alert variant="destructive" className="bg-red-50/50 border-red-200">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Capacity Conflict</AlertTitle>
                    <AlertDescription>
                        One or more employees are over-allocated beyond their monthly capacity once you account for other open deals. Reduce their hours before saving.
                    </AlertDescription>
                </Alert>
            )}

            {missingSkills.length > 0 && (
                <Alert className="bg-amber-50 border-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                    <AlertTitle className="text-amber-900">Required skills not covered</AlertTitle>
                    <AlertDescription className="text-amber-800">
                        The current team doesn&apos;t cover: {missingSkills.map((s) => (
                            <Badge key={s} variant="outline" className="mx-1 bg-white border-amber-300 text-amber-900">{s}</Badge>
                        ))}
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4">
                    {(deal.ghostRoles ?? []).length === 0 ? (
                        <Card>
                            <CardContent className="p-8 text-center text-sm text-muted-foreground">
                                No ghost roles defined yet. Edit the deal to add the staffing shape first.
                            </CardContent>
                        </Card>
                    ) : (
                        (deal.ghostRoles ?? []).map((gr) => {
                            const candidates = (employeesByRole.get(gr.roleType) ?? []).slice().sort((a, b) => {
                                // Assigned first, then by salary fit (in-band before out-of-band).
                                const aA = isAssigned(a.id) ? 0 : 1;
                                const bA = isAssigned(b.id) ? 0 : 1;
                                if (aA !== bA) return aA - bA;
                                return a.name.localeCompare(b.name);
                            });
                            const assignedCount = candidates.filter((e) => isAssigned(e.id)).length;
                            const isFulfilled  = assignedCount >= gr.quantity;
                            const isOver       = assignedCount > gr.quantity;

                            return (
                                <Card key={gr.id ?? gr.roleType}>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="text-base flex items-center gap-2">
                                                    {ROLE_LABELS[gr.roleType] ?? gr.roleType}
                                                    <Badge variant={isFulfilled ? "default" : "secondary"} className={isFulfilled && !isOver ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                                                        {assignedCount} / {gr.quantity}
                                                    </Badge>
                                                    {isOver && <Badge variant="destructive">Over-staffed</Badge>}
                                                </CardTitle>
                                                <CardDescription className="mt-1">
                                                    Salary range: {formatMoney(gr.minMonthlySalary, currency)} – {formatMoney(gr.maxMonthlySalary, currency)}
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {candidates.length === 0 ? (
                                            <p className="text-sm text-muted-foreground py-4 text-center">
                                                No active employees match this capacity role.
                                            </p>
                                        ) : candidates.map((emp) => {
                                            const otherMonthly    = getEmployeeMonthlyLoad(emp.id);
                                            const currentAlloc    = allocations[emp.id] || 0;
                                            const thisDealMonthly = toMonthlyHours(currentAlloc, deal.timelineMonths);
                                            const totalMonthly    = otherMonthly + thisDealMonthly;
                                            const isOverallocated = totalMonthly > (emp.workableHours ?? 0);
                                            const availableMonthly = Math.max(0, (emp.workableHours ?? 0) - totalMonthly);
                                            const inSalaryBand = emp.monthlySalary >= gr.minMonthlySalary && emp.monthlySalary <= gr.maxMonthlySalary;
                                            const matchedSkills = (emp.skills ?? []).filter((s) =>
                                                requiredSkills.some((rs) => rs.toLowerCase() === s.name.toLowerCase()),
                                            );
                                            const otherSkills = (emp.skills ?? []).filter((s) =>
                                                !requiredSkills.some((rs) => rs.toLowerCase() === s.name.toLowerCase()),
                                            );
                                            const assigned = isAssigned(emp.id);

                                            return (
                                                <div
                                                    key={emp.id}
                                                    className={`grid grid-cols-12 items-start gap-3 p-3 border rounded-lg transition-colors ${
                                                        isOverallocated ? "bg-red-50/30 border-red-200" :
                                                        assigned        ? "bg-blue-50/30 border-blue-200" :
                                                        "hover:bg-muted/30"
                                                    }`}
                                                >
                                                    {/* Identity */}
                                                    <div className="col-span-4">
                                                        <div className="font-medium text-sm flex items-center gap-2">
                                                            {emp.name}
                                                            {assigned && <Badge variant="outline" className="text-[10px]">Assigned</Badge>}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-0.5">
                                                            {formatMoney(emp.monthlySalary, currency)}/mo
                                                            {!inSalaryBand && (
                                                                <span className="ml-2 text-amber-700">
                                                                    (outside band)
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Skills */}
                                                    <div className="col-span-4 flex flex-wrap gap-1">
                                                        {matchedSkills.length === 0 && otherSkills.length === 0 && (
                                                            <span className="text-[11px] text-muted-foreground italic">No recorded skills</span>
                                                        )}
                                                        {matchedSkills.map((s) => (
                                                            <Badge key={s.skillId} className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px]" title={`Required skill — ${s.proficiency ?? "intermediate"}`}>
                                                                <Sparkles className="h-2.5 w-2.5 mr-1" />
                                                                {s.name}
                                                            </Badge>
                                                        ))}
                                                        {otherSkills.slice(0, 3).map((s) => (
                                                            <Badge key={s.skillId} variant="outline" className="text-[10px] font-normal" title={s.proficiency ?? "intermediate"}>
                                                                {s.name}
                                                            </Badge>
                                                        ))}
                                                        {otherSkills.length > 3 && (
                                                            <Badge variant="secondary" className="text-[10px] font-normal" title={otherSkills.slice(3).map((s) => s.name).join(", ")}>
                                                                +{otherSkills.length - 3}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    {/* Capacity */}
                                                    <div className="col-span-2 text-right">
                                                        <div className={`text-xs font-medium ${isOverallocated ? "text-red-500" : "text-muted-foreground"}`}>
                                                            {availableMonthly.toFixed(0)}h/mo free
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground/80">
                                                            {emp.workableHours ?? 0}h cap · {otherMonthly.toFixed(0)}h other
                                                        </div>
                                                        {currentAlloc > 0 && deal.timelineMonths && deal.timelineMonths > 1 && (
                                                            <div className="text-[10px] text-blue-700">
                                                                ≈ {thisDealMonthly.toFixed(0)}h/mo this deal
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Hours input */}
                                                    <div className="col-span-2 flex items-center gap-1">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            value={allocations[emp.id] || ""}
                                                            onChange={(e) => handleAllocationChange(emp.id, e.target.value)}
                                                            placeholder="0h"
                                                            className={`h-8 text-right text-sm ${isOverallocated ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                                                        />
                                                        {assigned && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
                                                                onClick={() => handleAllocationChange(emp.id, "0")}
                                                                aria-label="Remove assignment"
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}

                    {orphanAssignments.length > 0 && (
                        <Card className="border-amber-200 bg-amber-50/30">
                            <CardHeader>
                                <CardTitle className="text-base text-amber-900 flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    Assigned outside any ghost role
                                </CardTitle>
                                <CardDescription className="text-amber-800">
                                    These employees have hours allocated but their capacity role isn&apos;t in the deal&apos;s ghost roles. Either edit the deal to add a matching ghost role, or remove their assignment.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {orphanAssignments.map((emp) => (
                                    <div key={emp.id} className="flex items-center justify-between p-2 border rounded-md bg-white">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{emp.name}</span>
                                            <Badge variant="secondary" className="capitalize text-xs">
                                                {emp.capacityRole ?? "no role"}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {allocations[emp.id]}h
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-muted-foreground hover:text-red-600"
                                            onClick={() => handleAllocationChange(emp.id, "0")}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    <Card className="sticky top-6">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Skill Coverage</CardTitle>
                            <CardDescription>
                                {requiredSkills.length === 0
                                    ? "No skills detected from the deal description."
                                    : `${requiredSkills.length - missingSkills.length} of ${requiredSkills.length} required skills covered`}
                            </CardDescription>
                        </CardHeader>
                        {requiredSkills.length > 0 && (
                            <CardContent className="space-y-2">
                                {requiredSkills.map((s) => {
                                    const covered = !missingSkills.includes(s);
                                    return (
                                        <div key={s} className="flex items-center justify-between text-sm">
                                            <span className={covered ? "text-foreground" : "text-amber-800"}>{s}</span>
                                            <Badge variant={covered ? "default" : "outline"} className={covered ? "bg-emerald-500 hover:bg-emerald-500" : "border-amber-300 text-amber-800"}>
                                                {covered ? "✓ Covered" : "Gap"}
                                            </Badge>
                                        </div>
                                    );
                                })}
                            </CardContent>
                        )}
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Deal Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Total Budget</span>
                                <span className="font-medium">{formatMoney(deal.clientBudget || 0, currency)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Timeline</span>
                                <span className="font-medium">
                                    {deal.timelineMonths ?? 0} mo
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Workload</span>
                                <span className="font-medium">{deal.workloadHours ?? 0}h</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Positions</span>
                                <span className="font-medium">{totalAssigned} / {totalRequired}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
