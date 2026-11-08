import {I18nProvider} from '@/lib/i18n/client';
import { getCurrentAppTitle } from '@/lib/server/git-version';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getCurrentAppTitle(),
    description: 'JOP runtime and editor',
  };
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="sk"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
