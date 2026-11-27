export function isRuntimeDebugEnabled() {
  return typeof process !== 'undefined' && process.env.JOP_RUNTIME_DEBUG === 'true';
}

export function printDebugBlock(scope: string, header: string, lines: string[] | (() => string[])) {
  if (!isRuntimeDebugEnabled()) return;
  lines = typeof lines === 'function' ? lines() : lines;
  if (lines.length === 0) {
    return;
  }

  console.log([`[${scope}] ${header}`, ...lines.map((line) => `- ${line}`)].join('\n'));
}
