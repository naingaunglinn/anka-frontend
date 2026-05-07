import Link from "next/link";
import { ArrowRight, BrainCircuit, ChartNoAxesCombined, Sparkles } from "lucide-react";

const features = [
  {
    title: "Smart Margin Insights",
    description:
      "Reveal likely gross-profit outcomes before deals are signed, so teams can avoid low-margin commitments.",
    icon: BrainCircuit,
  },
  {
    title: "Fast What-If Simulation",
    description:
      "Compare staffing, cost, and pricing scenarios in seconds to choose the strongest plan with confidence.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Actionable Suggestions",
    description:
      "Get practical recommendations to improve profitability while keeping timelines and delivery quality intact.",
    icon: Sparkles,
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f8fafc] text-[#171717]">
      <div className="pointer-events-none absolute inset-0 animate-glow-drift bg-[radial-gradient(circle_at_12%_18%,rgba(0,166,244,0.22),transparent_38%),radial-gradient(circle_at_88%_16%,rgba(14,165,233,0.2),transparent_32%),radial-gradient(circle_at_50%_86%,rgba(56,189,248,0.2),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(112deg,rgba(248,250,252,0)_0%,rgba(255,255,255,0.8)_46%,rgba(248,250,252,0)_100%)]" />

      <section className="relative mx-auto flex w-full max-w-6xl flex-col px-6 pb-14 pt-10 md:px-10 md:pt-16">
        <header className="mb-16 flex animate-rise-in items-center justify-between">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#00a6f4]/35 bg-white/85 px-4 py-2 shadow-sm backdrop-blur-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[#00a6f4]" />
            <span className="text-sm font-semibold tracking-wide">ANKA</span>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-5 py-2.5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-black"
          >
            Sign In
          </Link>
        </header>

        <div className="mb-16 max-w-4xl">
          <p className="mb-4 inline-flex animate-rise-in items-center rounded-full border border-[#00a6f4]/30 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#00a6f4] [animation-delay:120ms]">
            ANKA Gross Profit Suggestion System
          </p>
          <h1 className="animate-rise-in text-4xl font-bold leading-tight tracking-[-0.025em] md:text-7xl md:leading-[1.02] [animation-delay:220ms]">
            Make Every Project
            <span className="block text-[#00a6f4]">More Profitable Before It Starts</span>
          </h1>
          <p className="mt-5 max-w-2xl animate-rise-in text-base leading-7 text-[#171717]/75 md:text-lg [animation-delay:320ms]">
            ANKA helps your team forecast gross profit and get clear suggestions on how to improve margins using practical,
            data-aware planning.
          </p>

          <div className="mt-8 flex animate-rise-in flex-wrap items-center gap-3 [animation-delay:420ms]">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-[#00a6f4] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(0,166,244,0.35)] transition hover:-translate-y-0.5 hover:bg-[#0797dd]"
            >
              Start With ANKA
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-[#171717]/20 bg-white px-6 py-3 text-sm font-semibold text-[#171717] transition hover:-translate-y-0.5 hover:border-[#171717]/40"
            >
              View Dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {features.map(({ title, description, icon: Icon }, index) => (
            <article
              key={title}
              className="animate-rise-in rounded-2xl border border-[#00a6f4]/15 bg-white/90 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(0,0,0,0.09)]"
              style={{ animationDelay: `${520 + index * 110}ms` }}
            >
              <div className="mb-4 inline-flex rounded-xl bg-[#00a6f4]/10 p-3 text-[#00a6f4]">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mb-2 text-lg font-semibold">{title}</h2>
              <p className="text-sm leading-6 text-[#171717]/70">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
