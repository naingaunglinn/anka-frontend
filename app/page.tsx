import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, BarChart3, Briefcase, Clock3, FileText, Layers, MessageSquare, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export default async function Home() {
  const t = await getTranslations();
  return (
    <main className="bg-[var(--color-bg-page)] text-[var(--color-text-default)]">
      {/* Navigation */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--color-border-default)] bg-[var(--color-bg-page)]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-3 text-xl font-semibold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-500)] text-white font-bold">A</span>
            ANKA
          </div>
          <nav className="hidden items-center gap-8 text-sm text-[var(--color-text-subtle)] md:flex">
            <a href="#features" className="hover:text-[var(--color-brand-500)]">{t('nav_features')}</a>
            <a href="#ai" className="hover:text-[var(--color-brand-500)]">{t('nav_ai_features')}</a>
            <a href="#how" className="hover:text-[var(--color-brand-500)]">{t('nav_how_it_works')}</a>
            <a href="#modules" className="hover:text-[var(--color-brand-500)]">{t('nav_modules')}</a>
          </nav>
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-[var(--color-text-default)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--color-brand-500)]">
              {t('sign_in_short')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 pb-20 pt-36 md:px-10 md:pt-44">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(0,167,244,0.15),transparent_34%),radial-gradient(circle_at_88%_15%,rgba(0,167,244,0.12),transparent_30%)]" />
        <div className="mx-auto w-full max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-500)]/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[var(--color-brand-700)]">
            <span className="h-2 w-2 rounded-full bg-[var(--color-brand-500)]" /> {t('agency_management_platform')}
          </div>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.03em] md:text-7xl">
            {t('hero_title_run')}<br />
            <span className="text-[var(--color-brand-500)]">{t('hero_title_pipeline_to_profit')}</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[var(--color-text-subtle)]">
            {t('hero_subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-[var(--color-text-default)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--color-brand-500)]">
              {t('sign_in_to_workspace')} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* AI Features */}
      <section id="ai" className="mx-auto w-full max-w-7xl px-6 py-24 md:px-10">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-brand-700)]">{t('ai_powered_label')}</p>
        <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">{t('ai_section_heading')}</h2>
        <p className="mt-5 max-w-3xl text-lg text-[var(--color-text-subtle)]">{t('ai_section_subtitle')}</p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <AIFeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title={t('ai_team_builder_title')}
            description={t('ai_team_builder_desc')}
            cta={t('ai_team_builder_cta')}
          />
          <AIFeatureCard
            icon={<Users className="h-5 w-5" />}
            title={t('ai_auto_assign_title')}
            description={t('ai_auto_assign_desc')}
            cta={t('ai_auto_assign_cta')}
          />
          <AIFeatureCard
            icon={<MessageSquare className="h-5 w-5" />}
            title={t('ai_assistant_title')}
            description={t('ai_assistant_desc')}
            cta={t('ai_assistant_cta')}
          />
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="bg-white px-6 py-24 md:px-10 border-y border-[var(--color-border-default)]">
        <div className="mx-auto w-full max-w-7xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-brand-700)]">{t('platform_modules_label')}</p>
          <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">{t('modules_heading')}</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-12">
            <FeatureCard className="md:col-span-4" icon={<Layers className="h-5 w-5" />} title={t('module_pipeline_title')} description={t('module_pipeline_desc')} />
            <FeatureCard className="md:col-span-4" icon={<BarChart3 className="h-5 w-5" />} title={t('module_estimation_title')} description={t('module_estimation_desc')} />
            <FeatureCard className="md:col-span-4" icon={<FileText className="h-5 w-5" />} title={t('module_contracts_title')} description={t('module_contracts_desc')} />
            <FeatureCard className="md:col-span-4" icon={<Briefcase className="h-5 w-5" />} title={t('module_delivery_title')} description={t('module_delivery_desc')} />
            <FeatureCard className="md:col-span-4" icon={<Clock3 className="h-5 w-5" />} title={t('module_time_title')} description={t('module_time_desc')} />
            <FeatureCard className="md:col-span-4" icon={<TrendingUp className="h-5 w-5" />} title={t('module_financials_title')} description={t('module_financials_desc')} />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-[var(--color-text-default)] px-6 py-24 text-[var(--color-bg-page)] md:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-brand-500)]">{t('the_flow_label')}</p>
          <h2 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">{t('how_heading')}</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-5">
            <Step n="1" stepLabel={t('step_word')} title={t('step_capture_title')} text={t('step_capture_text')} />
            <Step n="2" stepLabel={t('step_word')} title={t('step_estimate_title')} text={t('step_estimate_text')} />
            <Step n="3" stepLabel={t('step_word')} title={t('step_win_title')} text={t('step_win_text')} />
            <Step n="4" stepLabel={t('step_word')} title={t('step_deliver_title')} text={t('step_deliver_text')} />
            <Step n="5" stepLabel={t('step_word')} title={t('step_bill_title')} text={t('step_bill_text')} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="docs" className="border-t border-[var(--color-border-default)] px-6 pb-10 pt-14 md:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid gap-8 md:grid-cols-5">
            <div className="md:col-span-2">
              <p className="text-xl font-semibold">ANKA</p>
              <p className="mt-3 max-w-sm text-sm text-[var(--color-text-subtle)]">{t('footer_tagline')}</p>
            </div>
            <FooterCol t={t('footer_col_product')} items={[t('module_pipeline_title'), t('footer_item_ai_estimation'), t('module_contracts_title'), t('module_time_title'), t('module_financials_title')]} />
            <FooterCol t={t('footer_col_company')} items={[t('footer_item_about'), t('footer_item_customers'), t('footer_item_careers'), t('footer_item_contact')]} />
            <FooterCol t={t('footer_col_resources')} items={[t('footer_item_documentation'), t('footer_item_api_reference'), t('footer_item_security')]} />
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-default)] pt-6 font-mono text-xs text-[var(--color-text-muted)]">
            <p>{t('footer_copyright')}</p>
            <p className="inline-flex items-center gap-2"><ShieldCheck className="h-3 w-3" /> {t('footer_presentation_ready')}</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, description, className = "" }: { icon: React.ReactNode; title: string; description: string; className?: string }) {
  return (
    <article className={`rounded-2xl border border-[var(--color-border-default)] bg-white p-7 shadow-[var(--shadow-md)] ${className}`}>
      <div className="mb-4 inline-flex rounded-xl bg-[var(--color-brand-500)]/10 p-3 text-[var(--color-brand-500)]">{icon}</div>
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text-subtle)]">{description}</p>
    </article>
  );
}

function AIFeatureCard({ icon, title, description, cta }: { icon: React.ReactNode; title: string; description: string; cta: string }) {
  return (
    <article className="rounded-2xl border border-[var(--color-border-default)] bg-white p-7 shadow-[var(--shadow-md)]">
      <div className="mb-4 inline-flex rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-3 text-white">{icon}</div>
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text-subtle)]">{description}</p>
      <p className="mt-4 text-xs font-medium text-indigo-600">{cta}</p>
    </article>
  );
}

function Step({ n, stepLabel, title, text }: { n: string; stepLabel: string; title: string; text: string }) {
  return (
    <article className="border-l border-[#00a7f4]/35 pl-5">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-brand-500)]">{stepLabel} {n}</p>
      <h4 className="text-2xl font-semibold tracking-tight">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-[var(--color-bg-page)]/70">{text}</p>
    </article>
  );
}

function FooterCol({ t, items }: { t: string; items: string[] }) {
  return (
    <div>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{t}</p>
      <ul className="space-y-2 text-sm text-[var(--color-text-default)]">
        {items.map((item) => (
          <li key={item}><a href="#" className="hover:text-[var(--color-brand-500)]">{item}</a></li>
        ))}
      </ul>
    </div>
  );
}
