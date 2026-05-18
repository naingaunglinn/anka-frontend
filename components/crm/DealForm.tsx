'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Deal } from '@/types/business';
import { useCurrencySymbol } from '@/hooks/useTenantCurrency';

type DealFormErrors = { name?: string; winProbability?: string };

interface DealFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (deal: Omit<Deal, 'id'> | Deal) => void;
    initialData?: Deal | null;
}

export function DealForm({ isOpen, onClose, onSave, initialData }: DealFormProps) {
    const t = useTranslations();
    const [name, setName] = useState('');
    const [client, setClient] = useState('');
    const [estimatedValue, setEstimatedValue] = useState<number | ''>('');
    const [winProbability, setWinProbability] = useState<number | ''>('');
    const [status, setStatus] = useState<Deal['status']>('lead');
    const [errors, setErrors] = useState<DealFormErrors>({});
    const symbol = useCurrencySymbol();

    useEffect(() => {
        if (initialData && isOpen) {
            setName(initialData.name);
            setClient(initialData.client || '');
            setEstimatedValue(initialData.estimatedValue || 0);
            setWinProbability(initialData.winProbability || 0);
            setStatus(initialData.status || 'lead');
        } else if (isOpen) {
            setName('');
            setClient('');
            setEstimatedValue('');
            setWinProbability(20);
            setStatus('lead');
        }
        setErrors({});
    }, [initialData, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const errs: DealFormErrors = {};
        if (!name.trim()) errs.name = t('please_enter_deal_name');
        const prob = Number(winProbability);
        if (winProbability === '' || prob < 0 || prob > 100) errs.winProbability = t('win_prob_range_invalid');
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

        const dealData = {
            name,
            client,
            estimatedValue: Number(estimatedValue) || 0,
            winProbability: prob,
            status,
            estimationResources: initialData?.estimationResources || [],
            projectOverheads: initialData?.projectOverheads || [],
            targetMargin: initialData?.targetMargin || 30,
        };

        if (initialData) {
            onSave({ ...dealData, id: initialData.id });
        } else {
            onSave(dealData);
        }
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{initialData ? t('edit_deal_button') : t('add_new_deal')}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <p className="text-xs text-[#4a4a4a] col-span-4">
                            {t('fields_required_explainer')} <span className="text-destructive">*</span> {t('are_required_short')}
                        </p>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label htmlFor="name" className="text-right pt-2">
                                {t('name')} <span className="text-destructive">*</span>
                            </Label>
                            <div className="col-span-3 space-y-1">
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={e => { setName(e.target.value); if (errors.name) setErrors(p => ({ ...p, name: undefined })); }}
                                    onBlur={() => { if (!name.trim()) setErrors(p => ({ ...p, name: t('please_enter_deal_name') })); }}
                                    aria-invalid={!!errors.name}
                                    placeholder={t('placeholder_acme_app')}
                                />
                                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="client" className="text-right">
                                {t('client')} <span className="text-[#4a4a4a] text-xs font-normal">{t('opt_short')}</span>
                            </Label>
                            <Input id="client" value={client} onChange={e => setClient(e.target.value)} className="col-span-3" placeholder={t('placeholder_acme_client')} />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="value" className="text-right">{t('value_with_symbol', { symbol })}</Label>
                            <Input
                                id="value"
                                type="number"
                                value={estimatedValue}
                                onChange={e => setEstimatedValue(e.target.value ? Number(e.target.value) : '')}
                                className="col-span-3"
                                min="0"
                                placeholder="0"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label htmlFor="probability" className="text-right pt-2">
                                {t('win_pct')} <span className="text-destructive">*</span>
                            </Label>
                            <div className="col-span-3 space-y-1">
                                <Input
                                    id="probability"
                                    type="number"
                                    value={winProbability}
                                    onChange={e => { setWinProbability(e.target.value ? Number(e.target.value) : ''); if (errors.winProbability) setErrors(p => ({ ...p, winProbability: undefined })); }}
                                    min="0"
                                    max="100"
                                    aria-invalid={!!errors.winProbability}
                                />
                                {errors.winProbability && <p className="text-xs text-destructive">{errors.winProbability}</p>}
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="stage" className="text-right">{t('stage')}</Label>
                            <div className="col-span-3">
                                <Select value={status} onValueChange={val => setStatus(val as Deal['status'])}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('select_stage')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="lead">{t('stage_lead')}</SelectItem>
                                        <SelectItem value="qualified">{t('stage_qualified')}</SelectItem>
                                        <SelectItem value="negotiation">{t('stage_negotiation')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
                        <Button type="submit">{t('save_changes')}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
