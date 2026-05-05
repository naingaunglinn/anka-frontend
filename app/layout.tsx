import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f172a" },
    { media: "(prefers-color-scheme: dark)", color: "#1e293b" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Anka — Agency Management Platform",
    template: "%s | Anka",
  },
  description:
    "Anka is the all-in-one agency management platform. Manage your sales pipeline, projects, time tracking, financials, and team — all in one place.",
  keywords: [
    "agency management",
    "project management",
    "CRM",
    "time tracking",
    "P&L",
    "invoicing",
    "deal pipeline",
    "SaaS",
    "Anka",
  ],
  authors: [{ name: "Anka" }],
  creator: "Anka",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://anka.app"
  ),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Anka",
    title: "Anka — Agency Management Platform",
    description:
      "Manage your sales pipeline, projects, time tracking, financials, and team — all in one place.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Anka — Agency Management Platform",
    description:
      "Manage your sales pipeline, projects, time tracking, financials, and team — all in one place.",
  },
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
