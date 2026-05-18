'use client';

import { useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { useTenantSettings, useTenantMutations } from '@/lib/queries/tenant';
import { useInitialBudgets, useUpsertInitialBudget, useDeleteInitialBudget } from '@/lib/queries/initialBudgets';
import { normalizeError, firstFieldError } from '@/lib/errorHandler';
import { SignatoryPicker } from '@/components/forms/SignatoryPicker';
import { useTenantStore, type Currency } from '@/store/tenantStore';

const ALLOWED_LOGO_EXT = ['png', 'jpg', 'jpeg', 'webp'] as const;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Company settings — editable per-tenant data that appears on contracts
 * and customer-facing emails. Currently exposes:
 *   - Company name (used in PDF header + email subject + Parties block)
 *   - Logo (rendered at the top of every contract PDF; PNG/JPG/WebP <2MB)
 *
 * Org-admin only (the parent page already gates the tab on the right
 * permission). The PUT /tenant + POST /tenant/logo + DELETE /tenant/logo
 * endpoints enforce the same on the backend.
 */
export function CompanySettingsForm() {
    const t = useTranslations();
    const { data: tenant, isLoading, isError, refetch } = useTenantSettings();
    const { updateTenant, uploadLogo, deleteLogo } = useTenantMutations();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency) ?? tenants.find((tenant) => tenant.id === activeTenantId)?.currency ?? 'MMK';

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [nameDraft, setNameDraft] = useState('');
    const [signatoryNameDraft, setSignatoryNameDraft] = useState('');
    const [signatoryTitleDraft, setSignatoryTitleDraft] = useState('');

    // Sync local drafts with whatever the server says once it loads.
    // Reset only when the tenant id changes so background refetches don't
    // clobber an in-flight edit.
    useEffect(() => {
        if (tenant?.name && nameDraft === '') {
            setNameDraft(tenant.name);
        }
        if (signatoryNameDraft === '') {
            setSignatoryNameDraft(tenant?.signatoryName ?? '');
        }
        if (signatoryTitleDraft === '') {
            setSignatoryTitleDraft(tenant?.signatoryTitle ?? '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenant?.id]);

    const nameDirty = tenant && nameDraft !== tenant.name && nameDraft.trim().length > 0;
    const signatoryDirty = tenant && (
        signatoryNameDraft.trim() !== (tenant.signatoryName ?? '').trim()
        || signatoryTitleDraft.trim() !== (tenant.signatoryTitle ?? '').trim()
    );

    const handleFileSelected = async (file: File) => {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!ALLOWED_LOGO_EXT.includes(ext as typeof ALLOWED_LOGO_EXT[number])) {
            toast.error(t('unsupported_file_type', { types: ALLOWED_LOGO_EXT.join(', ') }));
            return;
        }
        if (file.size > MAX_LOGO_BYTES) {
            toast.error(t('file_too_large_2mb'));
            return;
        }

        try {
            await uploadLogo.mutateAsync(file);
            toast.success(t('logo_uploaded'));
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(firstFieldError(normalized) ?? normalized.message);
        }
    };

    const handleSaveName = async () => {
        if (!nameDirty) return;
        try {
            await updateTenant.mutateAsync({ name: nameDraft.trim() });
            toast.success(t('company_name_updated'));
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(firstFieldError(normalized) ?? normalized.message);
        }
    };

    const handleSaveSignatory = async () => {
        if (!signatoryDirty) return;
        try {
            await updateTenant.mutateAsync({
                signatory_name: signatoryNameDraft.trim() || null,
                signatory_title: signatoryTitleDraft.trim() || null,
            });
            toast.success(t('signatory_updated'));
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(firstFieldError(normalized) ?? normalized.message);
        }
    };

    const handleDeleteLogo = async () => {
        try {
            await deleteLogo.mutateAsync();
            toast.success(t('logo_removed'));
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(firstFieldError(normalized) ?? normalized.message);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-500 p-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('loading_company_settings')}
            </div>
        );
    }

    if (isError || !tenant) {
        return (
            <Card className="border-red-200 bg-red-50/30">
                <CardContent className="p-6 space-y-2">
                    <p className="text-sm text-red-700">{t('couldnt_load_company')}</p>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>{t('retry')}</Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="h-4 w-4" /> {t('company_name')}
                    </CardTitle>
                    <CardDescription>
                        {t('company_name_desc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="company-name">{t('name')}</Label>
                        <Input
                            id="company-name"
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            placeholder={t('placeholder_company_name')}
                            maxLength={255}
                            className="bg-white"
                        />
                    </div>
                    <div className="flex justify-end">
                        <Button
                            onClick={handleSaveName}
                            disabled={!nameDirty || updateTenant.isPending}
                            size="sm"
                        >
                            {updateTenant.isPending ? t('saving') : t('save_name')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('authorized_signatory')}</CardTitle>
                    <CardDescription>
                        {t('signatory_desc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <SignatoryPicker
                        id="signatory-picker-tenant"
                        helper={t('signatory_helper')}
                        onSelect={({ name, title }) => {
                            setSignatoryNameDraft(name);
                            setSignatoryTitleDraft(title);
                        }}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="signatory-name">{t('name')}</Label>
                            <Input
                                id="signatory-name"
                                value={signatoryNameDraft}
                                onChange={(e) => setSignatoryNameDraft(e.target.value)}
                                placeholder={t('placeholder_signatory_name')}
                                maxLength={255}
                                className="bg-white"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="signatory-title">{t('title_label')}</Label>
                            <Input
                                id="signatory-title"
                                value={signatoryTitleDraft}
                                onChange={(e) => setSignatoryTitleDraft(e.target.value)}
                                placeholder={t('placeholder_md_title')}
                                maxLength={255}
                                className="bg-white"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            onClick={handleSaveSignatory}
                            disabled={!signatoryDirty || updateTenant.isPending}
                            size="sm"
                        >
                            {updateTenant.isPending ? t('saving') : t('save_signatory')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <InitialBudgetsCard currency={currency} />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('company_logo')}</CardTitle>
                    <CardDescription>
                        {t('company_logo_desc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-start gap-6">
                        <div className="shrink-0">
                            {tenant.logoUrl ? (
                                <div className="relative w-48 h-24 rounded-md border border-slate-200 bg-white overflow-hidden flex items-center justify-center p-2">
                                    {/* Plain img: the logo lives on the API host (different origin)
                                        which next/image would otherwise complain about without a
                                        loader/domain whitelist. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={tenant.logoUrl}
                                        alt={`${tenant.name} logo`}
                                        className="max-h-full max-w-full object-contain"
                                    />
                                </div>
                            ) : (
                                <div className="w-48 h-24 rounded-md border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400">
                                    <Building2 className="h-6 w-6" />
                                    <span className="text-xs mt-1">{t('no_logo_yet')}</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 flex-1">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={ALLOWED_LOGO_EXT.map((e) => `.${e}`).join(',')}
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) void handleFileSelected(file);
                                    e.target.value = '';
                                }}
                            />
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={uploadLogo.isPending}
                                    onClick={() => fileInputRef.current?.click()}
                                    className="gap-2"
                                >
                                    {uploadLogo.isPending ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Upload className="h-3.5 w-3.5" />
                                    )}
                                    {tenant.logoUrl ? t('replace_logo') : t('upload_logo')}
                                </Button>
                                {tenant.logoUrl && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={deleteLogo.isPending}
                                        onClick={handleDeleteLogo}
                                        className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                        {deleteLogo.isPending ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-3.5 w-3.5" />
                                        )}
                                        {t('remove')}
                                    </Button>
                                )}
                            </div>
                            <p className="text-xs text-slate-500">
                                {t('company_logo_hint')}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

/**
 * Year-scoped target profit table. Each row is one fiscal year's
 * declared budget. Forecast (process ⑧) reads the row matching the year
 * of the displayed months and compares the 6-month projection against
 * it. Spec ①.3 — "at the start of each year, declare an Initial Budget."
 */
function InitialBudgetsCard({ currency }: { currency: Currency }) {
    const budgetsQuery = useInitialBudgets();
    const upsert = useUpsertInitialBudget();
    const del = useDeleteInitialBudget();

    const budgets = budgetsQuery.data ?? [];
    const currentYear = new Date().getFullYear();

    // Per-row draft state. Keyed by fiscal_year — strings (not numbers) so
    // the user can type freely without coercion fighting them.
    const [drafts, setDrafts] = useState<Record<number, string>>({});
    const [newYear, setNewYear] = useState<string>(String(currentYear + 1));
    const [newAmount, setNewAmount] = useState<string>('');

    const draftFor = (year: number) => {
        if (drafts[year] !== undefined) return drafts[year];
        const existing = budgets.find(b => b.fiscalYear === year);
        return existing ? String(existing.amount) : '';
    };

    const isRowDirty = (year: number) => {
        if (drafts[year] === undefined) return false;
        const existing = budgets.find(b => b.fiscalYear === year);
        const parsed = Number(drafts[year]);
        return Number.isFinite(parsed) && parsed >= 0 && parsed !== (existing?.amount ?? -1);
    };

    const handleSaveRow = async (year: number) => {
        const parsed = Number(drafts[year]);
        if (!Number.isFinite(parsed) || parsed < 0) return;
        try {
            await upsert.mutateAsync({ fiscalYear: year, amount: parsed });
            setDrafts(prev => {
                const next = { ...prev };
                delete next[year];
                return next;
            });
            toast.success(`Budget for ${year} saved.`);
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(firstFieldError(normalized) ?? normalized.message);
        }
    };

    const handleDeleteRow = async (year: number) => {
        if (!window.confirm(`Remove the ${year} budget? Forecast for ${year} will show "no budget set" afterwards.`)) {
            return;
        }
        try {
            await del.mutateAsync(year);
            toast.success(`Budget for ${year} removed.`);
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(firstFieldError(normalized) ?? normalized.message);
        }
    };

    const handleAddYear = async () => {
        const year = Number(newYear);
        const amount = Number(newAmount);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
            toast.error('Fiscal year must be a 4-digit year between 2000 and 2100.');
            return;
        }
        if (budgets.some(b => b.fiscalYear === year)) {
            toast.error(`Budget for ${year} already exists — edit the existing row.`);
            return;
        }
        if (!Number.isFinite(amount) || amount < 0) {
            toast.error('Amount must be a non-negative number.');
            return;
        }
        try {
            await upsert.mutateAsync({ fiscalYear: year, amount });
            setNewAmount('');
            toast.success(`Budget for ${year} added.`);
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(firstFieldError(normalized) ?? normalized.message);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Initial Annual Budget (per fiscal year)</CardTitle>
                <CardDescription>
                    Target profit for each fiscal year. Forecast uses the row for the year of the
                    months being displayed; years with no row show a &ldquo;no budget set&rdquo; notice.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {budgetsQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading budgets…
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="grid grid-cols-[120px_1fr_auto_auto] gap-3 px-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
                            <span>Fiscal Year</span>
                            <span>Amount ({currency})</span>
                            <span></span>
                            <span></span>
                        </div>
                        {budgets.length === 0 ? (
                            <p className="text-sm text-slate-500 py-3">
                                No budgets declared yet. Add one below.
                            </p>
                        ) : (
                            budgets.map(b => {
                                const dirty = isRowDirty(b.fiscalYear);
                                return (
                                    <div key={b.id} className="grid grid-cols-[120px_1fr_auto_auto] gap-3 items-center">
                                        <span className="text-sm font-medium text-slate-700">{b.fiscalYear}</span>
                                        <Input
                                            type="number"
                                            min={0}
                                            step="1000"
                                            value={draftFor(b.fiscalYear)}
                                            onChange={(e) => setDrafts(prev => ({ ...prev, [b.fiscalYear]: e.target.value }))}
                                            className="bg-white"
                                        />
                                        <Button
                                            size="sm"
                                            onClick={() => handleSaveRow(b.fiscalYear)}
                                            disabled={!dirty || upsert.isPending}
                                        >
                                            {upsert.isPending ? 'Saving…' : 'Save'}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDeleteRow(b.fiscalYear)}
                                            disabled={del.isPending}
                                            title={`Remove ${b.fiscalYear} budget`}
                                        >
                                            <Trash2 className="h-4 w-4 text-rose-500" />
                                        </Button>
                                    </div>
                                );
                            })
                        )}

                        <div className="grid grid-cols-[120px_1fr_auto_auto] gap-3 items-center pt-3 border-t border-slate-100">
                            <Input
                                type="number"
                                min={2000}
                                max={2100}
                                step="1"
                                value={newYear}
                                onChange={(e) => setNewYear(e.target.value)}
                                placeholder="2027"
                                className="bg-white"
                            />
                            <Input
                                type="number"
                                min={0}
                                step="1000"
                                value={newAmount}
                                onChange={(e) => setNewAmount(e.target.value)}
                                placeholder="e.g. 1500000000"
                                className="bg-white"
                            />
                            <Button
                                size="sm"
                                onClick={handleAddYear}
                                disabled={upsert.isPending || !newAmount}
                            >
                                <Plus className="mr-1 h-4 w-4" /> Add
                            </Button>
                            <span />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
