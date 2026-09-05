import test from 'node:test';
import assert from 'node:assert/strict';
import {convertCsv, parseCsv} from './import-triviaire.mjs';
const rows = (n = 15) => 'Question,A,B,C,D,Correct,,\r\n' + Array.from({length: n}, (_, i) => `Question ${i}?,One,Two,Three,Four,${'ABCD'[i % 4]},,`).join('\r\n');

test('CSV supports BOM, CRLF, escaped quotes, commas and embedded newlines', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"A, B","C ""D"""\r\n"new\nline",end'), [['a','b'], ['A, B','C "D"'], ['new\nline','end']]);
});
test('CSV rejects malformed quoting', () => {
  for (const csv of ['a,"unclosed', 'a,"closed"text', 'a,b"c']) assert.throws(() => parseCsv(csv));
});
test('converts correct-answer letters into zero-based indices and generates stable IDs', () => {
  const bank = convertCsv(rows());
  assert.equal(bank.questions.length, 15);
  assert.deepEqual(bank.questions.slice(0, 4).map((q) => q.answer), [0,1,2,3]);
  assert.deepEqual(bank, convertCsv(rows()));
  const reordered = rows().split('\r\n');
  const again = convertCsv([reordered[0], ...reordered.slice(1).reverse()].join('\n'));
  assert.equal(bank.questions[0].id, again.questions.at(-1).id);
});
test('deduplicates prompts with matching answers and retains all source rows', () => {
  const bank = convertCsv(rows() + '\r\nQuestion 0?,One,Two,Three,Four,A,,');
  assert.equal(bank.source.duplicatesRemoved, 1);
  assert.deepEqual(bank.questions[0].sourceRows, [2,17]);
});
test('preserves attribution in the supplied sheet’s unnamed columns', () => {
  const bank = convertCsv(rows().replace('Question 0?,One,Two,Three,Four,A,,', 'Question 0?,One,Two,Three,Four,A,Example episode,Contributor'));
  assert.equal(bank.questions[0].source, 'Example episode');
  assert.equal(bank.questions[0].contributor, 'Contributor');
});
test('rejects conflicting correct answers instead of silently picking one', () => {
  assert.throws(() => convertCsv(rows() + '\nQuestion 0?,One,Two,Three,Four,B,,'), /Conflicting/);
});
test('rejects HTML/login responses, missing columns, incomplete packs and bad answers', () => {
  assert.throws(() => convertCsv('<!DOCTYPE html><html>Sign in</html>'), /HTML/);
  assert.throws(() => convertCsv('Question,A,B,C,D\nQ,A,B,C,D'), /Required columns/);
  assert.throws(() => convertCsv(rows(14)), /15 unique/);
  assert.throws(() => convertCsv(rows().replace('Four,A', 'Four,Z')), /row 2/);
  assert.throws(() => convertCsv(rows().replace('One,Two', 'One,One')), /row 2/);
});

test('quarantines truncated prompts without rewriting the original snapshot', () => {
  const bank = convertCsv(rows() + '\nJ,July 4,July 14,July 24,July 31,A,,');
  assert.equal(bank.questions.length, 15);
  assert.equal(bank.source.rows, 16);
  assert.deepEqual(bank.source.excludedRows, [{row: 17, reason: 'Incomplete prompt (fewer than 8 characters).'}]);
});
