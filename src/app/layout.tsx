import type { Metadata } from "next";

import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from '@/components/providers/app-providers'

import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "App Quayer - WhatsApp Multi-Instância",
  description: "Sistema de gerenciamento de múltiplas instâncias WhatsApp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
      >
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
