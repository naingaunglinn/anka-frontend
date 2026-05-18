'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useDealMutations } from '@/lib/queries/deals';
import { useBusinessStore } from '@/store/businessStore';
import { useTenantCurrency } from '@/hooks/useTenantCurrency';
import type { Deal, GhostRole, EstimationResource } from '@/types/business';
import { normalizeError } from '@/lib/errorHandler';
import toast from 'react-hot-toast';

const ROLE_TYPE_LABELS: Record<GhostRole['roleType'], string> = {
    frontend: 'Frontend Engineer',
    backend: 'Backend Engineer',
    pm: 'Project Manager',
    qa: 'QA Engineer',
    design: 'Designer',
};

const TEMPLATE_OPTIONS: Array<{ value: 'cloud_backup' | 'managed_hosting' | 'engineer_dispatch'; label: string }> = [
    { value: 'cloud_backup', label: 'Cloud Backup' },
    { value: 'managed_hosting', label: 'Managed Hosting' },
    { value: 'engineer_dispatch', label: 'Engineer Dispatch' },
];

function buildTeamSummary(
    ghostRoles: GhostRole[] | undefined,
    resources: EstimationResource[],
    rolesById: Map<string, string>,
): string {
    if (ghostRoles && ghostRoles.length > 0) {
        return ghostRoles
            .map((r) => `${r.quantity}× ${ROLE_TYPE_LABELS[r.roleType] ?? r.roleType} (${r.months}mo)`)
            .join(', ');
    }
    if (resources.length === 0) return '';
    const hoursByRole = new Map<string, number>();
    for (const res of resources) {
        hoursByRole.set(res.roleId, (hoursByRole.get(res.roleId) ?? 0) + res.hours);
    }
    return [...hoursByRole.entries()]
        .map(([roleId, hrs]) => `${rolesById.get(roleId) ?? 'Role'}: ${Math.round(hrs)}h`)
        .join(', ');
}

interface ContractReadyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    deal: Deal;
    suggestedPrice: number;
    resources: EstimationResource[];
}

