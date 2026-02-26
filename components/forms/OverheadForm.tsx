'use client';

import * as z from 'zod';
import { useForm } from 'react-hook-form';
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

const overheadSchema = z.object({
    category: z.string().min(2, "Category must be at least 2 characters."),
    description: z.string().min(2, "Description must be at least 2 characters."),
    monthlyCost: z.coerce.number().min(0, "Monthly cost must be positive."),
});

export type OverheadFormValues = z.infer<typeof overheadSchema>;

interface OverheadFormProps {
    initialData?: OverheadFormValues | null;
    onSubmit: (data: OverheadFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function OverheadForm({ initialData, onSubmit, onCancel }: OverheadFormProps) {
    const form = useForm<OverheadFormValues>({
        resolver: zodResolver(overheadSchema) as any,
        defaultValues: initialData || {
            category: '',
            description: '',
            monthlyCost: 0,
        },
    });

    const handleSubmit = async (data: OverheadFormValues) => {
        await onSubmit(data);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Category Name</FormLabel>
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
                            <FormLabel>Description</FormLabel>
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
                            <FormLabel>Monthly Cost ($)</FormLabel>
                            <FormControl>
                                <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex justify-end gap-2 pt-4">
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
