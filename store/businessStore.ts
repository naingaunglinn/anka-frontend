import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
    Deal,
    Engineer,
    CompanySettings,
    DepartmentCapacity,
    RoleType,
} from "../types/business";
import {
    calculateOverhead,
    calculateRiskBuffer,
    calculateTotalEstimatedCost,
    calculateEstimatedGrossProfit,
    calculateSoftBookedHours,
} from "../lib/calculations";

// --- Mock Data ---

const INITIAL_ENGINEERS: Engineer[] = [
    {
        id: "e1",
        name: "Alice Frontend",
        role: "frontend",
        monthlySalary: 8000,
        monthlyCapacityHours: 160,
    },
    {
        id: "e2",
        name: "Bob Backend",
        role: "backend",
        monthlySalary: 9000,
        monthlyCapacityHours: 160,
    },
    {
        id: "e3",
        name: "Charlie PM",
        role: "pm",
        monthlySalary: 7000,
        monthlyCapacityHours: 160,
    },
    {
        id: "e4",
        name: "Diana QA",
        role: "qa",
        monthlySalary: 6000,
        monthlyCapacityHours: 160,
    },
    {
        id: "e5",
        name: "Eve Frontend",
        role: "frontend",
        monthlySalary: 7500,
        monthlyCapacityHours: 160,
    },
];

const INITIAL_SETTINGS: CompanySettings = {
    overheadPercentage: 20,
    bufferPercentage: 10,
    yearlyFixedCost: 500000, // $500k yearly fixed cost
};

// --- Store Interface ---

interface BusinessState {
    deals: Deal[];
    engineers: Engineer[];
    companySettings: CompanySettings;

    // Actions
    addDeal: (deal: Deal) => void;
    updateDealStage: (id: string, stage: Deal["stage"]) => void;
    updateDeal: (id: string, updates: Partial<Deal>) => void;
    assignEngineer: (
        dealId: string,
        engineerId: string,
        allocatedHours: number
    ) => void;
    updateCompanySettings: (settings: Partial<CompanySettings>) => void;

    // Derived / Computed getters
    getCapacityPool: () => DepartmentCapacity[];
    getYearlyPnL: () => {
        sureMoney: number;
        probableMoney: number;
        forecast: number;
    };
}

// --- Store Implementation ---

