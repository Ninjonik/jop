/** The keypad uses only the three-digit part of the personnel callsign. */
export function callsignNumber(callsign: string): string | null {
  const match = /^ZSSK-(\d{3})$/.exec(callsign);
  return match && match[1] !== '000' ? match[1] : null;
}
