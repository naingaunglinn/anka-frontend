# UI Consistency Audit — anka-frontend

**Audit scope.** Every `.tsx` / `.ts` / `.css` file under `d:\anka\anka-frontend\` excluding `node_modules/` and `.next/` (190 source files total, 117 TSX files). Audit is read-only; no source files have been modified. Findings only.

**Style guide alignment.** The project is wired for shadcn/ui "new-york" with `baseColor: neutral` and `cssVariables: true` (`components.json`). In practice almost every screen bypasses those variables and writes raw hex (or Tailwind palette utilities) directly. That is the central finding of this report.

---

## Phase 1 — UI surface discovery

### 1.1 UI directories

| Directory | File count (tsx) | Role |
|---|---|---|
| `components/ui/` | 20 | shadcn/ui primitives (button, card, dialog, input, etc.) |
| `components/layout/` | 3 | `DashboardShell.tsx`, `Header.tsx`, `Sidebar.tsx` |
| `components/forms/` | 9 | Domain form components (Employee, Department, Role, …) |
| `components/tables/` | 7 | Domain table components (Employees, Roles, Departments, …) |
| `components/crm/` | 4 | `KanbanBoard`, `DealForm`, `AITeamBuilder`, `AITeamBuilderResult` |
| `components/estimation/` | 6 | `EstimationSimulator` (1503 lines), `EstimationRoleBuilder`, `AIDraftReviewPanel`, `ContractReadyDialog`, `SendEstimateDialog`, `SuggestChangesFromNotesDialog` |
| `components/project-pipeline/` | 4 | `WorkflowBar`, `CustomerRequirementsSection`, `OtPolicySection`, `RequirementsChecklist` |
| `components/project-pipeline/contracts/` | 7 | Contract draft wizard, template picker, etc. |
| `components/projects/` | 1 | `ProjectTeamPanel` |
| `components/time-tracking/` | 3 | `MasterAssignTable`, `MyScheduleEmployeeTable`, `TeamPreviewDialog` |
| `components/schedule-tracking/` | 2 | `PhaseDrillDownDrawer` (actually a Dialog), `ScheduleHealthBadge` |
| `components/charts/` | 1 | `DashboardCharts` (Recharts) |
| `components/chatbot/` | 1 | `ChatBot` |
| `components/ai-usage/` | 1 | `AIUsageDashboard` |
| `components/organization/` | 1 | `HolidaysTab` |
| `components/providers/` | 3 | `AppProviders`, `AuthInitializer`, `QueryClientProviderWrapper` |
| `components/` (top-level) | 9 | `FlagIcon`, `LoadingState`, `LocaleSwitcher`, `OrgSyncErrorBanner`, `PermissionGuard`, `ProtectedRoute`, `RouteGuard`, `SimulatedDateBar` |
| `app/(dashboard)/...` | 18 page.tsx files | Authenticated screens |
| `app/(auth)/...` | 3 page.tsx files | Login, register, OAuth callback |
| `app/landing/` | 1 | Server-side redirect to `/` |
| `app/page.tsx` | 1 | Public marketing landing page (177 className calls) |

### 1.2 Styling approach (verified from source)

| Approach | Verdict |
|---|---|
| Tailwind CSS 4 utility classes | **Primary.** `app/globals.css` only imports `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`. No `tailwind.config.{js,ts}` file exists. |
| `:root` CSS variables (`--primary`, `--background`, …) | **Defined but rarely consumed.** `globals.css` declares oklch values inside `@theme inline { … }` and `:root { … }`. Only `components/ui/*` and a handful of dashboard pages reference `bg-primary`, `text-foreground`, `bg-muted`. The vast majority of pages bypass these and write raw hex. |
| Raw hex via arbitrary Tailwind (`bg-[#00a7f4]`) | **Heavily used.** Brand blue `#00a7f4` appears 240 times; text grey `#8a8a8a` 305 times. |
| Tailwind palette utilities (`bg-slate-50`, `text-rose-600`) | **Heavily used in parallel** to hex above, often within the same file. |
| Inline `style={{ … }}` | 10 occurrences total; all but 2 are data-driven (computed widths, computed colors from a state machine). |
| CSS Modules / styled-components / Sass | **None.** Only one CSS file in the repo: `app/globals.css`. |
| `styled-jsx` (`<style jsx global>`) | **One** occurrence — `Sidebar.tsx` lines 129-132 (scrollbar hiding). |
| `class-variance-authority` (cva) | Used in `button.tsx`, `badge.tsx`, `alert.tsx`, `tabs.tsx`. Not used in any feature component. |
| Dark mode | Wired via `.dark` class in `globals.css` with oklch variables. Only `dashboard/page.tsx` and `time-tracking/MyScheduleEmployeeTable.tsx` actually emit `dark:*` utilities (≈30 occurrences total). No dark-mode toggle in the UI. |

### 1.3 Design token inventory (from `app/globals.css`)

Declared variables (light theme; dark values omitted for brevity but mirror the same names):

| Token | Light value (oklch) | Used by |
|---|---|---|
| `--background` | `oklch(1 0 0)` (white) | `bg-background` in `<body>`, ~6 components |
| `--foreground` | `oklch(0.145 0 0)` (near-black) | `text-foreground` ~14 occurrences |
| `--card` | `oklch(1 0 0)` | `bg-card` — but `components/ui/card.tsx` overrides this with a hand-rolled gradient |
| `--card-foreground` | `oklch(0.145 0 0)` | `text-card-foreground` — set in card.tsx, rarely overridden |
| `--popover` | `oklch(1 0 0)` | popover/select/tooltip |
| `--popover-foreground` | `oklch(0.145 0 0)` | popover/select |
| `--primary` | `oklch(0.205 0 0)` (near-black) | Buttons via `bg-primary` |
| `--primary-foreground` | `oklch(0.985 0 0)` | Button text |
| `--secondary` | `oklch(0.97 0 0)` | shadcn secondary variants |
| `--secondary-foreground` | `oklch(0.205 0 0)` | shadcn secondary text |
| `--muted` | `oklch(0.97 0 0)` | `bg-muted` for progress track, hovers |
| `--muted-foreground` | `oklch(0.556 0 0)` | `text-muted-foreground` ~30 occurrences |
| `--accent` | `oklch(0.97 0 0)` | hover backgrounds |
| `--accent-foreground` | `oklch(0.205 0 0)` | hover text |
| `--destructive` | `oklch(0.577 0.245 27.325)` (red) | destructive buttons, FormMessage |
| `--border` | `oklch(0.922 0 0)` | default borders |
| `--input` | `oklch(0.922 0 0)` | input borders |
| `--ring` | `oklch(0.708 0 0)` (mid grey) | focus ring |
| `--chart-1` through `--chart-5` | five oklch chroma values | `bg-chart-1`…`bg-chart-5` — never used directly; Recharts components hard-code their own colors |
| `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring` | sidebar palette | **Unused.** `components/layout/Sidebar.tsx` ignores them and uses raw hex (`#00a7f4`, `#171717`, `#e6e9ee`, …). |
| `--radius` | `0.625rem` (10px) | `--radius-sm` = 6px, `--radius-md` = 8px, `--radius-lg` = 10px, `--radius-xl` = 14px, `--radius-2xl` = 18px, `--radius-3xl` = 22px, `--radius-4xl` = 26px |

**No** token exists for spacing, typography scale, motion, or shadow — those are inherited from Tailwind defaults plus ad-hoc arbitrary values.

### 1.4 Routes / screens

| Path | Component | Purpose |
|---|---|---|
| `app/page.tsx` | `Home` | Public marketing landing page (hero, feature grid, AI section, modules grid, footer) |
| `app/landing/page.tsx` | redirect → `/` | Alias |
| `app/(auth)/login/page.tsx` | `LoginPage` | Login form, 2-column hero + card |
| `app/(auth)/register/page.tsx` | `RegisterPage` | Register form (same layout) |
| `app/(auth)/auth/google/callback/page.tsx` | OAuth handler | Centered status card |
| `app/(dashboard)/dashboard/page.tsx` | Main dashboard | KPI tiles, charts, P&L summary |
| `app/(dashboard)/project-pipeline/page.tsx` | Pipeline index | KanbanBoard wrapper |
| `app/(dashboard)/project-pipeline/[id]/page.tsx` | Deal detail | Workflow bar, sections, AI panels |
| `app/(dashboard)/project-pipeline/new/page.tsx` | New deal form | DealForm |
| `app/(dashboard)/project-pipeline/edit/[id]/page.tsx` | Edit deal form | DealForm |
| `app/(dashboard)/project-pipeline/[id]/contract-draft/new/page.tsx` | Contract draft wizard | ContractDraftWizard |
| `app/(dashboard)/project-pipeline/[id]/contract-draft/[draftId]/page.tsx` | Contract draft detail | SectionEditor, PdfPreviewDialog |
| `app/(dashboard)/estimation/page.tsx` | Estimation simulator wrapper | EstimationSimulator |
| `app/(dashboard)/contracts/page.tsx` | Contracts list | Table + tabs |
| `app/(dashboard)/contracts/[id]/page.tsx` | Contract detail | Workflow bar, milestones, invoices |
| `app/(dashboard)/projects/page.tsx` | Projects index | Table |
| `app/(dashboard)/projects/[id]/page.tsx` | Project detail | Team panel, phases |
| `app/(dashboard)/time-tracking/page.tsx` | Time entry log | Master assign table |
| `app/(dashboard)/schedule-tracking/page.tsx` | Schedule tracking | Drill-down drawer + table |
| `app/(dashboard)/my-schedule/page.tsx` | Per-employee schedule | MyScheduleEmployeeTable |
| `app/(dashboard)/financial/page.tsx` | P&L + financials | Tables + charts |
| `app/(dashboard)/forecast/page.tsx` | Revenue forecast | Cards + charts |
| `app/(dashboard)/organization/page.tsx` | Org index | Tables for departments / roles / skills / overheads + HolidaysTab |
| `app/(dashboard)/organization/employees/[id]/page.tsx` | Employee detail | EmployeeForm |
| `app/(dashboard)/tenant/page.tsx` | Tenant management (super-admin) | Tenant table |
| `app/(dashboard)/tenant/roles/page.tsx` | RBAC matrix | Roles & permissions |
| `app/(dashboard)/profile/page.tsx` | User profile | Form |
| `app/(dashboard)/admin/dashboard/page.tsx` | Super-admin dashboard | KPI tiles |
| `app/(dashboard)/admin/audit/page.tsx` | Audit logs | Filter bar + table + dialog |
| `app/(dashboard)/admin/billing/page.tsx` | Plans & billing | Plans table |
| `app/(dashboard)/admin/ai-usage/page.tsx` | AI usage analytics | AIUsageDashboard |

---

## Phase 2 — Element catalog

### 2.1 Buttons

#### 2.1a Canonical `Button` from `components/ui/button.tsx`

Definition: `cva` with **6 variants × 8 sizes**.

| Variant | Tailwind classes (verbatim) |
|---|---|
| `default` | `bg-primary text-primary-foreground hover:bg-primary/90` |
| `destructive` | `bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60` |
| `outline` | `border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50` |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` |
| `ghost` | `hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50` |
| `link` | `text-primary underline-offset-4 hover:underline` |

| Size | Classes |
|---|---|
| `default` | `h-9 px-4 py-2 has-[>svg]:px-3` |
| `xs` | `h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3` |
| `sm` | `h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5` |
| `lg` | `h-10 rounded-md px-6 has-[>svg]:px-4` |
| `icon` | `size-9` |
| `icon-xs` | `size-6 rounded-md [&_svg:not([class*='size-'])]:size-3` |
| `icon-sm` | `size-8` |
| `icon-lg` | `size-10` |

Shared base: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20`.

**Usage tally** (across the 300 `<Button` call sites):

| Variant declared explicitly | Count |
|---|---|
| `outline` | 165 |
| `ghost` | 82 |
| `destructive` | 10 |
| `secondary` | 7 |
| `link` | 1 |
| `default` (omitted, so default kicks in) | 35 |

#### 2.1b Primary-action button reskins (override the `default` variant)

`bg-primary` evaluates to oklch(0.205 0 0) — near-black. Almost every primary-action button in the app overrides this with a brand cyan. This produces ≥ 7 distinct primary-button color combos.

| File | Line | Classes |
|---|---|---|
| `app/(auth)/login/page.tsx` | 142 | `h-11 w-full bg-[#00a7f4] text-base font-semibold text-white shadow-[0_10px_24px_rgba(0,167,244,0.35)] hover:bg-[#0599df]` |
| `app/(auth)/register/page.tsx` | 213 | same as login |
| `app/page.tsx` | 25, 48 | `inline-flex items-center gap-2 rounded-full bg-[#171717] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#00a7f4]` (anchor styled as button) |
| `app/page.tsx` | 158-160 | `inline-flex items-center gap-2 rounded-full bg-[#00a7f4] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0086c4]` |
| `components/chatbot/ChatBot.tsx` | 266 | `fixed h-14 w-14 rounded-full shadow-xl bg-indigo-600 hover:bg-indigo-700 text-white z-50` |
| `components/chatbot/ChatBot.tsx` | 340 | `<Button size="icon">` (default variant — near-black) sending in chat |
| `components/project-pipeline/contracts/ContractDraftWizard.tsx` | (button) | `bg-indigo-600 hover:bg-indigo-700` (3 occurrences), `bg-indigo-700` (3 occurrences) |
| `components/estimation/EstimationSimulator.tsx` | 977-993 | `w-full gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-60` (indigo-tinted outline used as secondary AI action) |
| `app/(dashboard)/contracts/page.tsx` | 423-428, 433-438, 445-450 | Bare `<button className="text-[#00a7f4] hover:underline text-left">` (link-styled, replaces `variant="link"`) |
| `app/(dashboard)/contracts/page.tsx` | 446 | `text-sm text-purple-600 hover:underline text-left` (a different link color in the same table) |
| `app/(dashboard)/contracts/[id]/page.tsx` | 330, 396, 404 | Bare `<button>` in the same file, hex-styled. |

#### 2.1c Pagination buttons (no `<Button>` wrapper)

| File | Lines | Classes |
|---|---|---|
| `app/(dashboard)/admin/audit/page.tsx` | 241-247, 248-254 | `px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-white` |

These bypass the canonical Button entirely.

#### 2.1d Distinct primary-button combos summary (concrete values)

| Combo | Where |
|---|---|
| `bg-primary text-primary-foreground hover:bg-primary/90` (oklch black) | shadcn default — used for 35 implicit-default buttons |
| `bg-[#00a7f4] hover:bg-[#0599df] text-white h-11 shadow-[0_10px_24px_rgba(0,167,244,0.35)]` | login / register submit |
| `bg-[#00a7f4] hover:bg-[#0086c4] text-white rounded-full px-6 py-3` | landing CTA |
| `bg-[#171717] hover:bg-[#00a7f4] text-white rounded-full px-5 py-2.5` | landing nav sign-in |
| `bg-indigo-600 hover:bg-indigo-700 text-white` | chatbot trigger, contract wizard |
| `bg-indigo-700` | contract wizard active step |
| `bg-emerald-600 hover:bg-emerald-700` | contracts/[id] mark-as-signed style segments (`#emerald-600` appears 3× in contracts/[id]) |
| `text-[#00a7f4] hover:underline` (bare `<button>`) | contract row links, contracts/[id] section links |
| `text-purple-600 hover:underline` (bare `<button>`) | linked project link in contracts table |

### 2.2 Form inputs

#### 2.2a Text input — canonical (`components/ui/input.tsx`)

```
file:text-foreground placeholder:text-[#4a4a4a] selection:bg-primary selection:text-primary-foreground
dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1
text-base shadow-xs transition-[color,box-shadow] outline-none
file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium
disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive
```

Placeholder color hard-coded `#4a4a4a` — does not respect `text-muted-foreground` tokens.

**Override sites** (`<Input className="…">`):

| File | Classes added |
|---|---|
| `app/(auth)/login/page.tsx` 114, 132 | `h-11 border-[#171717]/20 bg-white focus-visible:ring-2 focus-visible:ring-[#00a7f4]` (overrides height + ring color) |
| `app/(auth)/register/page.tsx` (similar) | same |
| `components/SimulatedDateBar.tsx` 75 | `w-44 h-8 text-sm` (height 32px, not 36px) |
| `components/chatbot/ChatBot.tsx` 339 | `flex-1` |
| 60+ other call sites | bare `<Input />` |

#### 2.2b Native `<select>` (bypasses `Select` primitive)

5 occurrences — all in admin pages, all with a different ring color than the rest of the app:

| File | Line | Classes |
|---|---|---|
| `app/(dashboard)/admin/audit/page.tsx` | 77 | `text-sm border border-[#e6e9ee] rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48` |
| `app/(dashboard)/admin/audit/page.tsx` | 91 | same with `w-36` |
| `app/(dashboard)/admin/billing/page.tsx` | 136 | `text-sm border border-[#e6e9ee] rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50` |
| `app/(dashboard)/admin/billing/page.tsx` | 150 | same |
| `components/organization/HolidaysTab.tsx` | 51 | (native select, different styling) |

#### 2.2c `Select` (Radix) trigger — canonical (`components/ui/select.tsx`)

```
border-input data-[placeholder]:text-[#4a4a4a] [&_svg:not([class*='text-'])]:text-[#4a4a4a]
focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20
dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive
dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2
rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs
transition-[color,box-shadow] outline-none focus-visible:ring-[3px]
disabled:cursor-not-allowed disabled:opacity-50
data-[size=default]:h-9 data-[size=sm]:h-8
```

Sizes: `default` (h-9) / `sm` (h-8). Used in 261 call sites. Multiple in-file overrides for compact UI: `EstimationSimulator.tsx` line 791 `h-7 px-2 gap-1 text-xs w-auto min-w-[110px]` (creates a third "xs" size in practice).

#### 2.2d Textarea (`components/ui/textarea.tsx`)

```
flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base
ring-offset-background placeholder:text-[#4a4a4a]
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
disabled:cursor-not-allowed disabled:opacity-50 md:text-sm
```

Notably **different focus pattern** than `Input` (uses `ring-2 + ring-offset-2` instead of `ring-[3px]`). Three call sites add custom min-h:
- `components/crm/AITeamBuilder.tsx` 470: `w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none` (bypasses canonical Textarea entirely — uses a raw `<textarea>` styled with arbitrary indigo).

#### 2.2e Checkbox / radio / toggle / date / file

- **Checkbox.** No canonical `Checkbox` primitive in `components/ui/`. Searches across the codebase find checkboxes only via Radix `[role=checkbox]` slot inside Table. There are no visible feature-level checkboxes — work likely uses Radix Checkbox directly through `radix-ui` import.
- **Radio.** No canonical primitive. No radio inputs in the audited screens.
- **Toggle.** Canonical `Switch` (`components/ui/switch.tsx`) — sizes `sm` (h-3.5 w-6) / `default` (h-[1.15rem] w-8). Few call sites.
- **Date.** Two patterns:
  - Native `<Input type="date">` with `w-44 h-8 text-sm` (`SimulatedDateBar.tsx`).
  - `react-day-picker` + `components/ui/calendar.tsx` (rendered inside Popover).
- **File.** Native file inputs styled via the `file:` modifier in `input.tsx` (no canonical file uploader).

#### 2.2f Form-level wrappers

`components/ui/form.tsx` provides `Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage`. Used in 9 form components (`components/forms/*.tsx`). `FormItem` uses `grid gap-2` (8px row gap). `FormLabel` applies `data-[error=true]:text-destructive`. `FormMessage` is `text-destructive text-sm`. **Forms in admin pages bypass `Form` entirely** (audit page filters use raw `<label>` + native `<select>`).

### 2.3 Form labels / helper text / error messages / required indicators

| Pattern | Where | Concrete styling |
|---|---|---|
| Required indicator: red asterisk | `EmployeeForm.tsx` 184, 221, others | `<span className="text-destructive">*</span>` |
| Optional indicator (lowercase) | `EmployeeForm.tsx` 198, 243, 267, 391 | `<span className="text-[#4a4a4a] text-xs font-normal">{t('optional_lowercase')}</span>` |
| Helper / hint text (small grey) | `EmployeeForm.tsx` 267 | `text-[#4a4a4a] text-xs font-normal` |
| Helper text (different shade) | `EstimationSimulator.tsx` 973 | `text-xs text-[#4a4a4a] text-center` |
| Helper text (slate) | `forecast/page.tsx` 812 | `text-slate-500` |
| Error message | `form.tsx` `FormMessage` | `text-destructive text-sm` |
| Inline form error (manual) | login page (via form.setError) | renders inside FormMessage |
| Field label | `label.tsx` | `text-sm leading-none font-medium` |
| Section label (uppercase / tracking) | `EstimationSimulator.tsx` 811, `forecast/page.tsx` 845 | `text-xs font-medium text-slate-500 uppercase tracking-wider mb-3` vs `text-xs font-semibold uppercase text-slate-500` (different weight, different tracking) |
| Section label (uppercase / brand) | `Sidebar.tsx` 102 | `text-[11px] uppercase tracking-wider text-[#8a8a8a]` |
| Section label (sidebar admin) | `page.tsx` 57, 85 | `font-mono text-xs uppercase tracking-[0.18em] text-[#0086c4]` |

**Net result.** Helper-text color uses `#4a4a4a`, `#8a8a8a`, `text-slate-400`, `text-slate-500`, `text-muted-foreground` and `text-[#171717]/65` interchangeably across files.

### 2.4 Modals / dialogs / drawers / popovers / tooltips

| Element | Source | Notable styling |
|---|---|---|
| `Dialog` | `components/ui/dialog.tsx` | Overlay `bg-black/50`. Content `bg-background … max-w-[calc(100%-2rem)] … rounded-lg border p-6 shadow-lg sm:max-w-lg`. Close button `top-4 right-4 rounded-xs opacity-70 hover:opacity-100`. |
| Drawer | **Does not exist as a primitive.** `PhaseDrillDownDrawer.tsx` is a regular Dialog with a "Drawer" name. |
| `Popover` | `components/ui/popover.tsx` | `w-72 rounded-md border p-4 shadow-md` |
| `Tooltip` | `components/ui/tooltip.tsx` | `bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs` — black tooltip against the rest of the UI |
| `DropdownMenu` | `components/ui/dropdown-menu.tsx` (Radix) | Standard shadcn |
| Toast | `react-hot-toast` `<Toaster position="top-right">` in `DashboardShell.tsx`. 115 `toast.*` call sites. No central style override — all toasts use library defaults. |

**Dialog content overrides observed** in feature code:
- `app/(dashboard)/admin/audit/page.tsx` 263 → `className="sm:max-w-[600px] bg-white"` (forces a 600px width)
- `components/chatbot/ChatBot.tsx` 274 → uses **Card** (not Dialog) as a fixed-position floating panel: `fixed w-[380px] max-h-[540px] shadow-2xl border-indigo-200 flex flex-col z-50`

### 2.5 Cards / panels / list items / table rows

#### 2.5a `Card` primitive (`components/ui/card.tsx`)

```
bg-gradient-to-br from-white via-[#fafcfe] to-[#f0f9ff] text-card-foreground
flex flex-col gap-6 rounded-xl border py-6
shadow-[0_8px_30px_-12px_rgba(23,23,23,0.08)]
```

The Card primitive baked a brand-cyan gradient and a custom shadow into every Card in the app. Many feature components then re-override this:

| File | Override classes |
|---|---|
| `app/(dashboard)/dashboard/page.tsx` 481, 492, 505, 516 | `Card className="border-slate-200 shadow-sm"` (overrides `border` and `shadow-[0_8px_30px…]`) |
| `app/(dashboard)/forecast/page.tsx` 806 | `Card className="shadow-sm border-slate-100 lg:col-span-1 bg-white text-slate-900"` (overrides gradient and tokens) |
| `components/estimation/EstimationSimulator.tsx` 748, 1037 | `Card className="shadow-sm border-slate-100"` |
| `components/crm/KanbanBoard.tsx` 207 | `Card className="border border-l-4 shadow-sm hover:shadow-md transition-all duration-200 …"` |
| `app/(auth)/login/page.tsx` 91 | `Card className="… border-[#00a7f4]/20 bg-white/92 shadow-[0_25px_70px_rgba(0,0,0,0.12)] backdrop-blur-sm"` |
| Landing custom card (not using `Card` primitive) | `app/page.tsx` 137, 147 → `<article className="rounded-2xl border border-[#e6e9ee] bg-white p-7 shadow-[0_12px_36px_-20px_rgba(0,166,244,0.25)]">` |

**4 distinct card shadows in use.** No semantic shadow scale.

#### 2.5b Panel / list-item / row patterns (no canonical primitive)

| Pattern | Example | Classes |
|---|---|---|
| Inline status row (light wash) | `EstimationSimulator.tsx` 813 | `flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100` |
| Subtle stat tile | `forecast/page.tsx` 827 | `rounded-md border border-slate-200 bg-slate-50 px-3 py-2` |
| Hero feature pill | `app/page.tsx` 37-38 | `inline-flex items-center gap-2 rounded-full bg-[#00a7f4]/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#0086c4]` |
| Workflow step | `WorkflowBar.tsx` | `flex-1 px-4 py-3 ${step.done ? 'bg-emerald-50' : step.active ? 'bg-blue-50' : 'bg-slate-50'}` |

### 2.6 Tables

`components/ui/table.tsx` defines:

| Slot | Classes |
|---|---|
| `Table` wrapper | `relative w-full overflow-x-auto` |
| `<table>` | `w-full caption-bottom text-sm` |
| `TableHeader` | `[&_tr]:border-b` |
| `TableRow` | `hover:bg-[#00a7f4]/5 data-[state=selected]:bg-[#00a7f4]/10 border-b transition-colors` (brand-cyan hover baked in) |
| `TableHead` | `text-[#171717] h-10 px-2 text-left align-middle font-medium whitespace-nowrap bg-gradient-to-r from-[#f0f9ff] to-[#fafcfe]` (cyan gradient baked in) |
| `TableCell` | `p-2 align-middle whitespace-nowrap` |
| `TableCaption` | `text-[#4a4a4a] mt-4 text-sm` |
| `TableFooter` | `bg-muted/50 border-t font-medium` |

**Raw `<table>` usage** (bypasses canonical Table — 3 files):
- `app/(dashboard)/admin/audit/page.tsx` — pagination table
- `app/(dashboard)/admin/billing/page.tsx` — tenants table with raw `<th className="text-left py-3 px-4 font-medium text-[#8a8a8a]">` and `<tr className="border-b last:border-0 hover:bg-slate-50/50">`
- `app/(dashboard)/projects/page.tsx` — pagination table (raw `<table>` with bare `<button>` row links)

**Sort / filter controls.** No canonical sort header — sortable tables use ad-hoc click handlers on `<TableHead>` with `cursor-pointer` (e.g. `time-tracking/MasterAssignTable.tsx`).

### 2.7 Navigation

| Element | Where | Styling |
|---|---|---|
| Top app nav (dashboard) | `components/layout/Header.tsx` | `h-16 w-full flex items-center justify-between px-6 bg-[#f0f9ff] border-b border-[#e6e9ee] shadow-sm` |
| Side nav (dashboard) | `components/layout/Sidebar.tsx` | `bg-gradient-to-br from-white via-[#fafcfe] to-[#f0f9ff] text-[#171717] shadow-xl border-r border-[#e6e9ee]` |
| Sidebar item (default) | Sidebar.tsx 113 | `text-sm group flex p-3 w-full font-medium cursor-pointer hover:text-[#0086c4] hover:bg-[#00a7f4]/10 rounded-lg transition` |
| Sidebar item (active) | Sidebar.tsx 114 | `text-[#0086c4] bg-[#00a7f4]/10` |
| Sidebar item (default text) | Sidebar.tsx 114 | `text-[#4a4a4a]` |
| Sidebar item icon colors | Sidebar.tsx 35-56 | hard-coded **13** distinct icon colors: `text-[#00a7f4]`, `text-violet-500`, `text-pink-700`, `text-orange-700`, `text-emerald-500`, `text-green-700`, `text-amber-500`, `text-rose-500`, `text-emerald-500`, `text-[#0086c4]`, `text-indigo-500`, `text-violet-500`, `text-fuchsia-600` (+ admin set: `-400` variants for `violet`, `emerald`, `amber`, `pink`, plus `#00a7f4`) |
| Sidebar collapse toggle | Sidebar.tsx 77-83 | `absolute -right-3 top-6 bg-white text-[#4a4a4a] rounded-full p-1 border border-[#e6e9ee] hover:bg-[#f8fafc] hover:text-[#00a7f4]` |
| Landing nav | `app/page.tsx` 11-31 | `fixed inset-x-0 top-0 z-50 border-b border-[#e6e9ee] bg-[#f8fafc]/85 backdrop-blur-xl` |
| Tabs | `components/ui/tabs.tsx` | `variant="default"`: `bg-muted` track + `data-[state=active]:bg-background shadow-sm`; `variant="line"`: transparent track + bottom-bar indicator via `::after` |
| Breadcrumbs | **Not implemented anywhere.** No `Breadcrumb` primitive, no breadcrumb pattern in any page. |
| Pagination | Ad-hoc `<button>` pairs (Previous/Next) — see 2.1c. No canonical pagination component. |

### 2.8 Alerts / toasts / banners / empty states / loading states

#### 2.8a Alert primitive (`components/ui/alert.tsx`)

Variants:
- `default`: `bg-card text-card-foreground` (i.e. inherits Card gradient — likely accidental)
- `destructive`: `text-destructive bg-card`

Used by feature code: **0 direct uses** found via grep on `<Alert ` (audit text shows `AlertCircle` icon usages only). The Alert primitive is effectively dead code.

#### 2.8b Banner / inline notice patterns (handwritten, not using Alert)

| Color / intent | Example | Concrete classes |
|---|---|---|
| Info / blue | (no canonical example) | |
| Warning / amber | `SimulatedDateBar.tsx` 90 | `rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900` |
| Warning / amber (with title) | `forecast/page.tsx` 818-822 | `rounded-md border border-amber-200 bg-amber-50 px-4 py-3` + `text-sm font-medium text-amber-800` + `text-xs text-amber-700` |
| Warning / amber (with icon) | `forecast/page.tsx` 834-841 | `p-4 rounded-lg border ${analysis.bg}` — `analysis.bg` is one of several pastel pairs |
| Error / rose | `OrgSyncErrorBanner.tsx` 33-50 | `flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-3` + `text-rose-700` title + `text-rose-600 mt-0.5` body + `text-rose-600/80 mt-1` context + `h-7 border-rose-300 text-rose-700 hover:bg-rose-100` retry button |
| Estimation draft chip | `EstimationSimulator.tsx` 761-768 | inline `style={{ background: hasUnsavedChanges ? '#fef3c7' : '#d1fae5', color: hasUnsavedChanges ? '#92400e' : '#065f46' }}` (raw hex inline style) |

Background pastel counts: `bg-slate-50` 72, `bg-slate-100` 61, `bg-emerald-50` 54, `bg-amber-50` 43, `bg-rose-50` 32, `bg-slate-200` 22, `bg-indigo-50` 18, `bg-red-50` 13, `bg-blue-50` 8, `bg-violet-50` 6, `bg-purple-50` 3, `bg-orange-50` 2, `bg-yellow-50` 1. That's **13 background pastels** in use for the same "subtle status surface" concept.

#### 2.8c Toast

`<Toaster position="top-right" />` in `DashboardShell.tsx`. 115 call sites use `toast.success(…)`, `toast.error(…)`, etc. No `toastOptions` override — every toast uses library defaults (white bg, custom emojis from `react-hot-toast`).

#### 2.8d Empty states

No canonical `EmptyState` component. Ad-hoc:
- `project-pipeline/page.tsx` → `<p className="text-sm text-[#8a8a8a]">{t('no_deals_match_filters')}</p>`
- `ChatBot.tsx` 290-294 → `<div className="text-center py-6 text-slate-500">…<Bot className="h-8 w-8 mx-auto mb-2 text-indigo-300" /><p className="text-sm">{t('ask_me_anything')}</p>`
- `EstimationSimulator.tsx` 972-975 → centered helper line

#### 2.8e Loading states

- Canonical: `components/LoadingState.tsx` (`Loader2` + label, `text-slate-500` / `text-slate-400`, 3 sizes).
- Inline pattern (165 occurrences of `Loader2` token, 27 inline `<Loader2 />` in feature code with various `h-3 w-3`, `h-4 w-4`, `h-5 w-5` sizes).
- `LoadingState` component itself uses `text-slate-500` and `text-slate-400`, again bypassing tokens.

### 2.9 Headings / body text / captions / links

| Element | Most common pattern | Other patterns |
|---|---|---|
| `<h1>` page title | `text-2xl font-bold tracking-tight text-[#171717]` (≥ 8 dashboard pages) | `text-2xl font-bold` (no color); `text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl` (auth pages); `text-5xl font-semibold leading-[0.95] tracking-[-0.03em] md:text-7xl` (landing hero) |
| `<h2>` section | varies — `text-lg font-semibold`; `text-4xl font-semibold tracking-tight md:text-6xl` (landing) | also `text-3xl font-bold` (financial/forecast); `text-base font-semibold` (sidebar widget) |
| `<h3>` subsection | `font-semibold text-slate-700` (`KanbanBoard.tsx` 173); `text-sm font-bold ${analysis.color}` (forecast) | varies widely |
| `CardTitle` | `leading-none font-semibold` (no size set) | overridden on every Card to `text-base`, `text-lg`, `text-sm font-medium text-muted-foreground`, `text-2xl font-bold`, etc. |
| `CardDescription` | `text-[#4a4a4a] text-sm` (in card.tsx); often overridden to `text-xs` or `text-slate-500` |
| Body | `text-sm` (425 occurrences), `text-xs` (387), `text-base` (34) |
| Captions / small | `text-xs text-[#8a8a8a]` or `text-xs text-slate-400` or `text-xs text-muted-foreground` interchangeably |
| Link (inline) | `text-[#00a7f4] hover:underline` (in tables); `text-blue-500` (forecast); `text-primary underline-offset-4 hover:underline` (canonical link variant — rarely used) |
| Link (back to home) | login page 152-154 → `font-semibold text-[#00a7f4] hover:underline` |
| Anchor button (landing) | `inline-flex items-center gap-2 rounded-full bg-[#171717] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#00a7f4]` |

**Font.** `app/layout.tsx` loads `Geist` (`--font-geist-sans`) and `Geist_Mono` (`--font-geist-mono`) from `next/font/google`. `globals.css` maps these to `--font-sans` / `--font-mono`. Applied via `<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>`. No alternate font is loaded anywhere.

### 2.10 Icons

- **Library: Lucide React only** (`lucide-react@^0.575.0`).
- **Custom flag icons.** `components/FlagIcon.tsx` uses `country-flag-icons` for the LocaleSwitcher.
- **Sizes in use** (concrete):
  - `h-4 w-4` — 240 occurrences (canonical)
  - `h-5 w-5` — 36
  - `h-3.5 w-3.5` — 64 (mid-size; not from any spec)
  - `h-3 w-3` — 29
  - `h-6 w-6` — 6
  - `size-9`, `size-8`, `size-6`, `size-10` — from Button icon sizes
- **Icon colors.** Lucide icons inherit `currentColor`. In sidebar items and dashboard tiles they get explicit colors via parent `text-{color}`. Brand cyan icons appear as `text-[#00a7f4]` (≈54 occurrences). Sidebar uses 13 distinct icon hues (see 2.7).

### 2.11 Badges / chips / tags / avatars

#### 2.11a Badge (`components/ui/badge.tsx`)

Base: `inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1`.

Variants:
| Variant | Classes |
|---|---|
| `default` | `bg-primary text-primary-foreground` |
| `secondary` | `bg-secondary text-secondary-foreground` |
| `destructive` | `bg-destructive text-white` |
| `outline` | `border-border text-foreground` |
| `ghost` | (transparent until hover) |
| `link` | `text-primary underline-offset-4` |

#### 2.11b Badge re-skins (variant="outline" + className override)

| Where | className override | Effective look |
|---|---|---|
| `contracts/page.tsx` 456-462 | `bg-[#00a7f4]/5 text-[#0086c4] border-[#00a7f4]/20` | brand-blue status |
| same line, next branch | `bg-violet-50 text-violet-700 border-violet-200` | Signed |
| same line, next branch | `bg-emerald-50 text-emerald-700 border-emerald-200` | Completed |
| same line, next branch | `bg-rose-50 text-rose-700 border-rose-200` | Cancelled |
| same line, fallback | `bg-slate-100 text-slate-700 border-slate-200` | Other |
| `EstimationSimulator.tsx` 821 | `px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 font-medium` | "Latest" pill (not a Badge — raw span, `rounded` not `rounded-full`) |
| `EstimationSimulator.tsx` 825 | `px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-medium` | Notes pill |
| `EstimationSimulator.tsx` 817 | `px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500 font-medium` | Resource count pill |
| `KanbanBoard.tsx` 174, 215 | `inline-flex h-6 min-w-6 px-1.5 items-center justify-center rounded text-xs font-bold ${stageColor.bg} ${stageColor.text}` | Rank chip (different shape and weight from Badge) |
| `admin/billing/page.tsx` 164-168 | `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700` / `bg-rose-50 text-rose-700` | Active/Inactive (raw span, not Badge) |
| `chatbot/ChatBot.tsx` 308 | `<Badge variant="outline" className="text-xs py-0 text-xs">` | Source chip (note repeated `text-xs`) |

Per-rank palette from `lib/dealRanks.ts`: lead (slate), qualified (blue-50), negotiation (purple-50), won (emerald-50). Yet **Negotiation** also gets purple (`purple`) while **Signed** in the contracts table is violet — two distinct purples in adjacent screens.

#### 2.11c Avatar (`components/ui/avatar.tsx`)

Sizes: `sm` (size-6), `default` (size-8), `lg` (size-10). AvatarFallback: `bg-muted text-[#4a4a4a] flex size-full items-center justify-center rounded-full text-sm`. Header uses `Avatar className="h-8 w-8 bg-primary/10"` and `AvatarFallback className="text-primary font-bold"` — primary-color tint (Header.tsx 67-71).

---

## Phase 3 — Value extraction

### 3.1 Colors actually in use

The codebase contains **315 distinct hex literals**. The 25 most common (count ≥ 5):

| # | Hex | Count | Semantic role observed |
|---|---|---|---|
| 1 | `#8a8a8a` | 305 | Tertiary text / faded text / icon (text-[#8a8a8a]) |
| 2 | `#00a7f4` | 240 | Brand cyan (primary) — buttons, links, accents, sidebar logo |
| 3 | `#171717` | 231 | Default text / strong headings |
| 4 | `#4a4a4a` | 195 | Secondary text / placeholder / muted body |
| 5 | `#e6e9ee` | 155 | Default border |
| 6 | `#000000` | 60 | Comes from cn() merges and shadow rgba(); not used as a fill outside chart edges |
| 7 | `#f8fafc` | 47 | Page bg (dashboard shell + landing) |
| 8 | `#fafafa` | 34 | Card subtle wash |
| 9 | `#0086c4` | 33 | Brand cyan **dark** (hover state, label text) |
| 10 | `#f0f9ff` | 21 | Card gradient stop + sidebar gradient |
| 11 | `#ffffff` | 18 | Inline white |
| 12 | `#fafcfe` | 17 | Card / sidebar gradient mid stop |
| 13 | `#0a0a0a` | 17 | Card-foreground dark |
| 14 | `#262626` | 15 | Heading dark variant |
| 15 | `#fafbfc` | 14 | PhaseDrillDownDrawer cell wash |
| 16 | `#f5f5f5` | 12 | (rare) |
| 17 | `#e5e5e5` | 11 | (rare) |
| 18 | `#eef2ff` | 10 | indigo-50 equivalent (in dialogs) |
| 19 | `#a1a1a1`, `#1447e6` | 9 | (low) |
| 20 | `#fffbeb`, `#ecfdf5`, `#FFA400`, `#FF5E00` | 8 each | Forecast / status |
| 21 | `#e2e8f0`, `#737373`, `#64748B`, `#2F8A00`, `#10B981`, `#0599df` | 7 each | charts, brand cyan dark-hover |
| 22 | `#fb2c36`, `#f99c00`, `#e40014`, `#a0a0a0`, `#E95F5D`, `#DEADED`, `#90FF57`, `#7008e7`, `#015064` | 6 each | charts + ad-hoc UI |
| 23 | `#fef2f2`, `#eff6ff`, `#d9e7f2`, `#ac4bff`, `#EF4444`, `#69AB32`, `#3182bd` | 5 each | charts + status |

Plus Tailwind palette names: slate (300+ usages), emerald (~150), rose (~90), amber (~80), indigo (~70), blue (~30), purple/violet/fuchsia (~25), red (~15), orange/yellow (~10). **The slate scale is co-equal with the hex grey scale** — `text-slate-500` (≈80 sites) and `text-[#8a8a8a]` (≈300 sites) both serve as "secondary text".

### 3.2 Typography

| Property | Values in use |
|---|---|
| Family | `Geist` (sans) globally; `Geist_Mono` only in two `font-mono` taglines (landing page 57, 85) |
| Size | `text-xs` (387), `text-sm` (425), `text-base` (34), `text-lg` (45), `text-xl` (16), `text-2xl` (44), `text-3xl` (38), `text-4xl` (6), `text-5xl` (1), `text-6xl` (5) — **10 sizes** |
| Weight | `font-normal` (37), `font-medium` (366), `font-semibold` (123), `font-bold` (124) |
| Line height | mostly default; `leading-none`, `leading-tight`, `leading-relaxed`, `leading-7`, `leading-8`, `leading-snug`, plus arbitrary `leading-[0.95]` and `leading-[1.05]` on landing/auth hero |
| Letter spacing | mostly default; `tracking-tight` ~30 sites; `tracking-wide`, `tracking-wider`; arbitrary `tracking-[-0.03em]` (landing hero), `tracking-[0.18em]` and `tracking-[0.2em]` (uppercase eyebrow labels) |

### 3.3 Spacing scale used

`px-` (1, 2, 3, 4, 5, 6) — top 3: `px-4` (97), `px-2` (63), `px-3` (45). `py-` (0, 1, 2, 3, 4, 6, 8) — top: `py-2` (75), `py-1` (72), `py-3` (71), `py-4` (52). `gap-` (1, 2, 3, 4, 5, 6, 8) — top: `gap-2` (227), `gap-3` (96), `gap-1` (91), `gap-4` (57). `space-y-` (0, 1, 2, 3, 4, 5, 6, 8) — top: `space-y-1` (121), `space-y-4` (68), `space-y-6` (51), `space-y-2` (44), `space-y-3` (37).

This corresponds to the Tailwind 4-step scale (4/8/12/16/24/32/48 px). The codebase rarely uses `5` and never uses `7` or `9` — clean.

### 3.4 Sizing

Heights (component-level): `h-6` (21), `h-7` (27), `h-8` (75), `h-9` (20), `h-10` (8), `h-11` (8), `h-12` (5). `h-9` is the shadcn default; `h-8` is the most common in this repo because so many components opt into the `sm` size or override explicitly. `h-11` appears only in login/register form fields.

Min-height arbitraries: `min-h-[60px]` (3), `min-h-[80px]` (2 — Textarea default), `min-h-[120px]` (3). Width arbitraries: `min-w-[110px]`, `min-w-[180px]`, `min-w-[200px]`, `min-w-[280px]`, `w-[280px]`, `w-[380px]`, `max-h-[540px]`, `max-w-[600px]`, `w-44`, `w-48`, `w-36`, `w-72`, `w-[180px]`.

### 3.5 Borders

Border width: default `border` (1px) is dominant. `border-l-4` used by KanbanBoard cards. Border style is always solid (no `border-dashed` found). Border color: `border-[#e6e9ee]` (151), `border-[#00a7f4]` (26), `border-[#171717]` (6), plus tailwind palette (`border-slate-100/200/300`, `border-indigo-100/200/500`, `border-amber-200/300`, `border-rose-200/300`, `border-emerald-200`, `border-blue-100/200`, `border-violet-200`).

Radius (concrete): `rounded-md` (84), `rounded-full` (46), `rounded-lg` (28), `rounded-xl` (28), `rounded-2xl` (4), `rounded-sm` (2). Plus shadcn radii via `--radius` (6/8/10/14/18 px).

### 3.6 Shadows

| Class | Count | Concrete value (Tailwind default) |
|---|---|---|
| `shadow-sm` | 184 | `0 1px 2px 0 rgb(0 0 0 / 0.05)` |
| `shadow-md` | 10 | `0 4px 6px -1px rgb(0 0 0 / 0.1)` |
| `shadow-xs` | 5 | `0 1px rgb(0 0 0 / 0.05)` |
| `shadow-lg` | 4 | `0 10px 15px -3px rgb(0 0 0 / 0.1)` |
| `shadow-xl` | 3 | `0 20px 25px -5px rgb(0 0 0 / 0.1)` |
| `shadow-none` | 1 | none |
| `shadow-2xl` | 1 | `0 25px 50px -12px rgb(0 0 0 / 0.25)` |

Arbitrary shadows (4 distinct values, 6 sites):
- `shadow-[0_8px_30px_-12px_rgba(23,23,23,0.08)]` — Card primitive
- `shadow-[0_25px_70px_rgba(0,0,0,0.12)]` — Login/register Card
- `shadow-[0_18px_50px_rgba(0,0,0,0.08)]` — OAuth callback Card
- `shadow-[0_12px_36px_-20px_rgba(0,166,244,0.25)]` — Landing feature card
- `shadow-[0_10px_24px_rgba(0,167,244,0.35)]` — Login/register submit button

### 3.7 Transitions

| Pattern | Count |
|---|---|
| `transition` (bare; uses `transition-all` defaults) | 30 |
| `transition-all` (in Button base) | implicit in primitive |
| `transition-colors` (in TableRow) | implicit in primitive |
| `transition-[color,box-shadow]` (in Input, Select) | implicit |
| `duration-200` | 5 |
| `duration-300` | 3 |
| `duration-500` | 2 |
| Custom keyframes in `globals.css` | `rise-in 720ms cubic-bezier(0.2, 0.7, 0.2, 1) both`, `glow-drift 8s ease-in-out infinite` |
| Kanban drag transition (globals.css) | `transform 0.15s cubic-bezier(0.2, 0, 0, 1)` |

No standard easing tokens. Most transitions inherit Tailwind defaults (`150ms cubic-bezier(0.4, 0, 0.2, 1)`).

### 3.8 Responsive usage

| Breakpoint | Count of files that use it | Patterns |
|---|---|---|
| `sm:` | 51 lines | Mostly `sm:max-w-lg`, `sm:flex-row`, `sm:max-w-[600px]` |
| `md:` | 71 | `md:px-10`, `md:text-6xl`, `md:grid-cols-3`, `md:col-span-4`, `md:flex` |
| `lg:` | 31 | `lg:grid-cols-2`, `lg:grid-cols-3`, `lg:col-span-1` |
| `xl:` | (a few) | `xl:grid-cols-2` (dashboard) |
| `2xl:` | 0 | none observed |

Dashboard pages are designed desktop-first; responsive logic is concentrated on landing/auth pages and a handful of grid wrappers.

---

## Phase 4 — Inconsistency report

### 4.1 Element-by-element drift

| Element | Distinct visual variants | Severity |
|---|---|---|
| Primary button | 9+ distinct combos (5 different background colors, 3 different paddings, 4 different shadows). See 2.1d | **High** |
| Link / clickable text | 4 distinct colors used as a "link" (`#00a7f4`, `text-blue-500`, `text-purple-600`, `text-primary`) | **High** |
| Card (background) | 6 distinct backgrounds (`bg-gradient white→fafcfe→f0f9ff`, plain `bg-white`, `bg-white/92`, `bg-slate-50`, `bg-card`, `bg-[#fafbfc]`) | **High** |
| Card (shadow) | 7 distinct shadow values | **High** |
| Status pill / chip | At least 13 different (bg, text, border) pastel triplets; 3 different paddings (`py-0`, `py-0.5`, `px-1.5 py-0.5`); 2 different radii (`rounded`, `rounded-full`) | **High** |
| Helper / secondary text color | 5 distinct: `text-[#4a4a4a]`, `text-[#8a8a8a]`, `text-slate-400`, `text-slate-500`, `text-muted-foreground` | **High** |
| Default text color | 3 distinct: `text-[#171717]`, `text-slate-900`, `text-foreground` | **High** |
| Border color | 3 distinct neutrals: `border-[#e6e9ee]`, `border-slate-200`, `border-slate-100`, plus `border-border` | **High** |
| H1 page title | 3 distinct combos (`text-2xl font-bold`, `text-2xl font-bold tracking-tight text-[#171717]`, `text-2xl font-bold text-[#171717]`) | **Medium** |
| Section eyebrow (uppercase label) | 4 variants: `text-[11px] uppercase tracking-wider text-[#8a8a8a]`, `font-mono text-xs uppercase tracking-[0.18em] text-[#0086c4]`, `text-xs font-semibold uppercase text-slate-500`, `text-xs font-medium text-slate-500 uppercase tracking-wider` | **Medium** |
| Sidebar icon palette | 13 distinct hues (intentional decoration but inconsistent with Tailwind/brand palette) | **Medium** |
| Loading spinner | `LoadingState` (canonical) + 27 inline `<Loader2>` with 4 different sizes | **Medium** |
| Empty state | No canonical component — 5+ unique implementations | **Medium** |
| Toast | No `toastOptions` override — appearance varies with `react-hot-toast` defaults | **Low** |
| Radius scale | 6 values in use (`rounded-sm/md/lg/xl/2xl/full`) — within reason | **Low** |
| Icon size | 5 sizes (3, 3.5, 4, 5, 6) — `h-3.5 w-3.5` is the odd-one-out (64 occurrences) | **Low** |
| Avatar | 3 sizes, fairly consistent | **Low** |
| Native select | 5 occurrences bypass `Select`, use `ring-blue-500` instead of `ring-ring/50` | **Medium** |
| Workflow stepper | 1 canonical implementation (`WorkflowBar`) — consistent | **Low** |
| Tooltip | Always black (`bg-primary`) — looks out of place on the brand-cyan-tinted dashboard | **Low** |

### 4.2 Hotspots — files that single-handedly drift the most

| File | Lines | Distinct className calls | Notable drift |
|---|---|---|---|
| `components/estimation/EstimationSimulator.tsx` | 1503 | 212 | 4 distinct chip styles in version history, 3 different ratios of `text-slate-{400,500,700,800}`, inline `style={{ background: '#fef3c7', color: '#92400e' }}`, custom `h-7 px-2 gap-1 text-xs` SelectTrigger size |
| `app/(dashboard)/forecast/page.tsx` | 1192 | 151 | 16 `text-slate-500`, 14 `text-slate-900`, 9 `text-rose-600`, 5 distinct status pastel combos, mixes Tailwind palette with brand hex |
| `app/(dashboard)/financial/page.tsx` | 1062 | 183 | 9 rose-600 / 6 emerald-600 / 5 slate-500 — heavy Tailwind palette use |
| `app/(dashboard)/contracts/[id]/page.tsx` | 976 | 168 | 60+ raw hex literals; `text-[#00a7f4]` mixed with `text-emerald-700` and `text-amber-700`; 3 raw `<button>` elements |
| `app/(dashboard)/contracts/page.tsx` | 939 | 169 | Status badge with 5 distinct color triplets; raw `<button>` with `text-[#00a7f4]` and `text-purple-600` as competing link colors |
| `app/(dashboard)/tenant/page.tsx` | (unread) | 182 | Highest className count after Estimation |
| `app/(dashboard)/dashboard/page.tsx` | 687 | 110 | Mixes brand `text-[#00a7f4]` with Tailwind `text-emerald-{400,500,600}`, `text-rose-{400,600}`, `text-violet-500`, `text-slate-{400,500}` |
| `components/crm/AITeamBuilder.tsx` | 500 | (high) | Whole indigo subtheme: `bg-indigo-50`, `border-indigo-200`, `text-indigo-{300,500,600,700}`, raw `<textarea>` |
| `app/(dashboard)/project-pipeline/[id]/page.tsx` | (unread) | 139 | Heavy slate palette |
| `components/project-pipeline/contracts/ContractDraftWizard.tsx` | (unread) | 81 | Indigo subtheme: `bg-indigo-{600,700}`, `text-indigo-700`, `border-indigo-{100,200,500}` |
| `components/chatbot/ChatBot.tsx` | (unread) | (medium) | Indigo subtheme: `bg-indigo-{50,300,600,700}`, `text-indigo-{300,600}`, `border-indigo-{100,200}`. Bypasses Dialog (uses `Card` as floating panel). |

### 4.3 State coverage gaps

| Element | Default | Hover | Focus | Active | Disabled | Error | Loading |
|---|---|---|---|---|---|---|---|
| Button (canonical) | yes | yes | yes (`focus-visible:ring-ring/50 ring-[3px]`) | (none specified) | yes (`disabled:pointer-events-none disabled:opacity-50`) | `aria-invalid` styled | none (relies on caller) |
| Input | yes | (none, transparent bg) | yes | n/a | yes | yes | n/a |
| Textarea | yes | (none) | yes (**different**: `ring-2 ring-offset-2`) | n/a | yes | (no `aria-invalid` style) | n/a |
| Select trigger | yes | (dark-only `dark:hover:bg-input/50`) | yes | n/a | yes | yes | n/a |
| TableRow | yes | yes (`bg-[#00a7f4]/5`) | n/a | yes (`data-[state=selected]`) | n/a | n/a | n/a |
| Bare `<button>` pagination (admin) | yes | yes (`hover:bg-white`) | **none** (relies on browser default) | none | yes (`disabled:opacity-50`) | none | none |
| Native `<select>` (admin) | yes | none | `focus:outline-none focus:ring-2 focus:ring-blue-500` (different color from rest of UI) | n/a | yes | none | n/a |
| Bare `<button>` in `crm/AITeamBuilder.tsx` 470 (custom textarea) | yes | none | `focus:outline-none focus:ring-2 focus:ring-indigo-400` (different color) | n/a | none | none | none |
| Sidebar link | yes | yes | **no focus indicator** | yes (active state has its own class) | none | n/a | n/a |
| Anchor styled as button (landing) | yes | yes | **no focus indicator** | n/a | n/a | n/a | n/a |

### 4.4 Accessibility flags

#### 4.4a Color contrast (eyeball-estimated against bg)

- `text-[#8a8a8a]` (#8a8a8a) on `bg-[#f8fafc]`: contrast ≈ 3.4 : 1 → **fails WCAG AA 4.5:1** for body text. Used 305 times.
- `text-[#8a8a8a]` on white: ≈ 3.6 : 1 → also fails.
- `text-slate-400` (#94a3b8) on white: ≈ 2.8 : 1 → fails.
- `text-slate-500` (#64748b) on white: ≈ 4.6 : 1 → passes AA, fails AAA. (Used 80+ times.)
- `text-[#4a4a4a]` on white: ≈ 9.2 : 1 → passes.
- `text-[#0086c4]` (brand cyan-dark) on white: ≈ 4.6 : 1 → passes AA.
- `text-[#00a7f4]` (brand cyan) on white: ≈ 3.4 : 1 → **fails AA** for body text. (240 occurrences, often as link color.)
- `text-[#00a7f4]` on `bg-[#00a7f4]/10` (translucent cyan): contrast worse. Used in active sidebar items.
- `text-amber-700` (#b45309) on `bg-amber-50` (#fffbeb): passes.
- `text-emerald-600` on white: ≈ 4.5 : 1 → borderline.
- `text-emerald-400` on white: < 3 : 1 → fails. Used 9× in `dashboard/page.tsx`.
- `text-rose-400` on white: ≈ 3.0 : 1 → fails. Used 8× in `dashboard/page.tsx`.
- Landing hero subheadline `text-[#171717]/65` on `bg-[#f8fafc]`: ≈ 8 : 1 → passes; `/75` similarly passes.

#### 4.4b Missing focus indicators

Sites with `focus:outline-none` but no replacement ring:
- (none verified) — all `focus:outline-none` sites pair with `focus:ring-*` replacements.

Sites missing visible focus altogether (no `:focus`/`focus-visible` rules):
- `app/page.tsx` 25, 48, 158: anchors styled as buttons, no `:focus-visible:*`.
- `components/layout/Sidebar.tsx` 109-124: `<Link>` items rely entirely on browser default outline (which is usually visible, but the design layer overrides nothing).
- Raw `<button>` elements in `app/(dashboard)/admin/audit/page.tsx`, `app/(dashboard)/admin/billing/page.tsx` lines 241-254 and 136-160: native selects use `focus:ring-2 focus:ring-blue-500` (inconsistent color).

#### 4.4c Unlabeled inputs

8 `aria-label` attributes across the entire codebase; 48 `htmlFor` references; ~70 `<Input>` usages. `Form`/`FormLabel`/`FormField` from `form.tsx` ties labels correctly for every form built on it (`components/forms/*`). **Risk zones** — searches that bypass `Form`:
- `app/(dashboard)/admin/audit/page.tsx` 77, 91: `<select>` with no `<label>` or `aria-label`. The filter row uses `<span>` text adjacent to the select, but they are not programmatically associated.
- `app/(dashboard)/admin/billing/page.tsx` 136, 150: same issue.
- `components/SimulatedDateBar.tsx` 67-76: uses `<label>` element wrapping text + Input (programmatically associated via DOM ancestry — usually OK).
- `components/chatbot/ChatBot.tsx` 332-339: `<Input>` with `placeholder` only, no label or `aria-label`.

#### 4.4d Click targets below 44 px (WCAG AAA target; AA = 24 px)

| Pattern | Effective size | Where |
|---|---|---|
| `Button size="xs"` (`h-6 px-2 text-xs`) | 24 px tall | EstimationSimulator version history, miscellaneous chips |
| `Button size="sm"` (`h-8 px-3`) | 32 px tall | 75 occurrences |
| `Button size="icon-xs"` (`size-6`) | 24×24 px | small action triggers |
| Bare `<button>` pagination (`px-3 py-1 text-sm`) | ~28 px tall | `admin/audit`, `admin/billing` |
| Kanban card menu trigger `<Button variant="ghost" className="h-6 w-6 p-0">` | 24×24 px | KanbanBoard.tsx 227 |
| Sidebar collapse toggle (`p-1` around 16 px chevron) | ~24 px square | Sidebar.tsx 77 |

These pass AA (≥24 px) but fail AAA (≥44 px). Touchscreen users will struggle.

---

## Phase 5 — Unified design system proposal

Everything below is derived from values already used in the codebase. No new colors are invented. Tokens are written as CSS custom properties so they can be applied through Tailwind 4's `@theme` block in `globals.css`.

### 5.1 Color tokens (semantic)

| Token | Concrete value | Derivation |
|---|---|---|
| `--color-brand-50` | `#f0f9ff` | already used in Card gradient, Header bg |
| `--color-brand-100` | `#d9e7f2` | existing border-[#d9e7f2] |
| `--color-brand-500` | `#00a7f4` | the de-facto brand cyan (240 uses) |
| `--color-brand-600` | `#0599df` | login button hover (existing) |
| `--color-brand-700` | `#0086c4` | active-link / dark-on-light cyan (33 uses) |
| `--color-text-default` | `#171717` | already the dominant text color (231 uses) |
| `--color-text-secondary` | `#4a4a4a` | already used as body grey (195 uses); also CardDescription color |
| `--color-text-muted` | `#8a8a8a` | already used as captions (305 uses) — **but flag for contrast review** (see 5.7) |
| `--color-bg-page` | `#f8fafc` | dashboard shell + landing bg (47 uses) |
| `--color-bg-surface` | `#ffffff` | Card content default |
| `--color-bg-subtle` | `#fafcfe` | Card gradient mid stop |
| `--color-bg-elevated` | `#fafbfc` | PhaseDrillDownDrawer wash |
| `--color-border-default` | `#e6e9ee` | de-facto border (151 uses) |
| `--color-border-strong` | `#171717` | rare uses (6) |
| `--color-success-bg` | `#ecfdf5` | already used; or `bg-emerald-50` |
| `--color-success-text` | `#065f46` | existing inline value |
| `--color-success-border` | `#a6f4c5` | existing |
| `--color-warning-bg` | `#fffbeb` | already used; or `bg-amber-50` |
| `--color-warning-text` | `#92400e` | existing inline value |
| `--color-warning-border` | `#fef3c7` | existing |
| `--color-danger-bg` | `#fef2f2` | existing |
| `--color-danger-text` | `#7f1d1d` | existing rose-900 equivalent |
| `--color-danger-border` | `#fecaca` | derive from rose-200 already in use |
| `--color-info-bg` | `#eff6ff` | existing |
| `--color-info-text` | `#1e40af` | from existing blue palette |
| `--color-rank-c-bg` | `bg-slate-100` | from `STAGE_COLORS` |
| `--color-rank-b-bg` | `bg-blue-50` | from `STAGE_COLORS` |
| `--color-rank-a-bg` | `bg-purple-50` | from `STAGE_COLORS` |
| `--color-rank-s-bg` | `bg-emerald-50` | from `STAGE_COLORS` |
| `--color-rank-dropped-bg` | `bg-slate-100` | from `DROPPED_COLORS` |

**Decision deferred (Open question OQ-1):** which "indigo" token belongs in the system. `bg-indigo-600`, `text-indigo-700`, `border-indigo-200` are used as the **AI-action** accent in ChatBot, ContractDraftWizard, and AITeamBuilder. Either promote indigo to a real semantic role (`--color-ai-accent`) or rebrand those features to the brand cyan.

### 5.2 Typography scale

| Token | Value | Derived from |
|---|---|---|
| `--font-sans` | Geist | already loaded |
| `--font-mono` | Geist Mono | already loaded |
| `--text-xs` | 0.75rem / 1rem | Tailwind default; 387 uses |
| `--text-sm` | 0.875rem / 1.25rem | 425 uses (dominant) |
| `--text-base` | 1rem / 1.5rem | 34 uses |
| `--text-lg` | 1.125rem / 1.75rem | 45 uses |
| `--text-xl` | 1.25rem / 1.75rem | 16 uses |
| `--text-2xl` | 1.5rem / 2rem | 44 uses — canonical H1 |
| `--text-3xl` | 1.875rem / 2.25rem | 38 uses — section H2 |
| `--text-display` | 3.75rem / 1 (`text-6xl`) | landing/auth hero only |
| `--font-weight-normal` | 400 | 37 uses |
| `--font-weight-medium` | 500 | 366 uses (dominant for buttons/labels) |
| `--font-weight-semibold` | 600 | 123 uses (titles) |
| `--font-weight-bold` | 700 | 124 uses (H1) |

Recommend retiring `text-xl` (only 16 uses) and `text-5xl` (1 use) — too rare to be a tier.

### 5.3 Spacing scale

Standard Tailwind 4-step scale already used:

| Token | px |
|---|---|
| `--space-1` | 4 |
| `--space-2` | 8 |
| `--space-3` | 12 |
| `--space-4` | 16 |
| `--space-5` | 20 |
| `--space-6` | 24 |
| `--space-8` | 32 |

(Drop `space-y-0` and `space-y-7/9` from canonical usage — they are noise.)

### 5.4 Radii

| Token | rem | px | Derived from |
|---|---|---|---|
| `--radius-sm` | 0.25rem | 4 | rounded-sm (2 uses) |
| `--radius-md` | 0.375rem | 6 | shadcn `--radius - 4` = 6px |
| `--radius-lg` | 0.5rem | 8 | shadcn `--radius - 2` = 8px |
| `--radius-xl` | 0.75rem | 12 | rounded-xl (28 uses) — canonical Card |
| `--radius-2xl` | 1rem | 16 | rounded-2xl (4 uses) — landing feature card / login Card |
| `--radius-full` | 9999px | — | rounded-full (46 uses) — badges, avatars, brand pills |

### 5.5 Shadows

| Token | Value | Use |
|---|---|---|
| `--shadow-xs` | `0 1px rgb(0 0 0 / 0.05)` | thin shadow for Input/Select |
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | standard card edge — keep (dominant, 184 uses) |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1)` | hover lift |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1)` | popover/dialog |
| `--shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1)` | chat panel |
| `--shadow-brand` | `0 12px 36px -20px rgba(0,166,244,0.25)` | landing feature cards / hover on brand surfaces |
| `--shadow-card-soft` | `0 8px 30px -12px rgba(23,23,23,0.08)` | current Card primitive shadow (preserve as a named token if retained) |

Recommend **dropping** the bespoke `shadow-[0_25px_70px_rgba(0,0,0,0.12)]` and `shadow-[0_18px_50px_rgba(0,0,0,0.08)]` — collapse to `--shadow-xl`.

### 5.6 Motion

| Token | Value |
|---|---|
| `--motion-duration-fast` | 150 ms (Tailwind default) |
| `--motion-duration-base` | 200 ms |
| `--motion-duration-slow` | 300 ms |
| `--motion-ease-default` | cubic-bezier(0.4, 0, 0.2, 1) (Tailwind default `ease-in-out`) |
| `--motion-ease-decel` | cubic-bezier(0.2, 0.7, 0.2, 1) (already in `rise-in` keyframe) |
| `--motion-ease-drag` | cubic-bezier(0.2, 0, 0, 1) (already on `[data-rbd-draggable-context-id]`) |

### 5.7 Canonical component specs

Below: one canonical variant set per element. Concrete classes match what we already standardize on. The proposal is to **add** these alongside the existing variants in Phase 1 of the migration — not delete anything yet.

#### 5.7a Button (canonical surface)

| Variant | Default | Hover | Focus-visible | Disabled |
|---|---|---|---|---|
| `primary` | `bg-[var(--color-brand-500)] text-white shadow-sm` | `bg-[var(--color-brand-600)]` | `ring-[3px] ring-[var(--color-brand-500)]/40` | `opacity-50 pointer-events-none` |
| `primary-dark` (landing nav) | `bg-[var(--color-text-default)] text-white` | `bg-[var(--color-brand-500)]` | same | same |
| `secondary` | `bg-white text-[var(--color-text-default)] border border-[var(--color-border-default)] shadow-xs` | `bg-[var(--color-brand-50)] text-[var(--color-brand-700)]` | same | same |
| `ghost` | transparent text-[var(--color-text-secondary)] | `bg-[var(--color-brand-500)]/10 text-[var(--color-brand-700)]` | same | same |
| `destructive` | `bg-destructive text-white shadow-sm` | `bg-destructive/90` | `ring-destructive/40` | same |
| `link` | `text-[var(--color-brand-500)] underline-offset-4` | `underline text-[var(--color-brand-700)]` | `outline-2 outline-[var(--color-brand-500)]/40` | same |
| `ai` (NEW, optional — pending OQ-1) | `bg-indigo-600 text-white shadow-sm` | `bg-indigo-700` | `ring-indigo-500/40` | same |

Sizes: keep existing `xs / sm / default / lg` plus icon-* variants. Drop `xs` from primary actions — it falls below 24 px effective click target.

#### 5.7b Input / textarea / select trigger

Single canonical state set:
- Default: `h-9 px-3 text-sm bg-white border border-[var(--color-border-default)] rounded-md shadow-xs placeholder:text-[var(--color-text-muted)]`
- Focus-visible: `border-[var(--color-brand-500)] ring-[3px] ring-[var(--color-brand-500)]/30`
- Aria-invalid: `border-destructive ring-[3px] ring-destructive/20`
- Disabled: `opacity-50 cursor-not-allowed`
- Compact size (form rows in tables): `h-8 px-2 text-sm`

Textarea: same colors, `min-h-[80px]`. Replace the differing `ring-2 + ring-offset-2` focus with the canonical `ring-[3px]`.

#### 5.7c Card

Canonical:
- Surface: `bg-white text-[var(--color-text-default)] border border-[var(--color-border-default)] rounded-xl shadow-sm`
- Padded: `p-6` (or `py-6 px-6` to match current Card)
- Heading: `text-base font-semibold` (medium) or `text-lg font-semibold` (large)
- Body: `text-sm text-[var(--color-text-secondary)]`

Optional `brand-accent` variant (used on landing / login): adds `bg-gradient-to-br from-white via-[var(--color-bg-subtle)] to-[var(--color-brand-50)]` and `shadow-[var(--shadow-card-soft)]`.

#### 5.7d Badge / chip

Canonical chip: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border`. Then a closed set of semantic palettes (success/warning/danger/info/brand/neutral) mapping to the colour tokens in 5.1. The 13-style-pastel sprawl collapses to **6 canonical chip palettes**. Stage chips (Kanban rank) are a separate `rank-chip` component with the `STAGE_COLORS` lookup as the only allowed source.

#### 5.7e Tooltip

Re-tone from black (`bg-primary`) to `bg-[var(--color-text-default)]/95 text-white` — matches the rest of the dashboard's near-black text-on-white grammar instead of looking like a third color (oklch black). [styling-only; no behavior change]

#### 5.7f Table

Keep current Table primitive but neutralize Header gradient: replace `bg-gradient-to-r from-[#f0f9ff] to-[#fafcfe]` with `bg-[var(--color-bg-subtle)]`. Keep `hover:bg-[var(--color-brand-500)]/5` on TableRow.

#### 5.7g Loading / empty states

Single `LoadingState` already exists. Promote it to canonical:
- All inline `<Loader2>` patterns should call `<LoadingState size="sm">` for in-button spinners and `<LoadingState size="md">` for in-card placeholders.

New `EmptyState` component (proposal):
- `flex flex-col items-center justify-center py-12 text-center text-[var(--color-text-muted)]`
- Required `icon` slot (Lucide), required `title` (text-sm font-medium), optional `description`, optional `action` (Button).

### 5.8 Mapping table — current usage → canonical token / component

| Current style | Canonical replacement |
|---|---|
| `bg-[#00a7f4]` | `bg-[var(--color-brand-500)]` |
| `bg-[#0599df]` | `bg-[var(--color-brand-600)]` |
| `bg-[#0086c4]` / `text-[#0086c4]` | `--color-brand-700` |
| `bg-[#f8fafc]` | `--color-bg-page` |
| `bg-[#f0f9ff]` | `--color-brand-50` |
| `bg-[#fafcfe]` / `bg-[#fafbfc]` / `bg-[#fafafa]` | `--color-bg-subtle` (collapse 3 into 1) |
| `text-[#171717]` / `text-slate-900` / `text-foreground` | `--color-text-default` |
| `text-[#4a4a4a]` / `text-card-foreground` | `--color-text-secondary` |
| `text-[#8a8a8a]` / `text-slate-400` / `text-slate-500` / `text-muted-foreground` | `--color-text-muted` (and **bump** to `#737373` if OQ-3 resolves toward AA compliance) |
| `border-[#e6e9ee]` / `border-slate-100` / `border-slate-200` / `border-border` | `--color-border-default` |
| `bg-emerald-50` + `text-emerald-700` + `border-emerald-200` | `chip variant="success"` |
| `bg-amber-50` + `text-amber-800/900` + `border-amber-200/300` | `chip variant="warning"` |
| `bg-rose-50` + `text-rose-700` + `border-rose-200` | `chip variant="danger"` |
| `bg-blue-50` + `text-blue-700` | `chip variant="info"` (or `brand` — see OQ-2) |
| `bg-[#00a7f4]/10` + `text-[#0086c4]` | `chip variant="brand"` |
| Inline `style={{ background: '#fef3c7', color: '#92400e' }}` (EstimationSimulator) | `chip variant="warning"` |
| `bg-gradient-to-br from-white via-[#fafcfe] to-[#f0f9ff]` (Card) | `Card variant="brand-accent"` (or drop to plain — see OQ-4) |
| `bg-gradient-to-r from-[#f0f9ff] to-[#fafcfe]` (TableHead) | `bg-[var(--color-bg-subtle)]` (drop gradient) |
| `shadow-[0_8px_30px_-12px_rgba(23,23,23,0.08)]` | `--shadow-card-soft` |
| `shadow-[0_25px_70px_rgba(0,0,0,0.12)]` | `--shadow-xl` |
| `shadow-[0_18px_50px_rgba(0,0,0,0.08)]` | `--shadow-xl` |
| `shadow-[0_10px_24px_rgba(0,167,244,0.35)]` | drop (uniform shadow on primary) |
| `text-blue-500` / `text-blue-600` / `text-purple-600` (as link colors) | `text-[var(--color-brand-500)]` |
| `bg-indigo-600` / `text-indigo-700` (AI accents) | `Button variant="ai"` **or** rebrand to brand cyan (OQ-1) |
| `bg-primary` (oklch near-black) on primary action buttons | `bg-[var(--color-brand-500)]` (resolve token mismatch — see OQ-6) |
| `text-emerald-400` / `text-rose-400` (dashboard, contrast-failing) | step up to `-500` or `-600` (OQ-7) |
| `focus:ring-blue-500` on raw `<select>`/`<input>` | canonical `ring-[var(--color-brand-500)]/30` |
| Bare `<button class="text-[#00a7f4] hover:underline">` | `Button variant="link"` |
| `<Button>` with no variant (default → black) | explicitly `variant="primary"` (canonical name) or `variant="default"` after token alignment |
| `LoadingState` inline `text-slate-500` / `text-slate-400` | bind to `--color-text-muted` / `--color-text-secondary` |

---

## Phase 6 — Migration plan

All three phases are **styling-only by construction**. Any item that touches behavior is moved to "Flag-for-review" and removed from this plan.

### Phase 1 — Introduce tokens and canonical components (NO removals)

| Step | Description | Files touched | Tag |
|---|---|---|---|
| 1.1 | Extend `:root` and `.dark` in `app/globals.css` with all `--color-brand-*`, `--color-text-*`, `--color-bg-*`, `--color-border-*`, status colors, radii, shadows, and motion tokens from §5. Keep existing oklch variables intact. | 1 file (`app/globals.css`) | [styling-only] |
| 1.2 | Add canonical variant set to `button.tsx` via additional cva entries (`primary`, `secondary` aligned to brand). Do not remove old variants. | 1 file (`components/ui/button.tsx`) | [styling-only] |
| 1.3 | Add `brand-accent` variant to `card.tsx` and a `plain` (no gradient, no preset shadow) variant. Keep current default. | 1 file (`components/ui/card.tsx`) | [styling-only] |
| 1.4 | Add new `Chip` primitive (`components/ui/chip.tsx`) with semantic variants from §5.7d. Existing `Badge` stays. | 1 new file | [styling-only] |
| 1.5 | Add new `EmptyState` primitive. | 1 new file (`components/ui/empty-state.tsx`) | [styling-only] |
| 1.6 | Add new `Banner` primitive that covers warning / error / success / info inline notices in one place (replacing the OrgSyncErrorBanner / SimulatedDateBar patterns visually). | 1 new file (`components/ui/banner.tsx`) | [styling-only] |
| 1.7 | Tweak Tooltip background from `bg-primary` to `bg-[var(--color-text-default)]/95`. | 1 file (`components/ui/tooltip.tsx`) | [styling-only] |
| 1.8 | Align Textarea focus styles to the canonical `ring-[3px]` ring instead of `ring-2 + ring-offset-2`. | 1 file (`components/ui/textarea.tsx`) | [styling-only] |
| 1.9 | Drop the cyan gradient from `TableHead` (`bg-gradient-to-r from-[#f0f9ff] to-[#fafcfe]` → `bg-[var(--color-bg-subtle)]`). | 1 file (`components/ui/table.tsx`) | [styling-only] |

Estimated: **8 files modified, 3 new files** in Phase 1.

### Phase 2 — Migrate by feature area (worst hotspots first)

For each step: only `className` / inline-style attributes change. No logic, no behavior, no props beyond visual ones. Anything that requires touching event handlers / state is flagged below in §"Flag-for-review".

| Step | Feature area | Files | Sample paths | Tag |
|---|---|---|---|---|
| 2.1 | Card primitive consumers — sweep through dashboard pages that override Card to plain `border-slate-200 shadow-sm`; replace with `<Card variant="plain">` if accepted, else keep override but route hex to tokens. | ~15 | `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/financial/page.tsx`, `app/(dashboard)/forecast/page.tsx`, `app/(dashboard)/projects/[id]/page.tsx`, `app/(dashboard)/contracts/page.tsx`, `app/(dashboard)/contracts/[id]/page.tsx`, `components/estimation/EstimationSimulator.tsx`, `components/crm/KanbanBoard.tsx` | [styling-only] |
| 2.2 | **EstimationSimulator hotspot** — convert 4 distinct chip styles to `<Chip variant="…">`. Replace inline `style={{ background: '#fef3c7', color: '#92400e' }}` with `<Chip variant="warning">`. Migrate all hex literals to tokens. | 1 | `components/estimation/EstimationSimulator.tsx` (1503 lines, 212 className calls) | [styling-only] |
| 2.3 | **Contracts module hotspot** — `app/(dashboard)/contracts/page.tsx` and `app/(dashboard)/contracts/[id]/page.tsx`: convert the 5-branch contract status Badge to `<Chip>`, the raw `<button>` row links to `<Button variant="link">`, and replace all hex with tokens. | 2 | `app/(dashboard)/contracts/page.tsx`, `app/(dashboard)/contracts/[id]/page.tsx` | [styling-only] |
| 2.4 | **Forecast + Financial pages** — heaviest slate-palette users. Replace `text-slate-{400,500,900}` etc. with tokens; collapse the inline status-pastel pairs to `<Chip>` / `<Banner>`. | 2 | `app/(dashboard)/forecast/page.tsx`, `app/(dashboard)/financial/page.tsx` | [styling-only] |
| 2.5 | **Dashboard page** — step up `text-emerald-400` / `text-rose-400` (contrast failures) to `-500`/`-600` (confirm with OQ-7 first). Replace `bg-gradient-to-r from-emerald-400 to-emerald-600` etc. with token-based gradient or solid token. | 1 | `app/(dashboard)/dashboard/page.tsx` | [styling-only] |
| 2.6 | **CRM Kanban + DealForm + AITeamBuilder** — replace `bg-indigo-*` palette with either `ai` button variant or `--color-brand-*` after OQ-1. Replace the raw `<textarea>` in AITeamBuilder.tsx 470 with the canonical `Textarea`. | 4 | `components/crm/KanbanBoard.tsx`, `components/crm/DealForm.tsx`, `components/crm/AITeamBuilder.tsx`, `components/crm/AITeamBuilderResult.tsx` | [styling-only] *for AITeamBuilder.tsx 470 — only if the raw `<textarea>` swap doesn't change focus/blur behavior; otherwise* **[flag-for-review]** *— see FR-3* |
| 2.7 | **Contract draft wizard subtheme** — `components/project-pipeline/contracts/*` — fold indigo into the canonical AI variant (OQ-1). | 7 | `ContractDraftWizard.tsx`, `WizardQuestions.tsx`, `SectionEditor.tsx`, `TemplatePicker.tsx`, `PdfPreviewDialog.tsx`, `SignedUpload.tsx`, `DraftStatusChip.tsx` | [styling-only] |
| 2.8 | **ChatBot** — fold indigo into AI variant or brand. | 1 | `components/chatbot/ChatBot.tsx` | [styling-only] for color/shadow swaps. **FR-4** flagged for the chatbot panel using `Card` instead of `Dialog` — keeping that as Card is a layout decision; only the styling is in-scope. |
| 2.9 | **Sidebar icon palette** — pending OQ-5, either keep the 13-color decoration OR collapse to a token-driven 5-color palette. | 1 | `components/layout/Sidebar.tsx` | [styling-only] |
| 2.10 | **Admin pages** — convert raw `<select>` to `Select` primitive **only if** OQ-8 confirms behavioral parity is acceptable; else just align ring color (`ring-blue-500` → `ring-[var(--color-brand-500)]/30`) and add visible `<label>` elements. The full `<select>` → `Select` swap may change keyboard behavior (Radix portal vs native picker), so default to ring-only migration. | 3 | `app/(dashboard)/admin/audit/page.tsx`, `app/(dashboard)/admin/billing/page.tsx`, `components/organization/HolidaysTab.tsx` | Ring-only swap [styling-only]; full Select swap **[flag-for-review: FR-1]** |
| 2.11 | **Pagination buttons** — replace bare `<button>` pagination in `admin/audit/page.tsx`, `admin/billing/page.tsx`, `projects/page.tsx` with `<Button variant="outline" size="sm">`. | 3 | as listed | [styling-only] *provided the existing onClick props pass through unchanged.* |
| 2.12 | **Auth pages** — login / register / OAuth callback. Token-ify the bespoke shadows (`shadow-[0_25px_70px…]` → `--shadow-xl`); align primary button to `--color-brand-500`; replace `h-11` Inputs with a `size="lg"` Input variant (NEW). | 3 | `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/(auth)/auth/google/callback/page.tsx` | [styling-only] |
| 2.13 | **Landing page** — collapse landing-only shadows and arbitrary leading values; route hex to tokens. Replace `<Link>` styled as button with a real `Button` component (requires `asChild` Slot) — verify the `<Link>`/`<a>` behavior survives. | 1 | `app/page.tsx` | [styling-only] for color/shadow; **[flag-for-review: FR-2]** for `<Link>` → `<Button asChild>` swap. |
| 2.14 | **Loading states** — replace inline `<Loader2 className="h-4 w-4 animate-spin">` patterns with `<LoadingState size="sm">` inside cards/pages (keep inline `<Loader2>` inside buttons where it's a child icon — that doesn't need to change). | ~15 | dashboard pages | [styling-only] |
| 2.15 | **Empty states** — replace ad-hoc empty-state `<p className="text-sm text-[#8a8a8a]">` with `<EmptyState>`. | ~6 | `project-pipeline/page.tsx`, `contracts/page.tsx`, etc. | [styling-only] |

Estimated: **~38 files touched** across Phase 2.

### Phase 3 — Lockdown and removals

| Step | Description | Files | Tag |
|---|---|---|---|
| 3.1 | Remove now-unused arbitrary hex literals from the codebase. Goal: zero `bg-[#…]`, `text-[#…]`, `border-[#…]` outside `app/globals.css` and `components/ui/*`. | sweep across ~80 files | [styling-only] |
| 3.2 | Remove legacy `Button` variant `default` alias for `primary` if OQ-6 confirms it. Otherwise keep both names. | 1 (`button.tsx`) | [styling-only] |
| 3.3 | Add ESLint rule `no-restricted-syntax` (or a custom plugin) banning arbitrary hex in `className` strings. Storybook does **not** exist in this repo (verified: no `.storybook/`, no Storybook deps in `package.json`); recommend either adding Storybook or — cheaper — a small Playwright "tokens contract" test that snapshots one canonical render per component. | `eslint.config.mjs`, optional new test scaffold | [styling-only] for lint rule; new test infra is meta-tooling, not styling |
| 3.4 | Run the repo through Vercel preview / `npm run build` after each Phase 2 step to ensure type checking still passes (per project memory `feedback_typecheck_before_push`). | n/a | n/a |
| 3.5 | Document tokens in `docs/design-tokens.md` (allowed under user request: this is an audit follow-up). | 1 new doc | [styling-only] |

---

## Open questions

These are decisions the audit cannot make alone. Each blocks a specific migration step.

**OQ-1 — AI-feature color identity.** ChatBot, ContractDraftWizard, and AITeamBuilder all use `bg-indigo-{600,700}` / `text-indigo-{600,700}` / `border-indigo-{100,200}` as the "AI" accent. The rest of the app is brand-cyan. Should AI features:
- (a) keep indigo as a separate **AI** semantic color tier (add `--color-ai-*` tokens, add `Button variant="ai"`), or
- (b) fold AI accents into brand cyan?

This affects ~30 files in `components/chatbot/`, `components/crm/`, `components/project-pipeline/contracts/`, `components/estimation/`.

**OQ-2 — Distinguishing "info" from "brand".** Today `bg-[#00a7f4]/10` and `bg-blue-50` are both in use for "info" surfaces. Should `--color-info-bg` be **distinct** from the brand cyan, or are they the same?

**OQ-3 — Captions color.** `text-[#8a8a8a]` (305 uses) **fails WCAG AA** for body text against the white/page bg (≈3.5 : 1). Three options:
- (a) Promote to `#737373` (already in the codebase 7x) for AA compliance.
- (b) Keep `#8a8a8a` but restrict to non-text decorations (e.g. icon-only).
- (c) Accept current contrast for tertiary captions only.

**OQ-4 — Card gradient.** `components/ui/card.tsx` ships with `bg-gradient-to-br from-white via-[#fafcfe] to-[#f0f9ff]`. Many dashboard pages override it to plain `bg-white` + `border-slate-200`. Should:
- (a) Default Card be plain (most pages override it anyway), with a `brand-accent` variant for landing/auth, or
- (b) Keep the gradient as default and remove the manual overrides on dashboard pages?

**OQ-5 — Sidebar icon palette.** Sidebar items use 13 different per-icon hues — intentional decoration (`Sidebar.tsx` 35-56). Keep or collapse?

**OQ-6 — `bg-primary` realignment.** The shadcn `--primary` token resolves to oklch near-black, but every primary-action button overrides it with brand cyan. Should `--primary` be reset to `#00a7f4` so all uses align automatically? Risk: anywhere `bg-primary` is rendered on a dark hover surface (currently rare) will look different.

**OQ-7 — Dashboard contrast-failing accents.** `dashboard/page.tsx` uses `text-emerald-400` and `text-rose-400` for KPI deltas. Both fail AA on white. Step up to `-500/-600`?

**OQ-8 — Native `<select>` vs Radix `<Select>`.** Admin pages use native `<select>` (audit filters, billing plan dropdowns). Keyboard behavior differs (native picker vs portal). Migrate to `<Select>` (changes keyboard/focus model) or align styling only?

**OQ-9 — Tooltip color.** Currently black (`bg-primary`). Re-tone to brand-cyan tint, or keep contrast-style black against the cyan-tinted UI?

**OQ-10 — `Drawer` vs `Dialog`.** The repo names `PhaseDrillDownDrawer.tsx` "Drawer" but renders it as a centered Dialog. Introduce a real Drawer / Sheet primitive (slide-in from the right) per the original mental model, or rename the file and stay on Dialog?

**OQ-11 — Rank chip standardization.** KanbanBoard's rank chip (`rounded`, not `rounded-full`) does not match Badge (`rounded-full`). Both are intentional? Or should the rank chip use Badge with a custom variant?

**OQ-12 — Brand-purple in contracts table.** `app/(dashboard)/contracts/page.tsx` 458-460 uses `bg-violet-50 text-violet-700` for "Signed" status — but `bg-purple-50 text-purple-700` is the Negotiation rank color in `STAGE_COLORS`. Same hue, different palette name. Pick one (violet or purple).

---

## Flag-for-review

These items cannot be migrated by changing styling alone. Each one's listed reason explains the entanglement.

**FR-1 — Native `<select>` → Radix `<Select>` swap (admin pages).**
Files: `app/(dashboard)/admin/audit/page.tsx` 77, 91; `app/(dashboard)/admin/billing/page.tsx` 136, 150; `components/organization/HolidaysTab.tsx` 51.
Reason: Radix `Select` uses a portal-rendered popover with custom keyboard handling. Native `<select>` triggers OS-level pickers on mobile. The change is **not styling-only** because event handler signatures differ (`onValueChange(val)` vs `onChange(e)`) and form interaction changes.

**FR-2 — Landing `<Link>` styled as button → `<Button asChild>` swap.**
Files: `app/page.tsx` 25-29, 48-50, 158-160.
Reason: replacing the raw `<Link className="…">` with `<Button asChild><Link>…</Link></Button>` adds Radix `Slot.Root` semantics and Button's focus management. This is a hierarchy change that could affect SSR output and Lighthouse a11y score in either direction. Should be reviewed by a maintainer before merging.

**FR-3 — `<textarea>` → `<Textarea>` in AITeamBuilder.**
File: `components/crm/AITeamBuilder.tsx` 470.
Reason: The raw `<textarea>` has `resize-none` and a custom focus ring. Swapping to canonical `Textarea` resolves the focus inconsistency but changes the focus-blur event ordering inside the AI prompt panel — confirmed by reviewing the surrounding code that the textarea participates in blur-on-submit logic.

**FR-4 — ChatBot panel rendered as `Card` instead of `Dialog`.**
File: `components/chatbot/ChatBot.tsx` 274.
Reason: This is a deliberate layout decision — the chatbot panel anchors to a draggable trigger button and is positioned via inline `style={{ top, left }}`. Migrating to `Dialog` would change z-index stacking, focus trap, and would interfere with the drag logic in lines 92-140. Out of scope for styling-only audit; raised here so the maintainer can decide whether the canonical "floating panel" is a `Card` (current) or a new `FloatingPanel` primitive.

**FR-5 — Tabs variant collisions.**
Files: any usage of `Tabs variant="line"` vs `Tabs variant="default"`.
Reason: The two variants render structurally identical markup but differ visually. If we standardize on one (Open question raised informally during audit, not in §OQ because no specific call sites force the issue), it would mean changing the `variant` prop, which **alters appearance but is a prop change** — flagging here to surface the decision.

**FR-6 — Toaster appearance.**
File: `components/layout/DashboardShell.tsx` 32 (`<Toaster position="top-right" />`).
Reason: `react-hot-toast` toasts can be styled via `toastOptions` on the `<Toaster>` component, which changes the appearance of every toast in the app at once. This is **styling-only** but the user-facing behavior (motion, position, icon family) shifts, so it warrants explicit review rather than a silent rollout.

**FR-7 — Sidebar `<style jsx global>` block.**
File: `components/layout/Sidebar.tsx` 129-132 (`.no-scrollbar` rules).
Reason: To move this to `app/globals.css` (cleaner, more discoverable) is mechanically simple but technically a CSS-scope change. The current pattern works; the migration is a maintenance choice, not a bug.

**FR-8 — Card primitive ships gradient + custom shadow.**
File: `components/ui/card.tsx` 10.
Reason: Replacing the default with a plain Card affects every Card render in the app at once. This is **styling-only**, but the scope is large enough that a maintainer should sign off before flipping the default.

**FR-9 — Dialog `showCloseButton` styling.**
File: `components/ui/dialog.tsx` 73.
Reason: Close button uses `data-[state=open]:text-[#4a4a4a]` hex — replacing with a token is simple, but the `data-[state=open]:bg-accent` paired with it interacts with the accent token (`oklch(0.97 0 0)`). Reviewer should confirm the visual is acceptable when the close button is in `data-state="open"`.

---

*Audit complete. No source files were modified.*
