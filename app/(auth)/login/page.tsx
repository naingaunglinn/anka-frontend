'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

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
    const t = useTranslations();
    const router = useRouter();
    const { login, isLoggingIn } = useAuth();

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
            const { useAuthStore } = await import('@/store/authStore');
            const isSuperAdmin = useAuthStore.getState().user?.isSuperAdmin ?? false;
            router.push(isSuperAdmin ? '/admin/dashboard' : '/dashboard');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { message?: string } } };
            form.setError('email', {
                message: axiosErr.response?.data?.message ?? t('login_failed'),
            });
        }
    };

    return (
        <main className="relative min-h-screen overflow-hidden bg-[#f8fafc] text-[#171717]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_15%,rgba(0,167,244,0.25),transparent_35%),radial-gradient(circle_at_88%_22%,rgba(56,189,248,0.22),transparent_33%),radial-gradient(circle_at_78%_86%,rgba(2,132,199,0.20),transparent_36%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(248,250,252,0.2),rgba(255,255,255,0.75),rgba(248,250,252,0.2))]" />

            <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-10 md:px-10 lg:grid-cols-2">
                <section>
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#00a7f4]/30 bg-white/95 px-4 py-2 shadow-sm">
                        <span className="h-2 w-2 rounded-full bg-[#00a7f4]" />
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00a7f4]">ANKA</span>
                    </div>

                    <h1 className="max-w-xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
                        {t('auth_hero_title_line1')}
                        <span className="block text-[#00a7f4]">{t('auth_hero_title_line2')}</span>
                    </h1>

                    <p className="mt-5 max-w-xl text-base leading-7 text-[#171717]/75 md:text-lg">
                        {t('auth_hero_subtitle')}
                    </p>

                    <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
                        <article className="rounded-xl border border-[#00a7f4]/25 bg-white/90 p-3 shadow-sm">
                            <ChartNoAxesCombined className="mb-2 h-4 w-4 text-[#00a7f4]" />
                            <p className="text-xs font-semibold">{t('forecast_short')}</p>
                        </article>
                        <article className="rounded-xl border border-[#00a7f4]/25 bg-white/90 p-3 shadow-sm">
                            <Target className="mb-2 h-4 w-4 text-[#00a7f4]" />
                            <p className="text-xs font-semibold">{t('optimize')}</p>
                        </article>
                        <article className="rounded-xl border border-[#00a7f4]/25 bg-white/90 p-3 shadow-sm">
                            <Sparkles className="mb-2 h-4 w-4 text-[#00a7f4]" />
                            <p className="text-xs font-semibold">{t('suggest')}</p>
                        </article>
                    </div>
                </section>

                <section>
                    <Card className="mx-auto w-full max-w-md border-[#00a7f4]/20 bg-white/92 shadow-[0_25px_70px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                        <CardHeader className="space-y-2 pb-6">
                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#00a7f4] text-white shadow-lg">
                                <LogIn className="h-6 w-6" />
                            </div>
                            <CardTitle className="text-2xl font-bold">{t('sign_in_to_anka')}</CardTitle>
                            <CardDescription className="text-[#171717]/65">
                                {t('continue_to_workspace')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[#171717]/90">{t('work_email')}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder={t('placeholder_email_co')}
                                                        {...field}
                                                        className="h-11 border-[#171717]/20 bg-white focus-visible:ring-2 focus-visible:ring-[#00a7f4]"
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
                                                <FormLabel className="text-[#171717]/90">{t('password')}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="password"
                                                        placeholder={t('placeholder_password_stars')}
                                                        {...field}
                                                        className="h-11 border-[#171717]/20 bg-white focus-visible:ring-2 focus-visible:ring-[#00a7f4]"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <Button
                                        type="submit"
                                        className="h-11 w-full bg-[#00a7f4] text-base font-semibold text-white shadow-[0_10px_24px_rgba(0,167,244,0.35)] hover:bg-[#0599df]"
                                        disabled={isLoggingIn}
                                    >
                                        {isLoggingIn ? t('signing_in') : t('enter_anka')}
                                        {!isLoggingIn && <ArrowRight className="ml-2 h-4 w-4" />}
                                    </Button>
                                </form>
                            </Form>

                            <p className="mt-5 text-center text-sm text-[#171717]/70">
                                <Link href="/" className="font-semibold text-[#00a7f4] hover:underline">
                                    {t('back_to_home')}
                                </Link>
                            </p>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </main>
    );
}

export default function LoginPage() {
    return <LoginFormContent />;
}
