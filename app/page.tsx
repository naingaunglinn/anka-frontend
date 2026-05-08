import Link from "next/link";
import { ArrowRight, BarChart3, Clock3, Database, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

const logos = ["Meridian", "Halcyon & Co.", "// NORTHWIND", "Cordilla", "Westbrook", "VECTOR/22"];

export default function Home() {
  return (
    <main className="bg-[#f8fafc] text-[#171717]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#e6e9ee] bg-[#f8fafc]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-3 text-xl font-semibold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#00a7f4]/35 text-[#00a7f4]">A</span>
            ANKA
          </div>
          <nav className="hidden items-center gap-8 text-sm text-[#4a4a4a] md:flex">
            <a href="#features" className="hover:text-[#00a7f4]">Features</a>
            <a href="#how" className="hover:text-[#00a7f4]">How it works</a>
            <a href="#pricing" className="hover:text-[#00a7f4]">Pricing</a>
            <a href="#docs" className="hover:text-[#00a7f4]">Documentation</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm font-medium text-[#171717] hover:text-[#00a7f4] md:inline-flex">Sign in</Link>
            <Link href="/login?demo=1" className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#00a7f4]">
              Request demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden px-6 pb-20 pt-36 md:px-10 md:pt-44">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(0,167,244,0.15),transparent_34%),radial-gradient(circle_at_88%_15%,rgba(0,167,244,0.12),transparent_30%)]" />
        <div className="mx-auto grid w-full max-w-7xl items-center gap-14 lg:grid-cols-2">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#00a7f4]/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#0086c4]">
              <span className="h-2 w-2 rounded-full bg-[#00a7f4]" /> Gross Profit Intelligence · v3.2
            </div>
            <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.03em] md:text-7xl">
              Price with conviction.<br />
              <span className="text-[#00a7f4]">Profit with precision.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#4a4a4a]">
              ANKA analyzes every line item, segment, and margin variable in real time to surface pricing decisions that move gross profit.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-6 py-3 text-sm font-semibold text-white hover:bg-[#00a7f4]">
                Start free trial <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-[#171717] hover:text-[#00a7f4]">
                Watch 2-min demo
              </Link>
            </div>
            <div className="mt-10 grid max-w-xl grid-cols-3 gap-6 border-t border-[#e6e9ee] pt-8">
              <Stat n="+14.2%" label="Avg. GP improvement" />
              <Stat n="2.1M" label="Daily suggestions" />
              <Stat n="98%" label="Forecast accuracy" />
            </div>
          </div>

          <div className="relative h-[520px]">
            <div className="absolute left-0 right-10 top-0 rounded-2xl border border-[#e6e9ee] bg-white p-6 shadow-[0_20px_60px_-20px_rgba(23,23,23,0.12)]">
              <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-[#8a8a8a]">
                <span>Gross Profit · Q4</span>
                <span className="rounded-full bg-[#00a7f4]/10 px-3 py-1 text-[#0086c4]">LIVE</span>
              </div>
              <div className="mb-1 flex items-end gap-3">
                <p className="text-5xl font-semibold tracking-tight">$4.82M</p>
                <p className="flex items-center gap-1 font-mono text-sm font-semibold text-[#00a7f4]"><TrendingUp className="h-4 w-4" />+14.2%</p>
              </div>
              <p className="mb-5 text-sm text-[#8a8a8a]">vs $4.22M previous quarter · 12 active suggestions</p>
              <div className="mb-5 h-24 rounded-xl bg-[linear-gradient(160deg,rgba(0,167,244,0.22),rgba(0,167,244,0.02))]" />
              <div className="space-y-2">
                <Suggestion t="Raise SKU-4471 to $89.50" m="Elasticity: low · Confidence: 94%" i="+$28K" />
                <Suggestion t="Tier discount expiring · Segment B" m="12 customers affected" i="+$14K" />
              </div>
            </div>
            <div className="absolute bottom-5 right-0 w-56 rounded-2xl border border-[#e6e9ee] bg-white p-4 shadow-[0_20px_60px_-20px_rgba(23,23,23,0.12)]">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8a8a]">Margin Health</p>
              <p className="text-4xl font-semibold">38.7%</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef1f5]"><div className="h-full w-[78%] bg-[#00a7f4]" /></div>
              <p className="mt-2 font-mono text-[11px] text-[#8a8a8a]">Target: 35.0% · Beating by 3.7pp</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#e6e9ee] px-6 py-12 md:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <p className="mb-8 text-center font-mono text-xs uppercase tracking-[0.18em] text-[#8a8a8a]">Trusted by finance & revenue teams at</p>
          <div className="grid grid-cols-2 gap-6 text-center text-xl text-[#8a8a8a] md:grid-cols-6">
            {logos.map((l) => <p key={l}>{l}</p>)}
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-7xl px-6 py-24 md:px-10">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#0086c4]">What ANKA does</p>
        <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Suggestions that survive the boardroom.</h2>
        <p className="mt-5 max-w-3xl text-lg text-[#4a4a4a]">Every recommendation is grounded in transactional data, market signals, and segment-level elasticity.</p>
        <div className="mt-12 grid gap-5 md:grid-cols-12">
          <Card className="md:col-span-7" icon={<BarChart3 className="h-5 w-5" />} t="Dynamic price recommendations" d="ANKA evaluates demand history, competitor movement, and cohorts to rank pricing actions by impact and risk." />
          <Card className="md:col-span-5" icon={<TrendingUp className="h-5 w-5" />} t="Margin alerts before the bleed" d="Real-time anomaly detection flags margin erosion as it begins, not at month-end close." />
          <Card className="md:col-span-4" icon={<Sparkles className="h-5 w-5" />} t="Segment-aware pricing" d="Enterprise, SMB, and direct channels each get tuned recommendations." />
          <Card className="md:col-span-4" icon={<Database className="h-5 w-5" />} t="API-first integration" d="Connect NetSuite, SAP, Salesforce, and your BI stack with low-friction rollout." />
          <Card className="md:col-span-4" icon={<ShieldCheck className="h-5 w-5" />} t="Audit-grade reasoning" d="Each suggestion includes the data evidence behind it for leadership review." />
        </div>
      </section>

      <section id="how" className="bg-[#171717] px-6 py-24 text-[#f8fafc] md:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#00a7f4]">The flow</p>
          <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">From transaction to decision, in seconds.</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-4">
            <Step title="Ingest" text="Connect transactional, cost, and customer data via API or pre-built connectors." />
            <Step title="Model" text="Elasticity and demand forecasting combine into a unified margin model." />
            <Step title="Suggest" text="Ranked recommendations land directly in pricing and sales workflows." />
            <Step title="Learn" text="Accepted or rejected actions feed back to improve the model each cycle." />
          </div>
        </div>
      </section>

      <section className="px-6 py-24 text-center md:px-10" id="pricing">
        <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">See what ANKA suggests for your margins.</h2>
        <p className="mx-auto mt-5 max-w-3xl text-lg text-[#4a4a4a]">Connect a sample dataset in under 30 minutes and get a quantified GP opportunity report.</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-6 py-3 text-sm font-semibold text-white hover:bg-[#00a7f4]">Book a margin assessment <ArrowRight className="h-4 w-4" /></Link>
          <a href="#docs" className="inline-flex items-center rounded-full px-6 py-3 text-sm font-semibold text-[#171717] hover:text-[#00a7f4]">Read the technical brief</a>
        </div>
      </section>

      <footer id="docs" className="border-t border-[#e6e9ee] px-6 pb-10 pt-14 md:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid gap-8 md:grid-cols-5">
            <div className="md:col-span-2">
              <p className="text-xl font-semibold">ANKA</p>
              <p className="mt-3 max-w-sm text-sm text-[#4a4a4a]">Gross profit intelligence for finance and revenue teams who refuse to leave margin on the table.</p>
            </div>
            <FooterCol t="Product" items={["Features", "Integrations", "Pricing", "Changelog"]} />
            <FooterCol t="Company" items={["About", "Customers", "Careers", "Contact"]} />
            <FooterCol t="Resources" items={["Documentation", "API reference", "Case studies", "Security"]} />
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e9ee] pt-6 font-mono text-xs text-[#8a8a8a]">
            <p>© 2026 ANKA Systems · v3.2.4</p>
            <p className="inline-flex items-center gap-2"><Clock3 className="h-3 w-3" /> STATUS: ALL_SYSTEMS_OPERATIONAL</p>
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

function Suggestion({ t, m, i }: { t: string; m: string; i: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#eef1f5] bg-[#f8fafc] p-3">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#00a7f4]/12 text-[#00a7f4]">$</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{t}</p>
        <p className="truncate text-xs text-[#8a8a8a]">{m}</p>
      </div>
      <p className="font-mono text-xs font-semibold text-[#00a7f4]">{i}</p>
    </div>
  );
}

function Card({ icon, t, d, className = "" }: { icon: React.ReactNode; t: string; d: string; className?: string }) {
  return (
    <article className={`rounded-2xl border border-[#e6e9ee] bg-white p-7 shadow-[0_12px_36px_-20px_rgba(0,167,244,0.25)] ${className}`}>
      <div className="mb-4 inline-flex rounded-xl bg-[#00a7f4]/10 p-3 text-[#00a7f4]">{icon}</div>
      <h3 className="text-2xl font-semibold tracking-tight">{t}</h3>
      <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">{d}</p>
    </article>
  );
}

function Step({ title, text }: { title: string; text: string }) {
  return (
    <article className="border-l border-[#00a7f4]/35 pl-5">
      <p className="mb-5 font-mono text-xs uppercase tracking-[0.14em] text-[#00a7f4]">Step</p>
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

