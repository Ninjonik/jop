import Link from 'next/link';

import RuntimeStationClient from '@/app/components/runtime/RuntimeStationClient';

interface RuntimePageProps {
  params: Promise<{
    sessionId: string;
    stationId: string;
  }>;
}

export default async function RuntimePage({ params }: RuntimePageProps) {
  const { sessionId, stationId } = await params;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="flex items-center justify-between gap-3 px-6 py-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Runtime Control</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {stationId} <span className="text-neutral-500">@</span> {sessionId}
          </h1>
        </div>
        <Link href="/" className="text-sm text-neutral-400 underline-offset-4 hover:underline">
          Change station
        </Link>
      </div>

      <RuntimeStationClient sessionId={sessionId} stationId={stationId} />
    </main>
  );
}
