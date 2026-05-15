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
import { DialogClose } from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';
import { rankSchema, type RankFormValues } from '@/lib/schemas/organization.schema';
import type { Rank } from '@/types/business';

interface RankFormProps {
    initialData?: Rank | null;
    onSubmit: (data: RankFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function RankForm({ initialData, onSubmit, onCancel }: RankFormProps) {
    const form = useForm<RankFormValues>({
        // Cast required for react-hook-form v5 + zod's generic inference —
        // same workaround the EmployeeForm uses. Without it TS complains
        // about TFieldValues vs the explicit RankFormValues shape.
        resolver: zodResolver(rankSchema) as any,
        mode: 'onBlur',
        defaultValues: {
            name: initialData?.name ?? '',
            code: initialData?.code ?? '',
            level: initialData?.level ?? 20,
        },
    });

    async function handleSubmit(data: RankFormValues) {
        await onSubmit(data);
    }

    function onFormError(errors: FieldErrors<RankFormValues>) {
        const firstKey = Object.keys(errors)[0];
        const el = document.querySelector(`[name="${firstKey}"]`) as HTMLElement | null;
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
                        <span>Please fix the highlighted fields before saving.</span>
                    </div>
                )}
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Rank Name <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder="e.g. Senior, Principal, Staff Engineer" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Code <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder="e.g. Senior, Principal" {...field} />
                            </FormControl>
                            <FormMessage />
                            <p className="text-xs text-muted-foreground mt-1">
                                Short identifier. Letters, numbers, underscore, hyphen only.
                            </p>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="level"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Seniority Level <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input type="number" min={0} max={100} step={1} {...field} />
                            </FormControl>
                            <FormMessage />
                            <p className="text-xs text-muted-foreground mt-1">
                                Higher = more senior. Defaults: Junior 10, Mid 20, Senior 30, Lead 40.
                                Use gaps (e.g. 35 for Principal) so future ranks can fit between.
                            </p>
                        </FormItem>
                    )}
                />
                <div className="flex justify-end gap-2 pt-2">
                    {onCancel ? (
                        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                    ) : (
                        <DialogClose asChild>
                            <Button type="button" variant="outline">Cancel</Button>
                        </DialogClose>
                    )}
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? 'Saving...' : 'Save Rank'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
