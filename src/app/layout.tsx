import type { Metadata } from "next";
import { headers } from 'next/headers';

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      {/* Script no <head> elimina flash de tema: roda sincronamente antes
          do primeiro paint, lê localStorage e aplica o class correto. */}
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.add('light')}else if(t==='dark'){document.documentElement.classList.add('dark')}else if(!t){document.documentElement.classList.add('light')}else{if(window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.classList.add('light')}else{document.documentElement.classList.add('dark')}}}catch(e){}})()` }} />
      </head>
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
