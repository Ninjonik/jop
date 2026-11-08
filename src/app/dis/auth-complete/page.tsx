'use client';

import { clearDisToken } from '@/lib/dis/api-client';
import { account } from '@/lib/dis/appwrite-client';
import { completeRobloxLogin } from '@/lib/dis/complete-roblox-login';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

function AuthCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const secret = searchParams.get('secret');
  const [loginError, setLoginError] = useState<string | null>(null);
  const error = !userId || !secret ? 'Chýbajúce autentifikačné parametre.' : loginError;
  const completing = useRef<Promise<unknown> | null>(null);
  const status = 'Vytváram reláciu ZSSK DIS...';

  useEffect(() => {
    if (!userId || !secret) return;
    let active = true;
    // React Strict Mode replays effects; consume the one-time login token only once.
    completing.current ??= completeRobloxLogin(account, userId, secret);
    completing.current
      .then(() => {
        if (active) {
          clearDisToken();
          router.replace('/dis');
        }
      })
      .catch((error: unknown) => {
        if (active)
          setLoginError(error instanceof Error ? error.message : 'Nepodarilo sa vytvoriť reláciu.');
      });
    return () => {
      active = false;
    };
  }, [userId, secret, router]);

  return (
    <div className="min-h-screen bg-[#cbd7e6] flex items-center justify-center font-['Segoe_UI'] p-4 select-none">
      <div className="w-[420px] bg-white border border-[#8fa6c4] rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.2)] overflow-hidden">
        {/* Title bar */}
        <div className="h-7 bg-gradient-to-b from-[#e3efff] to-[#b5d1f1] border-b border-[#8fa6c4] px-2 flex items-center justify-between text-[#1e395b] font-semibold text-xs">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 bg-[#1a5276] rounded-[1px]"></span>
            <span>ZSSK DIS — Autentifikácia</span>
          </div>
        </div>

        <div className="p-6 text-center space-y-4">
          {!error ? (
            <>
              <div className="inline-block w-8 h-8 border-3 border-[#3c7fb1] border-t-transparent rounded-full animate-spin"></div>
              <div className="text-sm font-semibold text-[#1e293b]">{status}</div>
              <p className="text-xs text-[#5d6d7e]">
                Overovanie identity v skupine a priraďovanie dispečerských práv...
              </p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 mx-auto rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-lg">
                ✕
              </div>
              <div className="text-sm font-bold text-red-700">Chyba prihlásenia</div>
              <p className="text-xs text-[#5d6d7e]">{error}</p>
              <button
                onClick={() => router.push('/dis/login')}
                className="px-4 py-1.5 text-xs bg-gradient-to-b from-[#fbfbfb] to-[#e1e4e8] hover:from-[#f3f9ff] hover:to-[#cbe3fc] border border-[#707070] hover:border-[#3c7fb1] rounded-[3px] shadow-sm font-semibold cursor-pointer"
              >
                Návrat na prihlásenie
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#cbd7e6] flex items-center justify-center font-['Segoe_UI'] text-xs text-[#1e395b]">
          Pripravujem overenie...
        </div>
      }
    >
      <AuthCompleteContent />
    </Suspense>
  );
}
