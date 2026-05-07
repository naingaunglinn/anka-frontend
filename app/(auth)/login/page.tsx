'use client';

import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

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
import { loginSchema, type LoginFormValues } from '@/lib/schemas/auth.schema';

function LoginFormContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { login, isLoggingIn } = useAuth();
    const enterDemoMode = useUIStore((s) => s.enterDemoMode);
    const exitDemoMode = useUIStore((s) => s.exitDemoMode);
    const isDemoIntent = searchParams.get('demo') === '1';

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        mode: 'onBlur',
        reValidateMode: 'onChange',
        defaultValues: {
            email: '',
            password: '',
        },
    });

    const onSubmit = async (values: LoginFormValues) => {
        try {
            await login({ email: values.email, password: values.password });
            exitDemoMode();
            const { useAuthStore } = await import('@/store/authStore');
            const isSuperAdmin = useAuthStore.getState().user?.isSuperAdmin ?? false;
            router.push(isSuperAdmin ? '/admin/dashboard' : '/dashboard');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { message?: string } } };
            form.setError('email', {
                message: axiosErr.response?.data?.message ?? 'Login failed. Check your credentials.',
            });
        }
    };

    const startGoogleLogin = () => {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const callbackUrl = `${window.location.origin}/auth/google/callback`;
        const oauthUrl = `${backendUrl}/api/auth/google/redirect?redirect_uri=${encodeURIComponent(callbackUrl)}`;
        window.location.href = oauthUrl;
    };

    const continueAsDemoGuest = async () => {
        const demoUser = {
            id: 'demo-guest-1',
            firstName: 'Demo',
            lastName: 'Guest',
            email: 'guest@anka.demo',
            appRole: 'Executive' as const,
            systemRole: 'member',
            isSuperAdmin: false,
            tenant: {
                id: 'demo-tenant-1',
                name: 'ANKA Demo Workspace',
                slug: 'anka-demo-workspace',
            },
        };
        const demoToken = 'demo_guest_token_anka';

        await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: demoToken, is_super_admin: false }),
        });

        useAuthStore.getState().login(demoUser, demoToken);
        enterDemoMode();
        router.push('/dashboard');
    };

    return (
        <main className="relative min-h-screen overflow-hidden bg-[#f8fafc] text-[#171717]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_15%,rgba(0,166,244,0.25),transparent_35%),radial-gradient(circle_at_88%_22%,rgba(56,189,248,0.22),transparent_33%),radial-gradient(circle_at_78%_86%,rgba(2,132,199,0.20),transparent_36%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(248,250,252,0.2),rgba(255,255,255,0.75),rgba(248,250,252,0.2))]" />

            <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-10 md:px-10 lg:grid-cols-2">
                <section>
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#00a6f4]/30 bg-white/95 px-4 py-2 shadow-sm">
                        <span className="h-2 w-2 rounded-full bg-[#00a6f4]" />
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00a6f4]">ANKA</span>
                    </div>

                    <h1 className="max-w-xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
                        Gross Profit Suggestion
                        <span className="block text-[#00a6f4]">System For Real Decisions</span>
                    </h1>

                    <p className="mt-5 max-w-xl text-base leading-7 text-[#171717]/75 md:text-lg">
                        Predict margins early, compare scenarios fast, and act on concrete suggestions before project kickoff.
                    </p>

                    <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
                        <article className="rounded-xl border border-[#00a6f4]/25 bg-white/90 p-3 shadow-sm">
                            <ChartNoAxesCombined className="mb-2 h-4 w-4 text-[#00a6f4]" />
                            <p className="text-xs font-semibold">Forecast</p>
                        </article>
                        <article className="rounded-xl border border-[#00a6f4]/25 bg-white/90 p-3 shadow-sm">
                            <Target className="mb-2 h-4 w-4 text-[#00a6f4]" />
                            <p className="text-xs font-semibold">Optimize</p>
                        </article>
                        <article className="rounded-xl border border-[#00a6f4]/25 bg-white/90 p-3 shadow-sm">
                            <Sparkles className="mb-2 h-4 w-4 text-[#00a6f4]" />
                            <p className="text-xs font-semibold">Suggest</p>
                        </article>
                    </div>
                </section>

                <section>
                    <Card className="mx-auto w-full max-w-md border-[#00a6f4]/20 bg-white/92 shadow-[0_25px_70px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                        <CardHeader className="space-y-2 pb-6">
                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#00a6f4] text-white shadow-lg">
                                <LogIn className="h-6 w-6" />
                            </div>
                            <CardTitle className="text-2xl font-bold">Sign In to ANKA</CardTitle>
                            <CardDescription className="text-[#171717]/65">
                                Continue to your gross-profit insights workspace.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isDemoIntent && (
                                <Button
                                    type="button"
                                    className="mb-4 h-11 w-full bg-[#171717] text-white hover:bg-black"
                                    onClick={continueAsDemoGuest}
                                >
                                    Continue as Demo Guest
                                </Button>
                            )}

                            <Button
                                type="button"
                                variant="outline"
                                className="mb-5 h-11 w-full border-[#171717]/20 bg-white text-[#171717] hover:bg-[#f1f5f9]"
                                onClick={startGoogleLogin}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    className="mr-2 h-5 w-5"
                                    aria-hidden="true"
                                >
                                    <path
                                        fill="#EA4335"
                                        d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.3-.2-2H12z"
                                    />
                                    <path
                                        fill="#34A853"
                                        d="M3.2 7.3l3.2 2.3C7.2 7.6 9.4 6 12 6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 8.1 2 4.7 4.2 3.2 7.3z"
                                    />
                                    <path
                                        fill="#FBBC05"
                                        d="M12 22c2.6 0 4.8-.9 6.4-2.4l-3-2.4c-.8.5-1.9.9-3.4.9-4 0-5.2-2.7-5.5-3.6l-3.2 2.5C4.8 19.9 8.1 22 12 22z"
                                    />
                                    <path
                                        fill="#4285F4"
                                        d="M21.6 12.2c0-.7-.1-1.3-.2-2H12v3.9h5.5c-.3 1.4-1.1 2.4-2.1 3.1l3 2.4c1.8-1.7 3.2-4.3 3.2-7.4z"
                                    />
                                </svg>
                                Continue with Google
                            </Button>

                            <div className="mb-5 flex items-center gap-3">
                                <div className="h-px flex-1 bg-[#171717]/15" />
                                <p className="text-xs uppercase tracking-[0.16em] text-[#171717]/55">or use email</p>
                                <div className="h-px flex-1 bg-[#171717]/15" />
                            </div>

                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[#171717]/90">Work Email</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="name@company.com"
                                                        {...field}
                                                        className="h-11 border-[#171717]/20 bg-white focus-visible:ring-2 focus-visible:ring-[#00a6f4]"
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
                                                <FormLabel className="text-[#171717]/90">Password</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="password"
                                                        placeholder="********"
                                                        {...field}
                                                        className="h-11 border-[#171717]/20 bg-white focus-visible:ring-2 focus-visible:ring-[#00a6f4]"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <Button
                                        type="submit"
                                        className="h-11 w-full bg-[#00a6f4] text-base font-semibold text-white shadow-[0_10px_24px_rgba(0,166,244,0.35)] hover:bg-[#0599df]"
                                        disabled={isLoggingIn}
                                    >
                                        {isLoggingIn ? 'Signing in...' : 'Enter ANKA'}
                                        {!isLoggingIn && <ArrowRight className="ml-2 h-4 w-4" />}
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </main>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<LoginSkeleton />}>
            <LoginFormContent />
        </Suspense>
    );
}

