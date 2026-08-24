export function printDebugBlock(scope: string, header: string, lines: string[]) {
  if (lines.length === 0) {
    return;
  }

  console.log([`[${scope}] ${header}`, ...lines.map((line) => `- ${line}`)].join('\n'));
}
