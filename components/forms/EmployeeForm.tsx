'use client';

import { useMemo, useState } from 'react';
import { useForm, useFieldArray, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { DialogClose } from '@/components/ui/dialog';
import { AlertCircle, ChevronsUpDown, Search, X } from 'lucide-react';
import { Role, Department, Skill, Rank } from '@/types/business';
import {
    employeeSchema,
    employeeCreateSchema,
    type EmployeeFormValues,
    type EmployeeCreateValues,
} from '@/lib/schemas/organization.schema';
import { useCurrencySymbol } from '@/hooks/useTenantCurrency';

const CAPACITY_ROLES = ['frontend', 'backend', 'pm', 'qa', 'design'] as const;
const PROFICIENCY_LEVELS = ['beginner', 'intermediate', 'expert'] as const;

/**
 * Loose shape callers (org page passing an `Employee`, edit dialogs passing a
 * partial form value) can satisfy. Mirrors the fields the form actually
 * reads in `defaultValues`, with each field optional and the skill
 * `proficiency` allowing the API's undefined (we coerce to 'intermediate'
 * inside the form). Avoids forcing every caller to massage an `Employee`
 * into a strict `EmployeeFormValues` first.
 */
interface EmployeeFormInitialData {
    name?: string;
    role?: string;
    departmentId?: string;
    capacityRole?: string;
    rankId?: string | null;
    monthlySalary?: number;
    workableHours?: number;
    status?: 'Active' | 'On Leave' | 'Terminated';
    skills?: { skillId: string; proficiency?: 'beginner' | 'intermediate' | 'expert' }[];
    email?: string;
    password?: string;
}

interface EmployeeFormProps {
    initialData?: EmployeeFormInitialData | null;
    roles: Role[];
    departments?: Department[];
    skills?: Skill[];
    /** Tenant ranks for the rank dropdown. Pass `[]` (or omit) to hide the dropdown. */
    ranks?: Rank[];
    onSubmit: (data: EmployeeCreateValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function EmployeeForm({ initialData, roles, departments = [], skills = [], ranks = [], onSubmit, onCancel }: EmployeeFormProps) {
    const t = useTranslations();
    const symbol = useCurrencySymbol();
    const isEdit = !!initialData;

    // On CREATE: email/password start blank so the inputs are controlled.
    // On EDIT: pre-fill email from the linked user (so the manager can change
    // it). Password starts undefined — the form treats undefined as "no change"
    // and the schema's .optional() short-circuits, so leaving it blank does
    // NOT trigger the .min(6) validator.
    const emailDefault    = isEdit ? (initialData?.email ?? '') : '';
    const passwordDefault = isEdit ? undefined : '';

    const form = useForm<EmployeeCreateValues>({
        resolver: zodResolver(isEdit ? employeeSchema : employeeCreateSchema) as any,
        mode: 'onBlur',
        reValidateMode: 'onChange',
        // Defensive: API may return `null` for any optional field. Coerce to
        // empty string / undefined so Zod's `.optional()` accepts it on submit.
        defaultValues: {
            name:          initialData?.name ?? '',
            role:          initialData?.role ?? '',
            departmentId:  initialData?.departmentId ?? '',
            capacityRole:  initialData?.capacityRole ?? '',
            rankId:        initialData?.rankId ?? '',
            monthlySalary: initialData?.monthlySalary ?? 0,
            workableHours: initialData?.workableHours ?? 160,
            status:        initialData?.status ?? 'Active',
            skills:        (initialData?.skills ?? []).map(s => ({
                skillId:     s.skillId,
                proficiency: s.proficiency ?? 'intermediate',
            })),
            email:         emailDefault,
            password:      passwordDefault,
        } as EmployeeCreateValues,
    });

    const skillsField = useFieldArray<EmployeeCreateValues, 'skills'>({
        control: form.control,
        name: 'skills',
    });
    const selectedSkills = form.watch('skills') ?? [];
    const selectedIds = useMemo(
        () => new Set(selectedSkills.map(s => s.skillId)),
        [selectedSkills],
    );
    const skillById = useMemo(() => {
        const map = new Map<string, Skill>();
        for (const s of skills) map.set(s.id, s);
        return map;
    }, [skills]);

    const [skillPickerOpen, setSkillPickerOpen] = useState(false);
    const [skillSearch, setSkillSearch] = useState('');

    const filteredSkills = useMemo(() => {
        const needle = skillSearch.trim().toLowerCase();
        return skills.filter(s => {
            if (selectedIds.has(s.id)) return false;
            if (!needle) return true;
            return (
                s.name.toLowerCase().includes(needle) ||
                s.category.toLowerCase().includes(needle)
            );
        });
    }, [skills, selectedIds, skillSearch]);

    const handleSubmit = async (data: EmployeeCreateValues) => {
        await onSubmit(data);
    };

    function onFormError(errors: FieldErrors<EmployeeCreateValues>) {
        const firstKey = Object.keys(errors)[0] as keyof EmployeeFormValues | undefined;
        if (!firstKey) return;
        const el = document.querySelector(`[name="${firstKey}"]`) as HTMLElement | null
                ?? document.getElementById(firstKey);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus?.();
    }

    const errorCount = Object.keys(form.formState.errors).length;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit, onFormError)} className="space-y-4">
                {form.formState.isSubmitted && errorCount > 0 && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            {errorCount === 1
                                ? t('please_fix_highlighted')
                                : t('please_fill_required_fields', { count: errorCount })}
                        </span>
                    </div>
                )}
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('full_name')} <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder={t('placeholder_jane_smith')} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="departmentId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('department_label')} <span className="text-[#4a4a4a] text-xs font-normal">{t('optional_lowercase')}</span></FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('select_department')} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">{t('none')}</SelectItem>
                                        {departments.map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('billing_role')} <span className="text-destructive">*</span></FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('select_a_role')} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {roles.map(r => (
                                            <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="capacityRole"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('capacity_pool')} <span className="text-[#4a4a4a] text-xs font-normal">{t('optional_lowercase')}</span></FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('none')} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">{t('none')}</SelectItem>
                                        {CAPACITY_ROLES.map(r => (
                                            <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <FormField
                    control={form.control}
                    name="rankId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('rank_label_form')} <span className="text-[#4a4a4a] text-xs font-normal">{t('rank_optional_ai_hint')}</span></FormLabel>
                            {/* "none" sentinel — Select can't represent undefined; the
                                store mutation maps 'none' → null before persisting. */}
                            <Select
                                onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                                value={field.value && field.value !== '' ? field.value : 'none'}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('unranked')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="none">{t('unranked')}</SelectItem>
                                    {ranks
                                        .slice()
                                        .sort((a, b) => a.level - b.level)
                                        .map(r => (
                                            <SelectItem key={r.id} value={r.id}>
                                                {r.name} <span className="text-muted-foreground ml-1 text-xs">{t('rank_level_hint', { level: r.level })}</span>
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="monthlySalary"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('monthly_salary_with_symbol', { symbol })} <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder={t('placeholder_3500')} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="workableHours"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('workable_hours_mo')} <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="160" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('status_label')} <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('select_status')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="Active">{t('status_active')}</SelectItem>
                                    <SelectItem value="On Leave">{t('status_on_leave')}</SelectItem>
                                    <SelectItem value="Terminated">{t('status_terminated')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Skills picker — feeds the AI Team Builder so Claude can match
                    project requirements against the available pool. Empty list
                    is allowed; AI will treat the employee as generalist. */}
                <FormField
                    control={form.control}
                    name="skills"
                    render={() => (
                        <FormItem>
                            <FormLabel>
                                {t('skills')} <span className="text-[#4a4a4a] text-xs font-normal">{t('skills_ai_hint')}</span>
                            </FormLabel>
                            <Popover open={skillPickerOpen} onOpenChange={setSkillPickerOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-between font-normal"
                                    >
                                        <span className="text-[#4a4a4a]">
                                            {selectedSkills.length === 0
                                                ? t('search_and_add_skills')
                                                : t('n_skills_selected', { count: selectedSkills.length })}
                                        </span>
                                        <ChevronsUpDown className="h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <div className="border-b p-2">
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8a8a]" />
                                            <Input
                                                value={skillSearch}
                                                onChange={(e) => setSkillSearch(e.target.value)}
                                                placeholder={t('search_by_name_or_category')}
                                                className="h-8 pl-8"
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto p-1">
                                        {skills.length === 0 ? (
                                            <p className="px-2 py-3 text-center text-xs text-[#8a8a8a]">
                                                {t('no_skills_exist')}
                                            </p>
                                        ) : filteredSkills.length === 0 ? (
                                            <p className="px-2 py-3 text-center text-xs text-[#8a8a8a]">
                                                {selectedIds.size === skills.length
                                                    ? t('all_skills_added')
                                                    : t('no_matching_skills')}
                                            </p>
                                        ) : (
                                            filteredSkills.map((skill) => (
                                                <button
                                                    key={skill.id}
                                                    type="button"
                                                    onClick={() => {
                                                        skillsField.append({
                                                            skillId:     skill.id,
                                                            proficiency: 'intermediate',
                                                        });
                                                        setSkillSearch('');
                                                    }}
                                                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                                                >
                                                    <span>{skill.name}</span>
                                                    <span className="text-xs text-[#8a8a8a]">{skill.category}</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>

                            {selectedSkills.length > 0 && (
                                <div className="mt-2 space-y-2">
                                    {skillsField.fields.map((row, index) => {
                                        const skill = skillById.get(row.skillId);
                                        return (
                                            <div
                                                key={row.id}
                                                className="flex items-center gap-2 rounded-md border border-[#e6e9ee] bg-white px-2 py-1.5"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-[#171717] truncate">
                                                        {skill?.name ?? t('unknown_skill')}
                                                    </p>
                                                    {skill?.category && (
                                                        <p className="text-xs text-[#8a8a8a] truncate">{skill.category}</p>
                                                    )}
                                                </div>
                                                <FormField
                                                    control={form.control}
                                                    name={`skills.${index}.proficiency` as const}
                                                    render={({ field }) => (
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-8 w-36">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {PROFICIENCY_LEVELS.map(p => (
                                                                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 text-[#8a8a8a] hover:text-destructive"
                                                    onClick={() => skillsField.remove(index)}
                                                >
                                                    <X className="h-4 w-4" />
                                                    <span className="sr-only">{t('remove_short')}</span>
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="rounded-md border border-[#e6e9ee] bg-white p-3 space-y-3">
                    <p className="text-xs font-medium text-slate-700">
                        {t('login_credentials')}
                    </p>
                    <p className="-mt-2 text-xs text-[#8a8a8a]">
                        {!isEdit
                            ? t('login_credentials_create_hint')
                            : initialData?.email
                                ? t('login_credentials_edit_hint')
                                : t('login_credentials_no_login_hint')}
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {t('email')} {!isEdit && <span className="text-destructive">*</span>}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="email"
                                            placeholder={t('placeholder_email_company')}
                                            {...field}
                                            value={field.value ?? ''}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {isEdit ? t('new_password_label') : (
                                            <>{t('password')} <span className="text-destructive">*</span></>
                                        )}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            placeholder={isEdit ? t('leave_blank_to_keep_current') : t('at_least_6_characters')}
                                            {...field}
                                            value={field.value ?? ''}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>
                <p className="text-xs text-[#4a4a4a]">
                    {t('fields_required_full')}
                </p>
                <div className="flex justify-end gap-2 pt-2">
                    {onCancel ? (
                        <Button type="button" variant="outline" onClick={onCancel}>
                            {t('cancel')}
                        </Button>
                    ) : (
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                {t('cancel')}
                            </Button>
                        </DialogClose>
                    )}
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? t('saving') : t('save_employee')}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