export function ContractReadyDialog({
    open,
    onOpenChange,
    deal,
    suggestedPrice,
    resources,
}: ContractReadyDialogProps) {
    const t = useTranslations();
    const { updateDeal } = useDealMutations();
    const tenantCurrency = useTenantCurrency();
    const roles = useBusinessStore((s) => s.roles);
    const rolesById = useMemo(
        () => new Map(roles.map((r) => [r.id, r.title])),
        [roles],
    );

    const defaultMonths = deal.timelineMonths && deal.timelineMonths > 0 ? deal.timelineMonths : 1;
    const defaultMonthlyFee = suggestedPrice > 0 ? Math.round(suggestedPrice / defaultMonths) : 0;
    const defaultTeamSummary = useMemo(
        () => buildTeamSummary(deal.ghostRoles, resources, rolesById),
        [deal.ghostRoles, resources, rolesById],
    );

    const [monthlyFee, setMonthlyFee] = useState<string>('');
    const [contractMonths, setContractMonths] = useState<string>('');
    const [teamSummary, setTeamSummary] = useState<string>('');
    const [currency, setCurrency] = useState<string>('');
    const [installationFee, setInstallationFee] = useState<string>('');
    const [supportHours, setSupportHours] = useState<string>('');
    const [otPolicy, setOtPolicy] = useState<string>('');
    const [templateVariant, setTemplateVariant] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!open) return;
        setMonthlyFee(defaultMonthlyFee > 0 ? String(defaultMonthlyFee) : '');
        setContractMonths(String(defaultMonths));
        setTeamSummary(defaultTeamSummary);
        setCurrency(tenantCurrency);
        setInstallationFee('');
        setSupportHours('12');
        setOtPolicy(deal.otNotes ?? '');
        setTemplateVariant('');
        setFieldErrors({});
    }, [open, defaultMonthlyFee, defaultMonths, defaultTeamSummary, tenantCurrency, deal.otNotes]);

    const validate = (): Record<string, string> => {
        const errs: Record<string, string> = {};
        const fee = Number(monthlyFee);
        if (!monthlyFee || !Number.isFinite(fee) || fee <= 0) {
            errs.monthlyFee = 'Required — agreed monthly fee must be greater than zero';
        }
        const months = Number(contractMonths);
        if (!contractMonths || !Number.isInteger(months) || months < 1) {
            errs.contractMonths = 'Required — whole number of months, minimum 1';
        }
        if (!teamSummary.trim()) {
            errs.teamSummary = 'Required — describe who will deliver this';
        }
        const cur = currency.trim().toUpperCase();
        if (cur.length !== 3) {
            errs.currency = 'Required — 3-letter code (e.g. USD, JPY, MMK)';
        }
        if (installationFee !== '') {
            const ins = Number(installationFee);
            if (!Number.isFinite(ins) || ins < 0) {
                errs.installationFee = 'Must be a non-negative number, or leave blank';
            }
        }
        if (supportHours !== '') {
            const sh = Number(supportHours);
            if (!Number.isInteger(sh) || sh < 0 || sh > 744) {
                errs.supportHours = 'Whole number between 0 and 744 (hours per month)';
            }
        }
        return errs;
    };

    const handleSubmit = async () => {
        const errs = validate();
        setFieldErrors(errs);
        if (Object.keys(errs).length > 0) return;

        setSubmitting(true);
        try {
            await updateDeal.mutateAsync({
                id: deal.id,
                updates: {
                    finalMonthlyFee: Number(monthlyFee),
                    finalContractMonths: Number(contractMonths),
                    finalTeamSummary: teamSummary.trim(),
                    finalCurrency: currency.trim().toUpperCase(),
                    finalInstallationFee: installationFee === '' ? null : Number(installationFee),
                    finalSupportHoursPerMonth: supportHours === '' ? null : Number(supportHours),
                    finalOtPolicy: otPolicy.trim() === '' ? null : otPolicy.trim(),
                    suggestedTemplateVariant:
                        (templateVariant as 'cloud_backup' | 'managed_hosting' | 'engineer_dispatch') || null,
                    finalConfirmedAt: new Date().toISOString(),
                },
            });
            toast.success('Contract terms locked — deal advanced to Rank A.');
            onOpenChange(false);
        } catch (err) {
            const normalized = normalizeError(err);
            if (normalized.fields) {
                const mapped: Record<string, string> = {};
                const keyMap: Record<string, string> = {
                    final_monthly_fee: 'monthlyFee',
                    final_contract_months: 'contractMonths',
                    final_team_summary: 'teamSummary',
                    final_currency: 'currency',
                    final_installation_fee: 'installationFee',
                    final_support_hours_per_month: 'supportHours',
                    final_ot_policy: 'otPolicy',
                    suggested_template_variant: 'templateVariant',
                };
                for (const [k, msgs] of Object.entries(normalized.fields)) {
                    const uiKey = keyMap[k] ?? k;
                    mapped[uiKey] = Array.isArray(msgs) ? msgs[0] : String(msgs);
                }
                setFieldErrors(mapped);
            }
            toast.error(normalized.message || 'Could not lock contract terms — please review the fields.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('mark_contract_ready_title')}</DialogTitle>
                    <DialogDescription>
                        {t('contract_ready_desc')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="rounded-md bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600">
                        {t('prefilled_estimate_note')}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="cr-monthly-fee" className="text-xs">
                                {t('monthly_fee')} <span className="text-rose-500">*</span>
                            </Label>
                            <Input
                                id="cr-monthly-fee"
                                type="number"
                                min={0}
                                step="any"
                                value={monthlyFee}
                                onChange={(e) => setMonthlyFee(e.target.value)}
                                placeholder="e.g. 500000"
                            />
                            {fieldErrors.monthlyFee && (
                                <p className="text-[11px] text-rose-600">{fieldErrors.monthlyFee}</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cr-contract-months" className="text-xs">
                                {t('contract_months_label')} <span className="text-rose-500">*</span>
                            </Label>
                            <Input
                                id="cr-contract-months"
                                type="number"
                                min={1}
                                step={1}
                                value={contractMonths}
                                onChange={(e) => setContractMonths(e.target.value)}
                            />
                            {fieldErrors.contractMonths && (
                                <p className="text-[11px] text-rose-600">{fieldErrors.contractMonths}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="cr-currency" className="text-xs">
                                {t('currency_label')} <span className="text-rose-500">*</span>
                            </Label>
                            <Input
                                id="cr-currency"
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                                placeholder="USD"
                                maxLength={3}
                            />
                            {fieldErrors.currency && (
                                <p className="text-[11px] text-rose-600">{fieldErrors.currency}</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cr-installation-fee" className="text-xs">
                                {t('installation_fee')} <span className="text-slate-400">{t('optional_lowercase')}</span>
                            </Label>
                            <Input
                                id="cr-installation-fee"
                                type="number"
                                min={0}
                                step="any"
                                value={installationFee}
                                onChange={(e) => setInstallationFee(e.target.value)}
                                placeholder="One-time setup fee"
                            />
                            {fieldErrors.installationFee && (
                                <p className="text-[11px] text-rose-600">{fieldErrors.installationFee}</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="cr-team-summary" className="text-xs">
                            {t('team_summary')} <span className="text-rose-500">*</span>
                        </Label>
                        <Textarea
                            id="cr-team-summary"
                            value={teamSummary}
                            onChange={(e) => setTeamSummary(e.target.value)}
                            rows={2}
                            placeholder={t('team_summary_placeholder')}
                        />
                        {fieldErrors.teamSummary && (
                            <p className="text-[11px] text-rose-600">{fieldErrors.teamSummary}</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="cr-support-hours" className="text-xs">
                                {t('support_hours_per_month')} <span className="text-slate-400">{t('optional_lowercase')}</span>
                            </Label>
                            <Input
                                id="cr-support-hours"
                                type="number"
                                min={0}
                                max={744}
                                step={1}
                                value={supportHours}
                                onChange={(e) => setSupportHours(e.target.value)}
                                placeholder="12"
                            />
                            {fieldErrors.supportHours && (
                                <p className="text-[11px] text-rose-600">{fieldErrors.supportHours}</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cr-template" className="text-xs">
                                {t('contract_template_hint')} <span className="text-slate-400">{t('optional_lowercase')}</span>
                            </Label>
                            <Select value={templateVariant} onValueChange={setTemplateVariant}>
                                <SelectTrigger id="cr-template">
                                    <SelectValue placeholder={t('let_wizard_decide')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {TEMPLATE_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {t(`template_${opt.value}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="cr-ot-policy" className="text-xs">
                            {t('ot_policy_notes')} <span className="text-slate-400">{t('optional_lowercase')}</span>
                        </Label>
                        <Textarea
                            id="cr-ot-policy"
                            value={otPolicy}
                            onChange={(e) => setOtPolicy(e.target.value)}
                            rows={2}
                            placeholder={t('ot_policy_placeholder')}
                        />
                        {fieldErrors.otPolicy && (
                            <p className="text-[11px] text-rose-600">{fieldErrors.otPolicy}</p>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        {submitting ? t('confirming_ellipsis') : t('confirm_lock_terms')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