export const useBusinessStore = create<BusinessState>()(
    persist(
        (set, get) => ({
            deals: [],
            engineers: INITIAL_ENGINEERS,
            companySettings: INITIAL_SETTINGS,

            addDeal: (deal) =>
                set((state) => ({ deals: [...state.deals, deal] })),

            updateDealStage: (id, stage) =>
                set((state) => ({
                    deals: state.deals.map((deal) =>
                        deal.id === id ? { ...deal, stage } : deal
                    ),
                })),

            updateDeal: (id, updates) =>
                set((state) => ({
                    deals: state.deals.map((deal) =>
                        deal.id === id ? { ...deal, ...updates } : deal
                    ),
                })),

            assignEngineer: (dealId, engineerId, allocatedHours) =>
                set((state) => {
                    return {
                        deals: state.deals.map((deal) => {
                            if (deal.id !== dealId) return deal;

                            const existingAssignments = deal.hardAssignments || [];
                            const assignmentIndex = existingAssignments.findIndex(
                                (a) => a.engineerId === engineerId
                            );

                            let newAssignments = [...existingAssignments];

                            if (assignmentIndex >= 0) {
                                // Update existing
                                if (allocatedHours === 0) {
                                    newAssignments.splice(assignmentIndex, 1);
                                } else {
                                    newAssignments[assignmentIndex] = {
                                        engineerId,
                                        allocatedHours,
                                    };
                                }
                            } else if (allocatedHours > 0) {
                                // Add new
                                newAssignments.push({ engineerId, allocatedHours });
                            }

                            return { ...deal, hardAssignments: newAssignments };
                        }),
                    };
                }),

            updateCompanySettings: (settings) =>
                set((state) => {
                    const newSettings = { ...state.companySettings, ...settings };
                    // Recalculate all deals when settings change
                    const updatedDeals = state.deals.map((deal) => {
                        const overheadCost = calculateOverhead(
                            deal.baseLaborCost,
                            newSettings.overheadPercentage
                        );
                        const bufferCost = calculateRiskBuffer(
                            deal.baseLaborCost,
                            newSettings.bufferPercentage
                        );
                        const totalEstimatedCost = calculateTotalEstimatedCost(
                            deal.baseLaborCost,
                            overheadCost,
                            bufferCost
                        );
                        const estimatedGrossProfit = calculateEstimatedGrossProfit(
                            deal.clientBudget,
                            totalEstimatedCost
                        );
                        return {
                            ...deal,
                            overheadCost,
                            bufferCost,
                            totalEstimatedCost,
                            estimatedGrossProfit,
                        };
                    });

                    return { companySettings: newSettings, deals: updatedDeals };
                }),

            getCapacityPool: () => {
                const state = get();
                const pool: Record<RoleType, DepartmentCapacity> = {
                    frontend: {
                        role: "frontend",
                        totalMonthlyHours: 0,
                        softBookedHours: 0,
                        hardBookedHours: 0,
                    },
                    backend: {
                        role: "backend",
                        totalMonthlyHours: 0,
                        softBookedHours: 0,
                        hardBookedHours: 0,
                    },
                    pm: {
                        role: "pm",
                        totalMonthlyHours: 0,
                        softBookedHours: 0,
                        hardBookedHours: 0,
                    },
                    qa: {
                        role: "qa",
                        totalMonthlyHours: 0,
                        softBookedHours: 0,
                        hardBookedHours: 0,
                    },
                };

                // 1. Calculate Total Monthly Hours from Engineers
                state.engineers.forEach((eng) => {
                    pool[eng.role].totalMonthlyHours += eng.monthlyCapacityHours;
                });

                // 2. Calculate Soft and Hard Bookings from Deals
                state.deals.forEach((deal) => {
                    if (deal.stage === "lost") return;

                    if (deal.stage === "won") {
                        // Hard Bookings
                        const hardAssignments = deal.hardAssignments || [];
                        hardAssignments.forEach((assignment) => {
                            const eng = state.engineers.find(
                                (e) => e.id === assignment.engineerId
                            );
                            if (eng) {
                                // Assuming allocatedHours is total for the project timeline, we might need monthly equivalent if the math depends on it.
                                // Based on standard agency math, usually they book X hours out of a month. Assuming allocatedHours = total project hours,
                                // let's distribute it or assume it's the monthly booking metric for simplicity in this dashboard.
                                // *For simplicity in this 5-phase test, we'll treat allocatedHours as monthly capacity consumed.*
                                pool[eng.role].hardBookedHours += assignment.allocatedHours;
                            }
                        });
                    } else {
                        // Soft Bookings (Inquiry, Proposal)
                        // Use Ghost Roles + Probability
                        deal.ghostRoles.forEach((gr) => {
                            // total hours needed = quantity * roughly 160 hours/month ?
                            // The requirements say: `quantity × months × avgMonthlySalary`.
                            // We probably need a way to estimate hours.
                            // Let's assume 1 ghost role = 1 full time = 160 hours/month capacity consumed.
                            const totalRequiredHours = gr.quantity * 160;
                            const softBooked = calculateSoftBookedHours(
                                totalRequiredHours,
                                deal.probability
                            );
                            pool[gr.role].softBookedHours += softBooked;
                        });
                    }
                });

                return Object.values(pool);
            },

            getYearlyPnL: () => {
                const state = get();
                let sureMoney = 0;
                let probableMoney = 0;

                state.deals.forEach((deal) => {
                    if (deal.stage === "won") {
                        sureMoney += deal.estimatedGrossProfit;
                    } else if (deal.stage === "inquiry" || deal.stage === "proposal") {
                        probableMoney += deal.estimatedGrossProfit * (deal.probability / 100);
                    }
                });

                const forecast =
                    sureMoney + probableMoney - state.companySettings.yearlyFixedCost;

                return { sureMoney, probableMoney, forecast };
            },
        }),
        {
            name: "business-flow-storage", // local storage key
        }
    )
);
