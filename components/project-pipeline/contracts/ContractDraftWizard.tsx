'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, ArrowLeft, Sparkles, Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { TemplatePicker } from './TemplatePicker';
import { WizardQuestions } from './WizardQuestions';
import { SectionEditor } from './SectionEditor';
import { SignedUpload } from './SignedUpload';
import { DraftStatusChip } from './DraftStatusChip';
import {
    useContractTemplates,
    useContractTemplate,
    useGenerateDraft,
    useUpdateDraftSection,
    useRegenerateSection,
    useSendDraft,
    useMarkSigned,
    type DealContractDraft,
    type RenderedSection,
} from '@/lib/queries/contractDrafts';
import { useTenantSettings } from '@/lib/queries/tenant';
import { SignatoryPicker } from '@/components/forms/SignatoryPicker';
import type { Deal } from '@/types/business';
import { normalizeError, firstFieldError } from '@/lib/errorHandler';

type Step = 'choose' | 'edit' | 'send';

/**
 * 3-step orchestrator for AI contract drafting.
 *
 *   choose  → pick a template variant + answer Path C questions
 *   edit    → review AI output, hand-edit sections, regenerate per-section
 *   send    → email to customer + (when sent) upload counter-signed PDF → S
 *
 * The wizard handles its own server state; the parent page only provides
 * the deal + an optional draft to resume editing.
 */
