import messages from './messages.json';

export type Locale = 'sk' | 'en';
export const defaultLocale: Locale = 'sk';
export const localeTags: Record<Locale, string> = { sk: 'sk-SK', en: 'en-GB' };
const catalogue: Record<string, readonly string[]> = messages;

export function isLocale(value: unknown): value is Locale {
  return value === 'sk' || value === 'en';
}

// Also recognise already translated notices retained in component state after a language change.
const byText = new Map<string, readonly string[]>();
for (const [key, pair] of Object.entries(catalogue)) {
  byText.set(key, pair);
  for (const text of pair) if (!byText.has(text)) byText.set(text, pair);
}

const templates = [...byText]
  .filter(([text]) => /\{\d+\}/.test(text))
  .map(([text, pair]) => {
    const slots: number[] = [];
    const pattern = text
      .split(/(\{\d+\})/)
      .map((part) => {
        if (/^\{\d+\}$/.test(part)) {
          slots.push(Number(part.slice(1, -1)));
          return '([\\s\\S]*?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return { pattern: new RegExp(`^${pattern}$`), slots, pair };
  });

/** Translate application copy only. Never pass user-authored content or railway identifiers here. */
export function translate(text: string, locale: Locale, ...values: (string | number)[]): string {
  const pair = byText.get(text);
  let result = pair?.[locale === 'sk' ? 0 : 1];
  if (result === undefined && !values.length) {
    for (const template of templates) {
      const match = template.pattern.exec(text);
      if (!match) continue;
      const captures: string[] = [];
      template.slots.forEach((slot, index) => {
        captures[slot] = match[index + 1];
      });
      return template.pair[locale === 'sk' ? 0 : 1].replace(
        /\{(\d+)\}/g,
        (_, slot) => captures[Number(slot)] ?? '',
      );
    }
  }
  result ??= text;
  return result.replace(/\{(\d+)\}/g, (placeholder, slot) =>
    values[Number(slot)] === undefined ? placeholder : String(values[Number(slot)]),
  );
}
