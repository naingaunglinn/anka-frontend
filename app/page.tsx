import Link from "next/link";
import { ArrowRight, BarChart3, Briefcase, Clock3, FileText, Layers, MessageSquare, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";

// Realistic client names from the seeded demo data
const clientLogos = [
  "Apex Manufacturing",
  "BluePeak Logistics",
  "Meridian Health",
  "Sunrise Fintech",
  "Hartwell Retail",
  "Summit Education",
];

// Demo stats matching the seeded Pixel Agency database exactly
const DEMO_STATS = {
  // Active pipeline (lead + inquiry + proposal + contract stages)
  pipelineValue: 325000,
  // Won revenue (Apex Manufacturing IoT Platform)
  wonRevenue: 180000,
  activeProjects: 1,
  teamSize: 5,
  dealsCount: 6,
};

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

export default function Home() {
  return (
    <main className="bg-[#f8fafc] text-[#171717]">
      {/* Navigation */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#e6e9ee] bg-[#f8fafc]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-3 text-xl font-semibold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#00a7f4] text-white font-bold">A</span>
            ANKA
          </div>
          <nav className="hidden items-center gap-8 text-sm text-[#4a4a4a] md:flex">
            <a href="#features" className="hover:text-[#00a7f4]">Features</a>
            <a href="#ai" className="hover:text-[#00a7f4]">AI Features</a>
            <a href="#how" className="hover:text-[#00a7f4]">How it works</a>
            <a href="#modules" className="hover:text-[#00a7f4]">Modules</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm font-medium text-[#171717] hover:text-[#00a7f4] md:inline-flex">Sign in</Link>
            <Link href="/login?demo=1" className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#00a7f4]">
              Live Demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 pb-20 pt-36 md:px-10 md:pt-44">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(0,167,244,0.15),transparent_34%),radial-gradient(circle_at_88%_15%,rgba(0,167,244,0.12),transparent_30%)]" />
        <div className="mx-auto grid w-full max-w-7xl items-center gap-14 lg:grid-cols-2">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#00a7f4]/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#0086c4]">
              <span className="h-2 w-2 rounded-full bg-[#00a7f4]" /> Agency Management Platform
            </div>
            <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.03em] md:text-7xl">
              Run your agency.<br />
              <span className="text-[#00a7f4]">From pipeline to profit.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#4a4a4a]">
              ANKA unites CRM, project estimation, contract billing, time tracking, and financial forecasting into one intelligent platform — powered by AI that builds teams, assigns work, and answers your questions.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?demo=1" className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-6 py-3 text-sm font-semibold text-white hover:bg-[#00a7f4]">
                Start free trial <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-[#171717] hover:text-[#00a7f4]">
                Sign in to workspace
              </Link>
            </div>
            <div className="mt-10 grid max-w-xl grid-cols-3 gap-6 border-t border-[#e6e9ee] pt-8">
              <Stat n={formatCurrency(DEMO_STATS.pipelineValue)} label="Active pipeline" />
              <Stat n={`${DEMO_STATS.dealsCount}`} label="Live deals" />
              <Stat n={`${DEMO_STATS.teamSize}`} label="Team members" />
            </div>
          </div>

          {/* Hero Dashboard Preview */}
          <div className="relative h-[520px]">
            <div className="absolute left-0 right-10 top-0 rounded-2xl border border-[#e6e9ee] bg-white p-6 shadow-[0_20px_60px_-20px_rgba(23,23,23,0.12)]">
              <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-[#8a8a8a]">
                <span>Pixel Agency Dashboard</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-600 font-medium text-[10px]">LIVE</span>
              </div>
              <div className="mb-1 flex items-end gap-3">
                <p className="text-5xl font-semibold tracking-tight">{formatCurrency(DEMO_STATS.wonRevenue)}</p>
              </div>
              <p className="mb-5 text-sm text-[#8a8a8a]">Won revenue · 1 active project · 5 team members</p>
              <div className="mb-5 h-24 rounded-xl bg-[linear-gradient(160deg,rgba(0,167,244,0.22),rgba(0,167,244,0.02))]" />
              <div className="space-y-2">
                <PipelineRow name="BluePeak Logistics — Dashboard" stage="Proposal" value="$65,000" prob="75%" />
                <PipelineRow name="Sunrise Fintech — Mobile MVP" stage="Qualified" value="$95,000" prob="40%" />
                <PipelineRow name="Meridian Health — Patient Portal" stage="Negotiation" value="$120,000" prob="90%" />
              </div>
            </div>
            <div className="absolute bottom-5 right-0 w-56 rounded-2xl border border-[#e6e9ee] bg-white p-4 shadow-[0_20px_60px_-20px_rgba(23,23,23,0.12)]">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8a8a]">Demo Quick Stats</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-[#4a4a4a]">Contracts</span><span className="font-semibold">4</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#4a4a4a]">Invoices</span><span className="font-semibold">3</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#4a4a4a]">Time Entries</span><span className="font-semibold">14</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Client Logos */}
      <section className="border-y border-[#e6e9ee] px-6 py-12 md:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <p className="mb-8 text-center font-mono text-xs uppercase tracking-[0.18em] text-[#8a8a8a]">Trusted by agencies managing projects for</p>
          <div className="grid grid-cols-2 gap-6 text-center text-sm font-medium text-[#8a8a8a] md:grid-cols-6">
            {clientLogos.map((l) => <p key={l}>{l}</p>)}
          </div>
        </div>
      </section>

      {/* AI Features */}
      <section id="ai" className="mx-auto w-full max-w-7xl px-6 py-24 md:px-10">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#0086c4]">AI-Powered</p>
        <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Three AI features that change how agencies work.</h2>
        <p className="mt-5 max-w-3xl text-lg text-[#4a4a4a]">Every recommendation is grounded in your real employee data, project scope, and financial history.</p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <AIFeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="AI Team Builder"
            description="Paste a project brief and the AI suggests the optimal team composition — matching skills, capacity, and budget in seconds."
            cta="See it in CRM → Estimation"
          />
          <AIFeatureCard
            icon={<Users className="h-5 w-5" />}
            title="Auto Assign"
            description="When a deal is won, AI automatically distributes workload hours across the project team based on roles and availability."
            cta="See it in Projects → Team"
          />
          <AIFeatureCard
            icon={<MessageSquare className="h-5 w-5" />}
            title="ANKA Assistant"
            description="Ask the chatbot anything about CRM, estimation, contracts, or time tracking. It answers from your platform documentation."
            cta="Open the chatbot anywhere"
          />
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="bg-white px-6 py-24 md:px-10 border-y border-[#e6e9ee]">
        <div className="mx-auto w-full max-w-7xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#0086c4]">Platform Modules</p>
          <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Everything an agency needs, connected.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-12">
            <FeatureCard className="md:col-span-4" icon={<Layers className="h-5 w-5" />} title="Project Pipeline" description="Move deals through C → B → A → S with event-driven rank transitions. AI drafts contracts from your Estimation handoff and locks terms once drafting starts." />
            <FeatureCard className="md:col-span-4" icon={<BarChart3 className="h-5 w-5" />} title="Estimation Engine" description="Calculate labor, overhead, buffer, and margin in real time. AI suggests the right team before you commit." />
            <FeatureCard className="md:col-span-4" icon={<FileText className="h-5 w-5" />} title="Contracts & Billing" description="Milestone-based contracts with invoice tracking. Revenue recognition updates automatically when invoices are paid." />
            <FeatureCard className="md:col-span-4" icon={<Briefcase className="h-5 w-5" />} title="Project Delivery" description="Track budget hours, consumed hours, and burn rate. See which projects are on track, at risk, or over budget." />
            <FeatureCard className="md:col-span-4" icon={<Clock3 className="h-5 w-5" />} title="Time Tracking" description="Log, submit, and approve time entries. Approved hours feed directly into project burn and P&L calculations." />
            <FeatureCard className="md:col-span-4" icon={<TrendingUp className="h-5 w-5" />} title="Financials & Forecast" description="Real-time P&L from paid invoices and approved time entries. Forecast scenarios against configurable shock variables." />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-[#171717] px-6 py-24 text-[#f8fafc] md:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#00a7f4]">The Flow</p>
          <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">From first contact to final invoice, in one system.</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-5">
            <Step n="1" title="Capture" text="Log the lead, client info, and project scope in the CRM." />
            <Step n="2" title="Estimate" text="AI suggests team composition and calculates cost, margin, and price." />
            <Step n="3" title="Win" text="Close the deal — ANKA auto-creates the contract and project." />
            <Step n="4" title="Deliver" text="Track time, manage milestones, and monitor burn rate in real time." />
            <Step n="5" title="Bill" text="Invoice by milestone, recognize revenue, and review P&L automatically." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center md:px-10" id="pricing">
        <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">See ANKA in action with your own data.</h2>
        <p className="mx-auto mt-5 max-w-3xl text-lg text-[#4a4a4a]">Log in with the demo account to explore a fully seeded agency workspace — deals, projects, time entries, invoices, and AI features ready to go.</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/login?demo=1" className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-6 py-3 text-sm font-semibold text-white hover:bg-[#00a7f4]">Launch demo workspace <ArrowRight className="h-4 w-4" /></Link>
          <a href="#features" className="inline-flex items-center rounded-full px-6 py-3 text-sm font-semibold text-[#171717] hover:text-[#00a7f4]">Explore features</a>
        </div>
        <div className="mt-8 text-xs text-[#8a8a8a]">
          <p>Demo credentials: <span className="font-mono text-[#4a4a4a]">admin@pixelagency.test</span> / <span className="font-mono text-[#4a4a4a]">Demo@1234</span></p>
        </div>
      </section>

      {/* Footer */}
      <footer id="docs" className="border-t border-[#e6e9ee] px-6 pb-10 pt-14 md:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid gap-8 md:grid-cols-5">
            <div className="md:col-span-2">
              <p className="text-xl font-semibold">ANKA</p>
              <p className="mt-3 max-w-sm text-sm text-[#4a4a4a]">All-in-one agency management: pipeline, estimation, contracts, projects, time tracking, and financials — with AI that works.</p>
            </div>
            <FooterCol t="Product" items={["Project Pipeline", "AI Estimation", "Contracts", "Time Tracking", "Financials"]} />
            <FooterCol t="Company" items={["About", "Customers", "Careers", "Contact"]} />
            <FooterCol t="Resources" items={["Documentation", "API reference", "Demo Guide", "Security"]} />
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e9ee] pt-6 font-mono text-xs text-[#8a8a8a]">
            <p>© 2026 ANKA Systems</p>
            <p className="inline-flex items-center gap-2"><ShieldCheck className="h-3 w-3" /> PRESENTATION READY</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-semibold tracking-tight text-[#171717]">{n}</p>
      <p className="mt-1 text-sm text-[#8a8a8a]">{label}</p>
    </div>
  );
}

function PipelineRow({ name, stage, value, prob }: { name: string; stage: string; value: string; prob: string }) {
  const stageColors: Record<string, string> = {
    Proposal: 'bg-amber-50 text-amber-700',
    Qualified: 'bg-blue-50 text-blue-700',
    Negotiation: 'bg-purple-50 text-purple-700',
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#eef1f5] bg-[#f8fafc] p-3">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#00a7f4]/12 text-[#00a7f4]"><Briefcase className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-[#8a8a8a]">{stage} · {prob} win probability</p>
      </div>
      <p className="font-mono text-xs font-semibold text-[#00a7f4]">{value}</p>
    </div>
  );
}

function FeatureCard({ icon, title, description, className = "" }: { icon: React.ReactNode; title: string; description: string; className?: string }) {
  return (
    <article className={`rounded-2xl border border-[#e6e9ee] bg-white p-7 shadow-[0_12px_36px_-20px_rgba(0,166,244,0.25)] ${className}`}>
      <div className="mb-4 inline-flex rounded-xl bg-[#00a7f4]/10 p-3 text-[#00a7f4]">{icon}</div>
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">{description}</p>
    </article>
  );
}

function AIFeatureCard({ icon, title, description, cta }: { icon: React.ReactNode; title: string; description: string; cta: string }) {
  return (
    <article className="rounded-2xl border border-[#e6e9ee] bg-white p-7 shadow-[0_12px_36px_-20px_rgba(0,166,244,0.25)]">
      <div className="mb-4 inline-flex rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-3 text-white">{icon}</div>
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">{description}</p>
      <p className="mt-4 text-xs font-medium text-indigo-600">{cta}</p>
    </article>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <article className="border-l border-[#00a7f4]/35 pl-5">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-[#00a7f4]">Step {n}</p>
      <h4 className="text-2xl font-semibold tracking-tight">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-[#f8fafc]/70">{text}</p>
    </article>
  );
}

function FooterCol({ t, items }: { t: string; items: string[] }) {
  return (
    <div>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-[#8a8a8a]">{t}</p>
      <ul className="space-y-2 text-sm text-[#171717]">
        {items.map((item) => (
          <li key={item}><a href="#" className="hover:text-[#00a7f4]">{item}</a></li>
        ))}
      </ul>
    </div>
  );
}
