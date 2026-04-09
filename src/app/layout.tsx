import type { Metadata } from "next";

import { DM_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { AppProviders } from '@/client/components/providers/app-providers'

import "./globals.css"

// DS v3 source of truth (quayer-ds-v3.html:139):
// --font-sans: 'DM Sans','Helvetica Neue',sans-serif;
const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Quayer - Plataforma WhatsApp Multi-Instância",
  description: "Gerencie múltiplas instâncias WhatsApp em uma única plataforma inteligente",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
