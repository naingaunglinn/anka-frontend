import type { Metadata } from "next";
import { QueryClientProviderWrapper } from "@/components/providers/QueryClientProviderWrapper";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Anka workspace to manage deals, projects, and financials.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProviderWrapper>
      {children}
    </QueryClientProviderWrapper>
  );
}