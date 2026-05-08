export interface KnowledgeChunk {
    id: string
    content: string
    source: string
    category: string
}

export interface DocMetadata {
    title: string
    category: string
    path: string
}

const DOC_FILES: DocMetadata[] = [
    // Backend specs
    { title: 'CRM & Deals', category: 'CRM', path: '/var/www/anka-api/specs/crm.md' },
    { title: 'Estimation', category: 'CRM', path: '/var/www/anka-api/specs/estimation.md' },
    { title: 'Contracts & Billing', category: 'Contracts', path: '/var/www/anka-api/specs/contracts.md' },
    { title: 'Projects', category: 'Projects', path: '/var/www/anka-api/specs/projects.md' },
    { title: 'Backend Overview', category: 'Architecture', path: '/var/www/anka-api/specs/overview.md' },
    // Frontend specs
    { title: 'Frontend Overview', category: 'Architecture', path: '/var/www/anka-frontend/specs/overview.md' },
    { title: 'Frontend CRM', category: 'CRM', path: '/var/www/anka-frontend/specs/crm.md' },
    { title: 'Frontend Estimation', category: 'CRM', path: '/var/www/anka-frontend/specs/estimation.md' },
    { title: 'Frontend Contracts', category: 'Contracts', path: '/var/www/anka-frontend/specs/contracts.md' },
    { title: 'Frontend Projects', category: 'Projects', path: '/var/www/anka-frontend/specs/projects.md' },
    // Root docs (check if exists)
    { title: 'Master Spec', category: 'Architecture', path: '/var/www/CLAUDE.md' },
    { title: 'AI Features', category: 'AI', path: '/var/www/anka-frontend/specs/ai.md' },
]

const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 100

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = []
    let i = 0

    while (i < text.length) {
        const end = Math.min(i + chunkSize, text.length)
        let chunk = text.slice(i, end)

        if (chunk.trim().length < 50) {
            if (chunks.length > 0) {
                chunks[chunks.length - 1] += '\n' + chunk
            }
        } else {
            chunks.push(chunk)
        }

        i += chunkSize - overlap
    }

    return chunks
}

function extractFrontmatter(content: string): { body: string; meta: Record<string, string> } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!match) return { body: content, meta: {} }

    const meta: Record<string, string> = {}
    match[1].split('\n').forEach(line => {
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
            const key = line.slice(0, colonIdx).trim()
            const val = line.slice(colonIdx + 1).trim()
            meta[key] = val
        }
    })

    return { body: match[2], meta }
}

