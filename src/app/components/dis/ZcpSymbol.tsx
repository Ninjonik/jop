import { operatingSymbols } from '@/lib/dis/railway-network';
export function ZcpSymbol({ symbol }: { symbol: string }) {
  const label = operatingSymbols.find(([id]) => id === symbol)?.[1] || symbol;
  if (symbol === 'speed' || symbol === 'dispatch')
    return (
      <svg
        className={`zcp-symbol ${symbol}`}
        viewBox={symbol === 'speed' ? '19 13 38 65' : '61 31 44 44'}
        role="img"
        aria-label={label}
      >
        <image href="/zcp/original-signal-dispatch.png" width="124" height="91" />
      </svg>
    );
  if (symbol === 'trapezoid')
    return (
      <svg className="zcp-symbol" viewBox="0 0 18 26" role="img" aria-label={label}>
        <path d="M3 13L6 6H12L15 13ZM9 13V24" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  return (
    <span title={label} aria-label={label}>
      {(
        {
          cross: '⊗',
          closed: '~',
          closedCalendar: '~!',
          occupied: '○',
          deadend: '△',
          report: '◩',
        } as Record<string, string>
      )[symbol] || symbol}
    </span>
  );
}
