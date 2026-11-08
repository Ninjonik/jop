'use client';
import { LanguageSelector, useTranslation } from '@/lib/i18n/client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

export default function DisLoginForm() {
  const t = useTranslation();
  return (
    <div className="min-h-screen bg-[#cbd7e6] flex items-center justify-center font-['Segoe_UI'] p-4 select-none">
      {/* Windows 7 Aero Window Box */}
      <div className="w-[440px] bg-white border border-[#8fa6c4] rounded-[3px] shadow-[0_4px_16px_rgba(0,0,0,0.25)] overflow-hidden">
        {/* Caption Bar */}
        <div className="h-8 bg-gradient-to-b from-[#e3efff] to-[#b5d1f1] border-b border-[#8fa6c4] px-2.5 flex items-center justify-between text-[#1e395b] font-semibold text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 fill-[#1a5276]" viewBox="0 0 24 24">
              <path d="M4 15.5C4 17.43 5.57 19 7.5 19L6 20.5V21H18V20.5L16.5 19C18.43 19 20 17.43 20 15.5V5C20 3.34 16.5 2 12 2C7.5 2 4 3.34 4 5V15.5ZM12 4C16.2 4 18 5.12 18 6V11H6V6C6 5.12 7.8 4 12 4ZM7.5 17C6.67 17 6 16.33 6 15.5C6 14.67 6.67 14 7.5 14C8.33 14 9 14.67 9 15.5C9 16.33 8.33 17 7.5 17ZM16.5 17C15.67 17 15 16.33 15 15.5C15 14.67 15.67 14 16.5 14C17.33 14 18 14.67 18 15.5C18 16.33 17.33 17 16.5 17Z" />
            </svg>
            <span>{t('ZSSK DIS — Prihlásenie do informačného systému')}</span>
          </div>
          <div className="flex space-x-1">
            <div className="w-6 h-4 border border-black/20 rounded-[2px] bg-gradient-to-b from-white to-[#d4e0eb] flex items-center justify-center text-[10px] text-gray-700">
              ✕
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="flex justify-end">
            <LanguageSelector />
          </div>
          <div className="flex items-center space-x-3 pb-3 border-b border-[#e2e8f0]">
            <div className="w-11 h-11 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              ŽSR
            </div>
            <div>
              <div className="text-sm font-bold text-[#1e293b]">
                Železničná spoločnosť Slovensko
              </div>
              <div className="text-xs text-[#5d6d7e]">
                {' '}
                {t('Dopravný informačný systém & Intranet dispečera')}{' '}
              </div>
            </div>
          </div>

          <Suspense fallback={null}>
            <LoginError />
          </Suspense>

          <div className="text-xs text-[#475569] leading-relaxed">
            {' '}
            {t(
              'Pre prístup k staničnému dopravnému denníku (EDD), traťovej polohe vlakov (TPV), zmenám a predpisom sa prihláste vaším',
            )}{' '}
            <strong>{t('Roblox účtom')}</strong>.
            <div className="mt-2 text-[11px] text-[#64748b] bg-[#f8fafc] p-2 rounded border border-[#e2e8f0]">
              {' '}
              {t(
                'Systém automaticky overí vašu hodnosť a rolu v oficiálnej Roblox skupine a podľa nej pridelí prevádzkové oprávnenia.',
              )}{' '}
            </div>
          </div>

          <div className="pt-2">
            <a
              href="/api/auth/roblox/login"
              className="w-full h-10 px-4 bg-gradient-to-b from-[#fbfbfb] to-[#e1e4e8] hover:from-[#f3f9ff] hover:to-[#cbe3fc] active:from-[#cbe3fc] active:to-[#a2c8f0] border border-[#707070] hover:border-[#3c7fb1] rounded-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.1)] flex items-center justify-center space-x-2.5 cursor-pointer transition font-semibold text-xs text-[#1e293b]"
            >
              <svg className="w-5 h-5 fill-[#222]" viewBox="0 0 24 24">
                <path d="M18.5 0h-13C2.46 0 0 2.46 0 5.5v13C0 21.54 2.46 24 5.5 24h13c3.04 0 5.5-2.46 5.5-5.5v-13C24 2.46 21.54 0 18.5 0zm-3.69 16.36l-7.05-1.92 1.88-6.9 7.05 1.92-1.88 6.9z" />
              </svg>
              <span>{t('Prihlásiť sa cez Roblox účet')}</span>
            </a>
          </div>
        </div>

        {/* Status bar */}
        <div className="h-6 bg-[#dfebf7] border-t border-[#a5bdd6] px-3 flex items-center justify-between text-[11px] text-[#5d6d7e]">
          <span>{t('Zabezpečené pripojenie (OAuth 2.0)')}</span>
          <span>v1.0.4</span>
        </div>
      </div>
    </div>
  );
}

function LoginError() {
  const t = useTranslation();
  const errorParam = useSearchParams().get('error');
  return errorParam ? (
    <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
      <span className="font-bold">{t('Chyba prihlásenia:')}</span>{' '}
      {t(
        (
          {
            missing_configuration:
              'Prihlasovanie nie je nakonfigurované. Správca musí doplniť ROBLOX_CLIENT_ID a ROBLOX_CLIENT_SECRET.',
            group_lookup_failed:
              'Overenie Roblox skupiny je momentálne nedostupné. Skúste to neskôr.',
            not_group_member: 'Pre prístup musíte byť členom určenej Roblox skupiny.',
            role_not_authorized: 'Vaša rola v Roblox skupine nemá prístup do DIS.',
            server_error: 'Prihlasovacia služba je momentálne nedostupná. Skúste to neskôr.',
          } as Record<string, string>
        )[errorParam] || 'Prihlásenie sa nepodarilo. Skúste to znova.',
      )}
    </div>
  ) : null;
}
