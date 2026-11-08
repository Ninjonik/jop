'use client';
import { useTranslation } from '@/lib/i18n/client';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslation();
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-800">
      <article className="mx-auto max-w-3xl space-y-6 rounded-xl bg-white p-8 shadow-sm sm:p-12">
        <Link href="/" className="text-sm font-medium text-blue-700 hover:underline">
          ← JOP
        </Link>
        <h1 className="text-3xl font-bold text-slate-950">{t(title)}</h1>
        <div className="space-y-6 leading-7 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_a]:text-blue-700 [&_a]:underline">
          {children}
        </div>
        <nav className="border-t border-slate-200 pt-6 text-sm">
          <Link href="/tos" className="mr-6 text-blue-700 hover:underline">
            {' '}
            {t('Terms of Service')}{' '}
          </Link>
          <Link href="/privacy-policy" className="text-blue-700 hover:underline">
            {' '}
            {t('Privacy Policy')}{' '}
          </Link>
        </nav>
      </article>
    </main>
  );
}
