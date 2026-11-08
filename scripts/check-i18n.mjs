// Keep application copy in the catalogue. User content, technical IDs and tile artwork are exempt.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import messages from '../src/lib/i18n/messages.json' with { type: 'json' };
const exemptText = new Set([
  'ŽSR',
  'Železničná spoločnosť Slovensko',
  'v1.0.4',
  'KB',
  'm',
  't',
  'min',
  'x',
  '×',
  '← JOP',
  '&rarr;',
  'tiles.ts',
]);
const technicalExamples = new Set(['mock-session-001', 'station-a', 'mock-ab12cd34']);
const failures = [];
function files(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
}
for (const file of files('src/app').filter(
  (file) => file.endsWith('.tsx') && !/[\\/](assets|data)[\\/]/.test(file),
)) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function fail(node, message) {
    failures.push(
      `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${message}`,
    );
  }
  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim();
      if (/[A-Za-zÀ-ž]/.test(text) && !exemptText.has(text))
        fail(node, `Untranslated text: ${text}`);
    }
    if (
      ts.isJsxAttribute(node) &&
      ['title', 'placeholder', 'aria-label', 'alt', 'label'].includes(node.name.text) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      /[A-Za-zÀ-ž]/.test(node.initializer.text)
    ) {
      // Server page titles are translated by the client LegalPage boundary.
      if (
        !technicalExamples.has(node.initializer.text) &&
        !(node.name.text === 'title' && /[\\/](tos|privacy-policy)[\\/]/.test(file))
      ) {
        fail(node, `Untranslated attribute: ${node.initializer.text}`);
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 't' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      !messages[node.arguments[0].text]
    ) {
      fail(node, `Missing catalogue entry: ${node.arguments[0].text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`UI copy check passed (${Object.keys(messages).length} bilingual messages).`);
