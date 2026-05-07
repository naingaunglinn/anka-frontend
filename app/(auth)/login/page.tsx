'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, ChartNoAxesCombined, LogIn, Sparkles, Target } from 'lucide-react';

const formSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof formSchema>;

export default function LoginPage() {
    const router = useRouter();
    const login = useAuthStore((state) => state.login);
    const [loading, setLoading] = useState(false);

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    });

    const onSubmit = async (values: LoginFormValues) => {
        setLoading(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const mockUser = {
                id: 'user_1',
                name: 'Jane Doe',
                email: values.email,
                role: values.email.includes('admin') ? 'Admin' : 'Executive',
            };

            const mockToken = 'mock_jwt_token_123456';

            document.cookie = `auth_token=${mockToken}; path=/; max-age=86400; SameSite=Lax`;

            login(mockUser, mockToken);
            router.push('/dashboard');
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#f8fafc] text-[#171717]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(0,166,244,0.2),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(2,132,199,0.18),transparent_34%)]" />

            <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-10 md:px-10 lg:grid-cols-2">
                <section className="order-2 lg:order-1">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#00a6f4]/30 bg-white px-4 py-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#00a6f4]" />
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00a6f4]">ANKA</span>
                    </div>

                    <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">
                        Gross Profit Suggestion System
                        <span className="block text-[#00a6f4]">Built For Smarter Project Decisions</span>
                    </h1>

                    <p className="mt-5 max-w-xl text-base leading-7 text-[#171717]/75">
                        Forecast margin outcomes early, compare scenarios quickly, and get clear next-best actions before
                        project kickoff.
                    </p>

                    <div className="mt-8 grid gap-3 sm:max-w-xl sm:grid-cols-3">
                        <div className="rounded-xl border border-[#00a6f4]/20 bg-white/85 p-3">
                            <ChartNoAxesCombined className="mb-2 h-4 w-4 text-[#00a6f4]" />
                            <p className="text-xs font-semibold text-[#171717]/85">Margin Forecasting</p>
                        </div>
                        <div className="rounded-xl border border-[#00a6f4]/20 bg-white/85 p-3">
                            <Target className="mb-2 h-4 w-4 text-[#00a6f4]" />
                            <p className="text-xs font-semibold text-[#171717]/85">Scenario Precision</p>
                        </div>
                        <div className="rounded-xl border border-[#00a6f4]/20 bg-white/85 p-3">
                            <Sparkles className="mb-2 h-4 w-4 text-[#00a6f4]" />
                            <p className="text-xs font-semibold text-[#171717]/85">Actionable Suggestions</p>
                        </div>
                    </div>
                </section>

                <section className="order-1 lg:order-2">
                    <Card className="mx-auto w-full max-w-md border-[#00a6f4]/20 bg-white/90 shadow-[0_24px_55px_rgba(0,0,0,0.12)] backdrop-blur">
                        <CardHeader className="space-y-2 pb-6">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#00a6f4] text-white shadow-lg">
                                <LogIn className="h-6 w-6" />
                            </div>
                            <CardTitle className="text-2xl font-bold tracking-tight">Welcome Back</CardTitle>
                            <CardDescription className="text-[#171717]/65">
                                Sign in to continue with ANKA and manage gross-profit insights.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[#171717]/85">Work Email</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="name@company.com"
                                                        {...field}
                                                        className="h-11 border-[#171717]/20 bg-white focus-visible:ring-[#00a6f4]"
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
                                                <FormLabel className="text-[#171717]/85">Password</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="password"
                                                        placeholder="********"
                                                        {...field}
                                                        className="h-11 border-[#171717]/20 bg-white focus-visible:ring-[#00a6f4]"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button
                                        type="submit"
                                        className="h-11 w-full bg-[#00a6f4] text-base font-semibold text-white hover:bg-[#0797dd]"
                                        disabled={loading}
                                    >
                                        {loading ? 'Signing in...' : 'Sign In to ANKA'}
                                        {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                                    </Button>
                                </form>
                            </Form>

                            <div className="mt-6 rounded-lg border border-[#00a6f4]/20 bg-[#f8fafc] p-3 text-sm text-[#171717]/70">
                                <p className="mb-1 font-medium text-[#171717]">Demo Credentials</p>
                                <p>Admin: admin@example.com / 123456</p>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}