export function ContractDraftWizard({
    deal,
    initialDraft,
}: {
    deal: Deal;
    /** When set, skip to the edit step using this draft. */
    initialDraft?: DealContractDraft;
}) {
    const router = useRouter();
    // When opening an existing draft that's already been sent (or signed),
    // skip Edit and land on the Send step directly — that's where the
    // user wants to be (re-send to a different email, or upload the
    // counter-signed PDF). 'draft' status still starts on Edit.
    const [step, setStep] = useState<Step>(() => {
        if (!initialDraft) return 'choose';
        if (initialDraft.status === 'sent_to_customer' || initialDraft.status === 'signed') {
            return 'send';
        }
        return 'edit';
    });
    const [draft, setDraft] = useState<DealContractDraft | null>(initialDraft ?? null);

    // ── Step 1 state ──
    const templatesQuery = useContractTemplates('SES');
    const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
    const [templateId, setTemplateId] = useState<string | null>(() => {
        if (initialDraft) return initialDraft.template_id;
        return null;
    });
    const templateDetail = useContractTemplate(templateId ?? '');
    const sectionsForQuestions = templateDetail.data?.sections ?? [];
    const [wizardAnswers, setWizardAnswers] = useState<Record<string, unknown>>(() => {
        if (initialDraft) return initialDraft.wizard_inputs as Record<string, unknown>;
        return {};
    });

    // Default-pick the suggested variant once templates load. useEffect (not
    // inline setState during render) so React doesn't warn about cascading
    // updates and so this only fires when templates / suggestion change.
    useEffect(() => {
        if (templateId || templates.length === 0 || !deal.suggestedTemplateVariant) return;
        const suggested = templates.find((t) => t.slug === deal.suggestedTemplateVariant);
        if (suggested) setTemplateId(suggested.id);
    }, [templateId, templates, deal.suggestedTemplateVariant]);

    const generateMutation = useGenerateDraft();
    const updateSectionMutation = useUpdateDraftSection();
    const regenerateMutation = useRegenerateSection();
    const sendMutation = useSendDraft();
    const markSignedMutation = useMarkSigned();
    const [activeRegenerateKey, setActiveRegenerateKey] = useState<string | null>(null);
    const [activeSaveKey, setActiveSaveKey] = useState<string | null>(null);
    const [emailTo, setEmailTo] = useState(deal.contactEmail ?? '');

    // ── Provider signatory override state ──
    // Tenant has a default signatory (Org → Company); this wizard step lets
    // the operator override per-contract for cases where a different person
    // signs (e.g. a director signs the big-ticket deals only). Empty → use
    // tenant default at render time. The inputs pre-fill from the tenant.
    const tenantQuery = useTenantSettings();
    const [signatoryName, setSignatoryName] = useState('');
    const [signatoryTitle, setSignatoryTitle] = useState('');
    useEffect(() => {
        if (initialDraft) return; // editing an existing draft — don't reset
        if (signatoryName === '' && tenantQuery.data?.signatoryName) {
            setSignatoryName(tenantQuery.data.signatoryName);
        }
        if (signatoryTitle === '' && tenantQuery.data?.signatoryTitle) {
            setSignatoryTitle(tenantQuery.data.signatoryTitle);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantQuery.data?.id]);

    const todoCount = draft
        ? draft.sections.reduce((acc, s) => acc + (s.rendered.match(/\{\{TODO/g)?.length ?? 0), 0)
        : 0;
    const hasTodos = todoCount > 0;
    const isLocked = draft?.status === 'signed' || draft?.status === 'superseded';

    async function handleGenerate() {
        if (!templateId) {
            toast.error('Pick a template first.');
            return;
        }
        try {
            // Send the signatory override only when it differs from the tenant
            // default. Null = "use tenant default at render time"; an explicit
            // empty string would lock the draft to "no signatory" forever.
            const tenantSigName = tenantQuery.data?.signatoryName ?? '';
            const tenantSigTitle = tenantQuery.data?.signatoryTitle ?? '';
            const sigNameTrimmed = signatoryName.trim();
            const sigTitleTrimmed = signatoryTitle.trim();
            const result = await generateMutation.mutateAsync({
                dealId: deal.id,
                template_id: templateId,
                wizard_inputs: wizardAnswers,
                signatory_name_override: sigNameTrimmed !== tenantSigName.trim() ? (sigNameTrimmed || null) : null,
                signatory_title_override: sigTitleTrimmed !== tenantSigTitle.trim() ? (sigTitleTrimmed || null) : null,
            });
            setDraft(result);
            setStep('edit');
            toast.success('Draft generated.');
        } catch (err) {
            showError(err);
        }
    }

    // Helper: prefer the first field-level error from a 422 (since Laravel's
    // default "The given data was invalid." message is uselessly generic).
    function showError(err: unknown) {
        const normalized = normalizeError(err);
        const detail = firstFieldError(normalized);
        toast.error(detail ?? normalized.message);
    }

    async function handleSaveSection(sectionKey: string, content: string) {
        if (!draft) return;
        setActiveSaveKey(sectionKey);
        try {
            const updated = await updateSectionMutation.mutateAsync({
                draftId: draft.id,
                sectionKey,
                content,
            });
            setDraft(updated);
        } catch (err) {
            showError(err);
        } finally {
            setActiveSaveKey(null);
        }
    }

    async function handleRegenerate(sectionKey: string) {
        if (!draft) return;
        setActiveRegenerateKey(sectionKey);
        try {
            const updated = await regenerateMutation.mutateAsync({
                draftId: draft.id,
                section_key: sectionKey,
                wizard_inputs: wizardAnswers,
            });
            setDraft(updated);
            toast.success(`Regenerated "${sectionKey}".`);
        } catch (err) {
            showError(err);
        } finally {
            setActiveRegenerateKey(null);
        }
    }

    async function handleSend() {
        if (!draft || !emailTo) return;
        try {
            const updated = await sendMutation.mutateAsync({
                draftId: draft.id,
                to_email: emailTo,
            });
            setDraft(updated);
            toast.success(`Draft sent to ${emailTo}.`);
        } catch (err) {
            showError(err);
        }
    }

    async function handleMarkSigned(file: File) {
        if (!draft) return;
        try {
            const result = await markSignedMutation.mutateAsync({
                draftId: draft.id,
                signedPdf: file,
            });
            setDraft(result.document);
            if (result.auto_won && result.contract?.id) {
                toast.success('Contract signed — deal moved to Won (S).');
                router.push(`/contracts/${result.contract.id}`);
            } else {
                toast.success('Draft marked signed.');
            }
        } catch (err) {
            showError(err);
        }
    }

    // ─── Step 1: choose ───────────────────────────────────────────────────

    if (step === 'choose') {
        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">1 · Pick a template</CardTitle>
                        <CardDescription>
                            Choose the SES variant that best matches this deal. The Estimation menu can hint
                            at one via <code>suggested_template_variant</code>.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {templatesQuery.isLoading ? (
                            <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
                        ) : (
                            <TemplatePicker
                                templates={templates}
                                selectedId={templateId}
                                onSelect={setTemplateId}
                                suggestedSlug={deal.suggestedTemplateVariant ?? null}
                            />
                        )}
                    </CardContent>
                </Card>

                {templateId && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">2 · Answer template-specific questions</CardTitle>
                            <CardDescription>
                                Anything you skip will become a <code className="text-amber-600">{'{{TODO}}'}</code> in
                                the generated draft for you to fill manually. The deal&apos;s Requirement
                                Description and Estimation handoff fields are passed automatically.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {templateDetail.isLoading ? (
                                <div className="h-48 animate-pulse rounded-lg bg-slate-100" />
                            ) : (
                                <WizardQuestions
                                    sections={sectionsForQuestions}
                                    answers={wizardAnswers}
                                    onChange={(k, v) => setWizardAnswers((s) => ({ ...s, [k]: v }))}
                                />
                            )}
                        </CardContent>
                    </Card>
                )}

                {templateId && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">3 · Provider signatory</CardTitle>
                            <CardDescription>
                                The person who signs on behalf of your company. Pre-filled from your
                                tenant default (Org → Company); override here just for this contract
                                if a different person should sign.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <SignatoryPicker
                                id="wizard-signatory-picker"
                                label="Override with a senior employee (optional)"
                                helper="Picking auto-fills the fields below. Leave the fields blank to use the tenant default."
                                onSelect={({ name, title }) => {
                                    setSignatoryName(name);
                                    setSignatoryTitle(title);
                                }}
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="wizard-signatory-name" className="text-xs">Name</Label>
                                    <Input
                                        id="wizard-signatory-name"
                                        value={signatoryName}
                                        onChange={(e) => setSignatoryName(e.target.value)}
                                        placeholder={tenantQuery.data?.signatoryName ?? 'e.g. U Aung Min'}
                                        maxLength={255}
                                        className="bg-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="wizard-signatory-title" className="text-xs">Title</Label>
                                    <Input
                                        id="wizard-signatory-title"
                                        value={signatoryTitle}
                                        onChange={(e) => setSignatoryTitle(e.target.value)}
                                        placeholder={tenantQuery.data?.signatoryTitle ?? 'e.g. Managing Director'}
                                        maxLength={255}
                                        className="bg-white"
                                    />
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-500">
                                Leave blank to use the tenant default. The contract date is auto-set
                                to today when the PDF is generated.
                            </p>
                        </CardContent>
                    </Card>
                )}

                <div className="flex justify-between items-center">
                    <Button variant="outline" onClick={() => router.push(`/project-pipeline/${deal.id}`)}>
                        <ArrowLeft className="h-4 w-4" /> Back to deal
                    </Button>
                    <Button
                        onClick={handleGenerate}
                        disabled={!templateId || generateMutation.isPending}
                        size="lg"
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        {generateMutation.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Generating (60–90s)…
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4" />
                                Generate draft
                                <ArrowRight className="h-4 w-4" />
                            </>
                        )}
                    </Button>
                </div>
            </div>
        );
    }

    // ─── Step 2: edit ─────────────────────────────────────────────────────

    if (step === 'edit' && draft) {
        const isSentDraft = draft.status === 'sent_to_customer';
        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader className="pb-3 flex flex-row items-start gap-3 justify-between">
                        <div className="min-w-0">
                            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                                Draft v{draft.version}
                                <DraftStatusChip status={draft.status} />
                                {draft.template && (
                                    <span className="text-xs font-normal text-slate-500">
                                        {draft.template.name}
                                    </span>
                                )}
                            </CardTitle>
                            <CardDescription className="mt-1">
                                Review and edit each section. {hasTodos
                                    ? <span className="text-amber-700 font-medium">{todoCount} TODO{todoCount === 1 ? '' : 's'} unresolved.</span>
                                    : <span className="text-emerald-700 font-medium">All sections complete.</span>}
                            </CardDescription>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setStep('choose')}
                            disabled={isLocked}
                        >
                            <ArrowLeft className="h-3.5 w-3.5" /> Edit answers
                        </Button>
                    </CardHeader>
                </Card>

                {isSentDraft && (
                    <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-sm text-blue-900">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                        <div>
                            <span className="font-medium">This draft has already been sent.</span>{' '}
                            Any edits you make here won&apos;t reach the customer until you re-send
                            from the next step. The PDF re-renders automatically on re-send so the
                            customer gets the updated content.
                        </div>
                    </div>
                )}

                {hasTodos && !isLocked && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-amber-900">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                            Resolve the {'{{TODO}}'} markers (or supply more wizard answers and regenerate)
                            before sending to the customer.
                        </span>
                    </div>
                )}

                <div className="space-y-4">
                    {draft.sections.map((section: RenderedSection) => {
                        const canRegenerate =
                            !isLocked &&
                            (section.type === 'ai_written' || section.type === 'ai_with_slots');
                        return (
                            <SectionEditor
                                key={section.key}
                                section={section}
                                onSave={(content) => handleSaveSection(section.key, content)}
                                onRegenerate={canRegenerate ? () => handleRegenerate(section.key) : undefined}
                                canRegenerate={canRegenerate}
                                isSaving={activeSaveKey === section.key}
                                isRegenerating={activeRegenerateKey === section.key}
                                readOnly={isLocked}
                            />
                        );
                    })}
                </div>

                <div className="flex justify-between items-center">
                    <Button variant="ghost" onClick={() => router.push(`/project-pipeline/${deal.id}`)}>
                        <ArrowLeft className="h-4 w-4" /> Back to deal
                    </Button>
                    {!isLocked && (
                        <Button
                            onClick={() => setStep('send')}
                            disabled={!draft}
                            size="lg"
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {draft?.status === 'sent_to_customer' ? 'Go to send / upload signed' : 'Continue to send'}
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    // ─── Step 3: send + sign ──────────────────────────────────────────────

    if (step === 'send' && draft) {
        const isSent = draft.status === 'sent_to_customer';
        const isSigned = draft.status === 'signed';

        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            3 · Send to customer
                            <DraftStatusChip status={draft.status} />
                        </CardTitle>
                        <CardDescription>
                            Email the draft to your contact. v1 records the send; the actual SMTP delivery
                            is wired in a follow-up.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {hasTodos && (
                            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-amber-900">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>
                                    {todoCount} unresolved TODO marker{todoCount === 1 ? '' : 's'} remain.
                                    Sending with TODOs visible looks unprofessional — go back and resolve them.
                                </span>
                            </div>
                        )}
                        <div className="space-y-1">
                            <Label htmlFor="to-email" className="text-xs">
                                Customer email <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="to-email"
                                type="email"
                                value={emailTo}
                                onChange={(e) => setEmailTo(e.target.value)}
                                placeholder="customer@example.com"
                                disabled={isSigned}
                                className="bg-white"
                            />
                            {draft.sent_to_email && (
                                <p className="text-[11px] text-slate-500">
                                    Last sent to <span className="font-medium">{draft.sent_to_email}</span>
                                    {draft.sent_at && ` · ${new Date(draft.sent_at).toLocaleString()}`}
                                </p>
                            )}
                        </div>
                        <Button
                            type="button"
                            onClick={handleSend}
                            disabled={!emailTo || isSigned || sendMutation.isPending}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {sendMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            <Mail className="h-3.5 w-3.5" />
                            {isSent ? 'Re-send' : sendMutation.isPending ? 'Sending…' : 'Send to customer'}
                        </Button>
                    </CardContent>
                </Card>

                {(isSent || isSigned) && draft && (
                    <SignedUpload
                        draftId={draft.id}
                        onSubmit={handleMarkSigned}
                        isSubmitting={markSignedMutation.isPending}
                    />
                )}

                {isSigned && (
                    <Card className="border-emerald-200 bg-emerald-50/30">
                        <CardContent className="p-4 flex items-start gap-3">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                            <div className="text-sm">
                                <p className="font-semibold text-emerald-900">Contract signed.</p>
                                <p className="text-emerald-800 mt-1">
                                    Deal moved to <strong>S — Won</strong>; contract record created.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <div className="flex justify-between items-center">
                    <Button variant="outline" onClick={() => setStep('edit')} disabled={isSigned}>
                        <ArrowLeft className="h-4 w-4" /> Back to edit
                    </Button>
                    <Button variant="ghost" onClick={() => router.push(`/project-pipeline/${deal.id}`)}>
                        Back to deal
                    </Button>
                </div>
            </div>
        );
    }

    return null;
}
