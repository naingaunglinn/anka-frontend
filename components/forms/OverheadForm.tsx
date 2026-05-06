'use client';

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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { DialogClose } from '@/components/ui/dialog';
import { globalOverheadSchema, type OverheadFormValues } from '@/lib/schemas/organization.schema';

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
    const form = useForm<OverheadFormValues>({
        resolver: zodResolver(globalOverheadSchema) as any,
        defaultValues: initialData || {
            category:       '',
            description:    '',
            monthlyCost:    0,
            effectiveMonth: undefined,
            effectiveYear:  undefined,
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

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="effectiveMonth"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Month <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
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
                                <FormLabel>Year <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
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