function LoginSkeleton() {
    return (
        <main className="relative min-h-screen overflow-hidden bg-[#f8fafc] text-[#171717]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_15%,rgba(0,166,244,0.25),transparent_35%),radial-gradient(circle_at_88%_22%,rgba(56,189,248,0.22),transparent_33%),radial-gradient(circle_at_78%_86%,rgba(2,132,199,0.20),transparent_36%)]" />
            <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-10 md:px-10 lg:grid-cols-2">
                <section>
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#00a6f4]/30 bg-white/95 px-4 py-2 shadow-sm">
                        <span className="h-2 w-2 rounded-full bg-[#00a6f4]" />
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00a6f4]">ANKA</span>
                    </div>
                    <h1 className="max-w-xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
                        Gross Profit Suggestion
                        <span className="block text-[#00a6f4]">System For Real Decisions</span>
                    </h1>
                    <p className="mt-5 max-w-xl text-base leading-7 text-[#171717]/75 md:text-lg">
                        Predict margins early, compare scenarios fast, and act on concrete suggestions before project kickoff.
                    </p>
                </section>
                <section>
                    <Card className="mx-auto w-full max-w-md border-[#00a6f4]/20 bg-white/92 shadow-[0_25px_70px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                        <CardHeader className="space-y-2 pb-6">
                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#00a6f4] text-white shadow-lg">
                                <LogIn className="h-6 w-6" />
                            </div>
                            <CardTitle className="text-2xl font-bold">Sign In to ANKA</CardTitle>
                            <CardDescription className="text-[#171717]/65">
                                Continue to your gross-profit insights workspace.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center gap-4 py-8">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#00a6f4] border-t-transparent" />
                            <p className="text-sm text-[#171717]/55">Loading sign-in...</p>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </main>
    );
}
