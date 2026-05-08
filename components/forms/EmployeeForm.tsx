'use client';

import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { DialogClose } from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';
import { Role, Department } from '@/types/business';
import {
    employeeSchema,
    employeeCreateSchema,
    type EmployeeFormValues,
    type EmployeeCreateValues,
} from '@/lib/schemas/organization.schema';

const CAPACITY_ROLES = ['frontend', 'backend', 'pm', 'qa', 'design'] as const;

interface EmployeeFormProps {
    initialData?: EmployeeFormValues | null;
    roles: Role[];
    departments?: Department[];
    onSubmit: (data: EmployeeCreateValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function EmployeeForm({ initialData, roles, departments = [], onSubmit, onCancel }: EmployeeFormProps) {
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
            monthlySalary: initialData?.monthlySalary ?? 0,
            workableHours: initialData?.workableHours ?? 160,
            status:        initialData?.status ?? 'Active',
            email:         emailDefault,
            password:      passwordDefault,
        } as EmployeeCreateValues,
    });

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
                                ? 'Please fix the highlighted field before saving.'
                                : `Please fill in ${errorCount} required fields before saving.`}
                        </span>
                    </div>
                )}
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Full Name <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder="e.g. Jane Smith" {...field} />
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
                                <FormLabel>Department <span className="text-[#4a4a4a] text-xs font-normal">(optional)</span></FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select department" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
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
                                <FormLabel>Billing Role <span className="text-destructive">*</span></FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a role" />
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
                                <FormLabel>Capacity Pool <span className="text-[#4a4a4a] text-xs font-normal">(optional)</span></FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="None" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
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
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="monthlySalary"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Monthly Salary ($) <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="e.g. 3500" {...field} />
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
                                <FormLabel>Workable Hours/Mo <span className="text-destructive">*</span></FormLabel>
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
                            <FormLabel>Status <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="Active">Active</SelectItem>
                                    <SelectItem value="On Leave">On Leave</SelectItem>
                                    <SelectItem value="Terminated">Terminated</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="rounded-md border border-[#e6e9ee] bg-white p-3 space-y-3">
                    <p className="text-xs font-medium text-slate-700">
                        Login Credentials
                    </p>
                    <p className="-mt-2 text-xs text-[#8a8a8a]">
                        {!isEdit
                            ? 'The employee will use these to sign in and view their assigned tasks.'
                            : initialData?.email
                                ? 'Update the employee’s sign-in details. Leave the password blank to keep the current one.'
                                : 'This employee has no login yet. Set both an email and a password to create one.'}
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Email {!isEdit && <span className="text-destructive">*</span>}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="email"
                                            placeholder="jane@company.com"
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
                                        {isEdit ? 'New Password' : (
                                            <>Password <span className="text-destructive">*</span></>
                                        )}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            placeholder={isEdit ? 'Leave blank to keep current' : 'At least 6 characters'}
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
                    Fields marked <span className="text-destructive">*</span> are required. Everything else can be filled in later.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                    {onCancel ? (
                        <Button type="button" variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                    ) : (
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Cancel
                            </Button>
                        </DialogClose>
                    )}
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? "Saving..." : "Save Employee"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
