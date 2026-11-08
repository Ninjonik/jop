import assert from 'node:assert/strict';
import test from 'node:test';
import messages from './messages.json';
import { isLocale, translate } from './translate';

test('every message has complete Slovak and English text and matching placeholders', () => {
  const slots = (text: string) => [...text.matchAll(/\{(\d+)\}/g)].map((match) => match[1]).sort();
  for (const [source, pair] of Object.entries(messages)) {
    assert.equal(pair.length, 2, source);
    assert.ok(
      pair.every((text) => text.trim()),
      source,
    );
    assert.deepEqual(slots(pair[0]), slots(pair[1]), source);
  }
});

test('railway terms use operational English rather than literal translations', () => {
  assert.equal(translate('Výpravca', 'en'), 'Signaller');
  assert.equal(translate('Dopravný denník', 'en'), 'Train register');
  assert.equal(translate('lineblock', 'en'), 'Block instrument');
  assert.equal(translate('singleSwitch', 'en'), 'Points');
  assert.equal(translate('Manipulačný nákladný vlak', 'en'), 'Pick-up freight');
  assert.equal(translate('Súpravový vlak', 'en'), 'Empty coaching stock');
});

test('notices and server-generated conflicts translate after switching language', () => {
  const source = '{0} a {1}: súbežné obsadenie koľaje {2} v stanici {3} ({4}–{5} / {6}–{7}).';
  const args = ['Os 12', 'R 34', '2', 'Kolárovo', '08:00', '08:05', '08:03', '08:06'];
  const original = translate(source, 'sk', ...args);
  const english = translate(original, 'en');
  assert.equal(
    english,
    'Os 12 and R 34: overlapping occupation of track 2 at Kolárovo (08:00–08:05 / 08:03–08:06).',
  );
  assert.equal(translate(english, 'sk'), original);
  const savedNotice = translate(
    'Stanica {0} bola pridaná. Koľajisko môžete upraviť v editore.',
    'en',
    'Kolárovo',
  );
  assert.equal(
    translate(savedNotice, 'sk'),
    'Stanica Kolárovo bola pridaná. Koľajisko môžete upraviť v editore.',
  );
});

test('literal regex punctuation and multiline templates are safe', () => {
  const original = translate(
    'Súbor „{0}“ nie je podporovaný, je prázdny alebo prekračuje 10 MB.',
    'sk',
    'report (1)+.pdf',
  );
  assert.equal(
    translate(original, 'en'),
    'File “report (1)+.pdf” is unsupported, empty or larger than 10 MB.',
  );
  assert.equal(
    translate('Nahrávam {0}/{1}: {2}', 'en', 1, 2, 'a\nb.png'),
    'Uploading 1/2: a\nb.png',
  );
});

test('unknown names, train designations and text are preserved', () => {
  for (const text of ['Kolárovo', 'Veselé', 'R 4984', 'Pos 90001', 'custom user message']) {
    assert.equal(translate(text, 'en'), text);
    assert.equal(translate(text, 'sk'), text);
  }
  assert.equal(isLocale('sk'), true);
  assert.equal(isLocale('en'), true);
  assert.equal(isLocale('en-US'), false);
});