function stripMarkdown(text: string): string {
    return text
        .replace(/#{1,6}\s+/g, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`{1,3}[^`]*`{1,3}/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

export async function ingestAllDocs(): Promise<KnowledgeChunk[]> {
    const chunks: KnowledgeChunk[] = []

    for (const doc of DOC_FILES) {
        try {
            const response = await fetch(`file://${doc.path}`)
            if (!response.ok) continue

            const content = await response.text()
            const { body } = extractFrontmatter(content)
            const cleanText = stripMarkdown(body)
            const textChunks = chunkText(cleanText, CHUNK_SIZE, CHUNK_OVERLAP)

            textChunks.forEach((chunk, idx) => {
                chunks.push({
                    id: `${doc.title.toLowerCase().replace(/\s+/g, '-')}-${idx}`,
                    content: chunk,
                    source: doc.title,
                    category: doc.category,
                })
            })
        } catch {
            // Skip files that can't be read
        }
    }

    return chunks
}

export function findRelevantChunks(
    chunks: KnowledgeChunk[],
    query: string,
    topK = 5,
): KnowledgeChunk[] {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const scores: { chunk: KnowledgeChunk; score: number }[] = []

    for (const chunk of chunks) {
        let score = 0
        const contentLower = chunk.content.toLowerCase()

        for (const word of queryWords) {
            if (contentLower.includes(word)) {
                score += 1
                const idx = contentLower.indexOf(word)
                const proximity = Math.max(0, 1 - idx / contentLower.length)
                score += proximity * 0.5
            }
        }

        for (const word of queryWords) {
            if (chunk.source.toLowerCase().includes(word) || chunk.category.toLowerCase().includes(word)) {
                score += 2
            }
        }

        if (score > 0) {
            scores.push({ chunk, score })
        }
    }

    return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(s => s.chunk)
}

export const KNOWLEDGE_BASE = [
    {
        id: 'crm-basics',
        category: 'CRM',
        source: 'CRM & Deals',
        content: `ANKA CRM manages sales pipeline through Deals. Key entities:
- Deal: A potential sale with stages (lead, opportunity, inquiry, proposal, contract, won, lost)
- GhostRole: Estimated team composition (role type, quantity, allocation %, min/max salary)
- HardAssignment: Confirmed employee assignment with allocated hours
- Win/Lose: Deals can be won (creates Contract + Project) or lost
- win_deal() stored procedure: Atomically creates Contract + Project when deal is won
  - Copies deal_hard_assignments to project_team_assignments
  - Contract gets client name and total_value from deal
  - Project gets budget_hours from deal.workload_hours`,
    },
    {
        id: 'estimation-engine',
        category: 'CRM',
        source: 'Estimation',
        content: `Estimation is embedded in the Deal, not a separate entity. Fields:
- workload_description: Scope text for AI team builder
- workload_hours: Total estimated hours
- timeline_months: Project duration
- client_budget: Maximum budget
- base_labor_cost, overhead_cost, buffer_cost, total_estimated_cost: Calculated fields
- estimated_gross_profit: client_budget - total_estimated_cost
- ghost_roles: Array of {roleType, quantity, months, minMonthlySalary, maxMonthlySalary}
- deal_hard_assignments: Confirmed team {employeeId, allocatedHours}
AI Team Builder uses these to generate staffing recommendations.`,
    },
    {
        id: 'contracts-billing',
        category: 'Contracts',
        source: 'Contracts & Billing',
        content: `Contracts are created ONLY by win_deal() stored procedure. No manual creation.
Contract fields:
- client: Client company name
- total_value: Contract value (from deal.client_budget or deal.estimated_value)
- revenue_recognized: Sum of paid invoices
- status: Draft (created), Active (signed), Completed, Cancelled
- invoices.total is a PostgreSQL GENERATED column — never set from PHP
Invoices belong to contracts (not projects). Milestones can group invoices.`,
    },
    {
        id: 'projects-delivery',
        category: 'Projects',
        source: 'Projects',
        content: `Projects are created ONLY by win_deal() stored procedure (1-to-1 with contract).
Project fields:
- name: From deal.name
- client: From deal.client
- budget_hours: From deal.workload_hours
- consumed_hours: Updated when time entries are approved
- status: Not Started → On Track / At Risk / Over Budget → Completed
project_team_assignments: Employees assigned to this project
- allocation_source: 'manual', 'ai', or 'deal_transfer' (from win_deal)
- allocated_hours: Per-employee hour budget for this project`,
    },
    {
        id: 'time-tracking',
        category: 'Time Tracking',
        source: 'Time Tracking',
        content: `Time Entries track work against projects:
- status: Draft → Pending → Approved/Rejected
- approved time entries increment project's consumed_hours
- billable flag marks whether entry affects client billing
- Time tracking page shows team utilization (% of capacity used)
AI Auto-Assign can populate project_team_assignments based on employee skills.`,
    },
    {
        id: 'organization-roles',
        category: 'Organization',
        source: 'Organization',
        content: `Organization structure:
- Departments: organizational units with optional manager
- Roles: billable roles (job_role_id on employees) with hourly rate
- Employees: have job_role_id (billing), capacity_role_id (pool bucket), workable_hours, monthly_salary
- capacity_role: customizable via capacity_roles table (not hardcoded anymore)
- Skills: tenant-specific skills with category (Technical, Creative, Management, Financial, Legal, Operations)
- employee_skills: many-to-many with proficiency (beginner/intermediate/expert)
Company settings: overhead_percentage, buffer_percentage, yearly_fixed_cost, employer_tax_percentage, benefits_percentage`,
    },
    {
        id: 'ai-team-builder',
        category: 'AI',
        source: 'AI Team Builder',
        content: `AI Team Builder (POST /api/ai-team-builder):
- Input: clientBudget, timelineMonths, workloadHours, workloadDescription, requiredSkills[], employees
- Output: team composition with cost breakdown, skill gap analysis, recommendations
- System prompt instructs Claude to match employees to required skills, calculate costs, identify gaps
- Skills filter lets user select required skills before building team
- SkillCoverageMatrix shows covered/gap skills and per-member match score
- Accept button saves team to deal's hard_assignments
Phase 2 Auto-Assign: POST /projects/{id}/auto-assign uses AI to assign team to won projects`,
    },
    {
        id: 'multi-tenancy',
        category: 'Architecture',
        source: 'Backend Overview',
        content: `Multi-tenancy:
- X-Tenant-ID header required on all tenant-scoped routes
- TenantScope middleware binds tenant_id to app('tenant_id')
- BelongsToTenant trait auto-injects tenant_id on create + adds global scope
- All models use UUID primary keys
- Employees belong to departments (FK), have job_role_id (FK), capacity_role_id (FK)
- Authentication: Laravel Sanctum with Bearer tokens
- AI features fire-and-forget log to /api/ai-usage for cost tracking`,
    },
]

export function findRelevantChunksByQuery(chunks: KnowledgeChunk[], query: string, topK = 5): KnowledgeChunk[] {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const scores: { chunk: KnowledgeChunk; score: number }[] = []

    for (const chunk of chunks) {
        let score = 0
        const contentLower = chunk.content.toLowerCase()

        for (const word of queryWords) {
            if (contentLower.includes(word)) {
                score += 1
                const idx = contentLower.indexOf(word)
                const proximity = Math.max(0, 1 - idx / contentLower.length)
                score += proximity * 0.5
            }
        }

        for (const word of queryWords) {
            if (chunk.source.toLowerCase().includes(word) || chunk.category.toLowerCase().includes(word)) {
                score += 2
            }
        }

        if (score > 0) {
            scores.push({ chunk, score })
        }
    }

    return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(s => s.chunk)
}