const bratislava = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Bratislava',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
/** Offset civil timetable time, including date rollover, without changing real deadlines. */
export function operatingClockParts(offsetMinutes = 0, now = Date.now()) {
  const parts = Object.fromEntries(
    bratislava.formatToParts(new Date(now)).map((part) => [part.type, part.value]),
  );
  const civil = new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ) +
      offsetMinutes * 60000,
  );
  const time = civil.toISOString().slice(11, 19);
  return {
    date: civil.toISOString().slice(0, 10),
    time,
    minuteTime: time.slice(0, 5),
    secondOfDay: civil.getUTCHours() * 3600 + civil.getUTCMinutes() * 60 + civil.getUTCSeconds(),
  };
}
export function currentBratislavaTime(offsetMinutes = 0, now = Date.now()) {
  return operatingClockParts(offsetMinutes, now).minuteTime;
}
export type SessionClockSnapshot = {
  sessionId: string;
  offsetMinutes: number;
  configured: boolean;
  serverUnixMs: number;
  date: string;
  time: string;
  secondOfDay: number;
};

export function parseCompactClock(value: string): string {
  const compact = value.trim().replace('.', ':');
  if (/^\d{3,4}$/.test(compact)) {
    const p = compact.padStart(4, '0');
    return `${p.slice(0, 2)}:${p.slice(2)}`;
  }
  if (/^\d{1,2}:\d{2}$/.test(compact)) return compact.padStart(5, '0');
  return value;
}
