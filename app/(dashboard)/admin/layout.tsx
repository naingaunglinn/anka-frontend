import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  description: "Platform administration for Anka SaaS.",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-full">{children}</div>;
}
