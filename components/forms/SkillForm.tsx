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
import { skillSchema, type SkillFormValues } from '@/lib/schemas/organization.schema';
import type { Skill } from '@/types/business';

const SKILL_CATEGORIES = [
    'Technical',
    'Creative',
    'Management',
    'Financial',
    'Legal',
    'Operations',
];

interface SkillFormProps {
    initialData?: Skill | null;
    onSubmit: (data: SkillFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function SkillForm({ initialData, onSubmit, onCancel }: SkillFormProps) {
    const form = useForm<SkillFormValues>({
        resolver: zodResolver(skillSchema),
        mode: 'onBlur',
        defaultValues: {
            name: initialData?.name ?? '',
            category: initialData?.category ?? '',
        },
    });

    async function handleSubmit(data: SkillFormValues) {
        await onSubmit(data);
    }

    function onFormError(errors: FieldErrors<SkillFormValues>) {
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
                            <FormLabel>Skill Name <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder="e.g. React, Financial Modeling, Legal Review" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Category <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a category" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {SKILL_CATEGORIES.map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
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
                        {form.formState.isSubmitting ? 'Saving...' : 'Save Skill'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}