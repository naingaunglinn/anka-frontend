import type { AITeamBuilderInput } from '@/types/aiTeamBuilder'

export const SYSTEM_PROMPT = `Context: You are helping a digital agency plan project staffing and costs.

Given a project brief and a pool of available employees, produce a staffing recommendation
and cost breakdown following these rules.

- Assign employees from the provided list using their exact IDs
- Include exactly 1 Manager and 1 Tech Lead if roles exist in the pool
- Fill remaining capacity with Engineers based on workload requirements
- Allocated hours per person must not exceed their maxProjectHours
- baseLaborCost = sum of (allocatedHours × costPerHour) for all team members
- overheadCost = baseLaborCost × overheadPercentage
- bufferCost = (baseLaborCost + overheadCost) × bufferPercentage
- totalEstimatedCost = baseLaborCost + overheadCost + bufferCost
- estimatedGrossProfit = clientBudget - totalEstimatedCost
- profitMarginPercent = (estimatedGrossProfit / clientBudget) × 100
- isFeasible = totalEstimatedCost <= clientBudget
- feasibilityNote: if feasible write "Project is within budget", otherwise state the amount it exceeds by
- aiReasoning: 3–5 sentences explaining team selection and cost rationale
- warnings: list capacity issues, margins below 10%, or budget risks

Output format (JSON):
{
  "team": [{ "employeeId": string, "name": string, "role": string, "allocatedHours": number, "monthlySalary": number, "costPerHour": number, "totalCost": number, "reasoning": string }],
  "baseLaborCost": number,
  "overheadCost": number,
  "bufferCost": number,
  "totalEstimatedCost": number,
  "estimatedGrossProfit": number,
  "profitMarginPercent": number,
  "isFeasible": boolean,
  "feasibilityNote": string,
  "aiReasoning": string,
  "warnings": string[]
}`

export function buildUserPrompt(input: AITeamBuilderInput): string {
    const activeEmployees = input.employees
        .filter(e => e.status === 'Active')
        .map(e => ({
            id: e.id,
            name: e.name,
            role: e.capacityRole ?? 'unknown',
            costPerHour: e.costPerHour,
            monthlySalary: e.monthlySalary,
            monthlyCapacityHours: e.workableHours,
            maxProjectHours: e.workableHours * input.timelineMonths,
        }))

    const overheadDecimal = input.companySettings.overheadPercentage / 100
    const bufferDecimal = input.companySettings.bufferPercentage / 100

    return `## Client Project Brief

Budget: $${input.clientBudget.toLocaleString()}
Timeline: ${input.timelineMonths} months
Total Workload: ${input.workloadHours} hours

Project Description:
${input.workloadDescription || 'No description provided.'}
${input.workloadDocumentText
            ? `\nAdditional Document:\n${input.workloadDocumentText.slice(0, 3000)}`
            : ''}

---

## Available Employees (active only)

${JSON.stringify(activeEmployees, null, 2)}

---

## Company Financial Settings

Overhead Percentage: ${input.companySettings.overheadPercentage}% (use decimal ${overheadDecimal} for calculations)
Risk Buffer Percentage: ${input.companySettings.bufferPercentage}% (use decimal ${bufferDecimal} for calculations)
Yearly Fixed Cost: $${input.companySettings.yearlyFixedCost.toLocaleString()}

## Monthly Overhead Items

${JSON.stringify(
                input.globalOverheads.map(o => ({ category: o.category, monthlyCost: o.monthlyCost })),
                null, 2
            )}

---

Build the optimal team and return ONLY the AITeamBuilderResult JSON object.`
}
