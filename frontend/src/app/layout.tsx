import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "OnTrack | Contractor Operations Platform",
  description:
    "OnTrack streamlines leads, estimates, jobs, invoicing, and payments so contractor teams stay coordinated and profitable.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background text-foreground">
      <body
        className={`${manrope.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        <div className="ontrack-gradient fixed inset-0 -z-10 opacity-80" />
        {children}
      </body>
    </html>
  );
}
