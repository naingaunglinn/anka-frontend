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
import { globalOverheadSchema, type OverheadFormValues } from '@/lib/schemas/organization.schema';
import { useCurrencySymbol } from '@/hooks/useTenantCurrency';

const MONTHS = [
    { value: 1,  label: 'January'   },
    { value: 2,  label: 'February'  },
    { value: 3,  label: 'March'     },
    { value: 4,  label: 'April'     },
    { value: 5,  label: 'May'       },
    { value: 6,  label: 'June'      },
    { value: 7,  label: 'July'      },
    { value: 8,  label: 'August'    },
    { value: 9,  label: 'September' },
    { value: 10, label: 'October'   },
    { value: 11, label: 'November'  },
    { value: 12, label: 'December'  },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

interface OverheadFormProps {
    initialData?: OverheadFormValues | null;
    onSubmit: (data: OverheadFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function OverheadForm({ initialData, onSubmit, onCancel }: OverheadFormProps) {
    const symbol = useCurrencySymbol();
    const form = useForm<OverheadFormValues>({
        resolver: zodResolver(globalOverheadSchema) as any,
        mode: 'onBlur',
        reValidateMode: 'onChange',
        // Explicitly coerce optional fields away from `null` (API may return
        // null for unset months/years — Zod's `.optional()` only accepts undefined).
        defaultValues: {
            category:       initialData?.category ?? '',
            description:    initialData?.description ?? '',
            monthlyCost:    initialData?.monthlyCost ?? 0,
            effectiveMonth: initialData?.effectiveMonth ?? undefined,
            effectiveYear:  initialData?.effectiveYear ?? undefined,
        },
    });

    const handleSubmit = async (data: OverheadFormValues) => {
        await onSubmit(data);
    };

    function onFormError(errors: FieldErrors<OverheadFormValues>) {
        const firstKey = Object.keys(errors)[0] as keyof OverheadFormValues | undefined;
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
                    name="category"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Category Name <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder="Software Licenses" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder="AWS, GitHub, Slack" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="monthlyCost"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Monthly Cost ({symbol}) <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input type="number" placeholder="e.g. 500" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="effectiveMonth"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Month <span className="text-[#4a4a4a] font-normal">(optional)</span></FormLabel>
                                <Select
                                    onValueChange={(v) => field.onChange(v === 'none' ? undefined : Number(v))}
                                    defaultValue={field.value !== undefined ? String(field.value) : 'none'}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="All months" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">All months</SelectItem>
                                        {MONTHS.map(m => (
                                            <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="effectiveYear"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Year <span className="text-[#4a4a4a] font-normal">(optional)</span></FormLabel>
                                <Select
                                    onValueChange={(v) => field.onChange(v === 'none' ? undefined : Number(v))}
                                    defaultValue={field.value !== undefined ? String(field.value) : 'none'}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="All years" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">All years</SelectItem>
                                        {YEARS.map(y => (
                                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
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
                        {form.formState.isSubmitting ? "Saving..." : "Save Overhead"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
