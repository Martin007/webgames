import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {applyCorrections, applyExplanations, applyFriendReplies, convertCsv, convertLevelCsv, convertSheets, CORRECTIONS, FRIEND_REPLIES, LEVELS, OUTPUT, parseCsv, readCorrections, readFriendReplies, sheetCsvUrl} from './import-triviaire.mjs';
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
  assert.throws(() => convertCsv('Question,A,B,C,D\nQ,A,B,C,D'), /question fields|Required columns/i);
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

test('combines Q1 through Q15 as explicit difficulty pools', () => {
  const tabs = new Map(LEVELS.map((level) => [level, rows(2)]));
  const bank = convertSheets(tabs);
  assert.equal(bank.source.difficulty, 'Q1-Q15');
  assert.deepEqual(bank.source.sheets.map((sheet) => sheet.level), LEVELS);
  assert.deepEqual([...new Set(bank.questions.map((q) => q.level))], LEVELS);
  assert.equal(bank.questions.length, 30);
  const missing = new Map(tabs); missing.delete(15);
  assert.throws(() => convertSheets(missing), /Missing Q15/);
});
test('level-aware IDs and URLs preserve the source tab and raw headers', () => {
  const q1 = convertLevelCsv(rows(2), 1);
  const q15 = convertLevelCsv(rows(2), 15);
  assert.equal(q1.questions[0].level, 1);
  assert.equal(q15.questions[0].level, 15);
  assert.notEqual(q1.questions[0].id, q15.questions[0].id);
  assert.match(sheetCsvUrl(1), /sheet=Q1&headers=0$/);
  assert.match(sheetCsvUrl(15), /sheet=Q15&headers=0$/);
});

test('reads the workbook’s transposed bank plus row-wise appended questions', () => {
  const mixed = [
    'Question,First column question?,Second column question?',
    'A,One,Red',
    'B,Two,Blue',
    'C,Three,Green',
    'D,Four,Yellow',
    'Correct,A,B',
    'Question Source,Episode one,Episode two',
    'Contributor,Alice,Bob',
    'Appended row question?,North,South,East,West,C,Episode three,Carol',
  ].join('\n');
  const sheet = convertLevelCsv(mixed, 7);
  assert.equal(sheet.questions.length, 3);
  assert.deepEqual(sheet.questions.map((q) => q.level), [7,7,7]);
  assert.equal(sheet.questions[0].prompt, 'First column question?');
  assert.equal(sheet.questions[0].source, 'Episode one');
  assert.equal(sheet.questions[1].contributor, 'Bob');
  assert.equal(sheet.questions[2].prompt, 'Appended row question?');
  assert.equal(sheet.questions[2].answer, 2);
  assert.equal(sheet.questions[2].contributor, 'Carol');
});

test('quarantines malformed records in a difficulty tab but keeps valid questions', () => {
  const csv = 'Question,A,B,C,D,Correct,,\nValid question here?,One,Two,Three,Four,A,,\nBroken question here?,One,Two,,Four,C,,';
  const sheet = convertLevelCsv(csv, 9);
  assert.equal(sheet.questions.length, 1);
  assert.equal(sheet.excludedRows.length, 1);
  assert.match(sheet.excludedRows[0].reason, /Invalid or incomplete/);
});

const explanation = () => ({
  summary: 'One is the correct answer.',
  choices: ['Why one is correct.', 'Why two is incorrect.', 'Why three is incorrect.', 'Why four is incorrect.'],
  sources: [{title: 'Reference', url: 'https://example.com/reference'}],
});
const catalogFor = (question, value = explanation()) => ({version: 1, questions: {
  [question.id]: {prompt: question.prompt, choices: question.choices, answer: question.answer, explanation: value},
}});

test('explanations change only metadata and revision, preserving all source question fields and order', () => {
  const bank = convertSheets(new Map(LEVELS.map((level) => [level, rows(2)])));
  const catalog = catalogFor(bank.questions[0]);
  const enriched = applyExplanations(bank, catalog);
  assert.deepEqual(enriched.questions[0].explanation, explanation());
  assert.equal(enriched.questions.filter((question) => question.explanation).length, 1);
  assert.deepEqual(enriched.questions.map(({explanation: ignored, ...question}) => question), bank.questions);
  assert.notEqual(enriched.revision, bank.revision);
  assert.deepEqual(applyExplanations(enriched, catalog), enriched);
  assert.deepEqual(applyExplanations(enriched, {version: 1, questions: {}}), bank);
});

test('missing, null and blank explanations stay absent, and unrelated question IDs are harmless', () => {
  const bank = convertCsv(rows());
  for (const value of [undefined, null, '', '   ']) {
    const catalog = catalogFor(bank.questions[0]);
    catalog.questions[bank.questions[0].id].explanation = value;
    assert.deepEqual(applyExplanations(bank, catalog), bank);
  }
  const catalog = catalogFor({...bank.questions[0], id: 'a-question-from-another-pack'});
  assert.deepEqual(applyExplanations(bank, catalog), bank);
});

test('stale explanations are omitted when the original prompt, choice order or correct answer changes', () => {
  const bank = convertCsv(rows());
  const question = bank.questions[0];
  for (const changed of [
    {...question, prompt: 'A different prompt?'},
    {...question, choices: ['Two', 'One', 'Three', 'Four']},
    {...question, answer: 1},
  ]) {
    const warnings = [];
    const enriched = applyExplanations(bank, catalogFor(changed), {warn: (message) => warnings.push(message)});
    assert.deepEqual(enriched, bank);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Skipping stale explanation/);
  }
});

test('explanations normalize whitespace and reject incomplete rationales or unsafe source URLs', () => {
  const bank = convertCsv(rows());
  const question = bank.questions[0];
  const spaced = explanation();
  spaced.summary = '  One is\n the correct answer.  ';
  spaced.choices[0] = '  Why one is correct.  ';
  assert.deepEqual(applyExplanations(bank, catalogFor(question, spaced)).questions[0].explanation, explanation());
  for (const invalid of [
    'A summary without the required choice explanations.',
    {...explanation(), summary: ''},
    {...explanation(), choices: ['Only one choice.']},
    {...explanation(), choices: ['One', 'Two', 'Three', ' ']},
    {...explanation(), sources: [{title: 'Unsafe', url: 'javascript:alert(1)'}]},
    {...explanation(), sources: [{title: 'Insecure', url: 'http://example.com'}]},
  ]) assert.throws(() => applyExplanations(bank, catalogFor(question, invalid)), /Explanation/);
  assert.throws(() => applyExplanations(bank, {version: 2, questions: {}}), /version 1/);
  assert.throws(() => applyExplanations(bank, {version: 1, questions: []}), /questions object/);
});

const friendReply = () => ({answer: 'I think it is One.', hint: 'Think about the first number.'});
const friendCatalogFor = (question, value = friendReply()) => ({version: 1, questions: {
  [question.id]: {prompt: question.prompt, choices: question.choices, answer: question.answer, friendReply: value},
}});

test('friend replies change only metadata and revision, preserving explanations and source question fields', () => {
  const original = convertSheets(new Map(LEVELS.map((level) => [level, rows(2)])));
  const explanations = catalogFor(original.questions[0]);
  const bank = applyExplanations(original, explanations);
  const catalog = friendCatalogFor(bank.questions[0]);
  const enriched = applyFriendReplies(bank, catalog);
  assert.deepEqual(enriched.questions[0].friendReply, friendReply());
  assert.equal(enriched.questions.filter((question) => question.friendReply).length, 1);
  assert.deepEqual(enriched.questions.map(({friendReply: ignored, ...question}) => question), bank.questions);
  assert.deepEqual(enriched.source, bank.source);
  assert.notEqual(enriched.revision, bank.revision);
  assert.deepEqual(applyFriendReplies(enriched, catalog), enriched);
  assert.deepEqual(applyFriendReplies(applyExplanations(enriched, explanations), catalog), enriched);

  const edited = applyFriendReplies(enriched, friendCatalogFor(bank.questions[0], {...friendReply(), answer: 'One is my guess.'}));
  assert.notEqual(edited.revision, enriched.revision);
  assert.deepEqual(edited.questions[0].explanation, bank.questions[0].explanation);
  assert.deepEqual(applyFriendReplies(enriched, {version: 1, questions: {}}), bank);
});

test('friend replies normalize whitespace and Unicode while supporting either variant independently', () => {
  const bank = convertCsv(rows());
  const question = bank.questions[0];
  const variants = [
    [{answer: '  Cafe\u0301\n  One.  ', hint: '\t Think about\n the first number. '}, {answer: 'Café One.', hint: friendReply().hint}],
    [{answer: '  One. ', hint: null}, {answer: 'One.'}],
    [{hint: '  A clue.\n'}, {hint: 'A clue.'}],
    [{answer: '', hint: 'A clue.'}, {hint: 'A clue.'}],
  ];
  for (const [raw, normalized] of variants) {
    assert.deepEqual(applyFriendReplies(bank, friendCatalogFor(question, raw)).questions[0].friendReply, normalized);
  }
});

test('missing, null and blank friend replies remove old metadata, and unrelated IDs are harmless', () => {
  const original = convertCsv(rows());
  const bank = applyExplanations(original, catalogFor(original.questions[0]));
  const enriched = applyFriendReplies(bank, friendCatalogFor(bank.questions[0]));
  for (const value of [undefined, null, '', ' \n ', {}, {answer: null, hint: undefined}, {answer: ' ', hint: '\t'}]) {
    const catalog = friendCatalogFor(bank.questions[0]);
    catalog.questions[bank.questions[0].id].friendReply = value;
    assert.deepEqual(applyFriendReplies(enriched, catalog), bank);
  }
  const unrelated = friendCatalogFor({...bank.questions[0], id: 'a-question-from-another-pack'});
  assert.deepEqual(applyFriendReplies(bank, unrelated), bank);
});

test('stale friend reply guards warn and remove previously applied replies', () => {
  const bank = convertCsv(rows());
  const question = bank.questions[0];
  const enriched = applyFriendReplies(bank, friendCatalogFor(question));
  for (const changed of [
    {...question, prompt: 'A different prompt?'},
    {...question, choices: ['Two', 'One', 'Three', 'Four']},
    {...question, answer: 1},
  ]) {
    const warnings = [];
    assert.deepEqual(applyFriendReplies(enriched, friendCatalogFor(changed), {warn: (message) => warnings.push(message)}), bank);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Skipping stale friend reply/);
  }
});

test('friend reply catalogs reject malformed payloads, variants and question guards', () => {
  const bank = convertCsv(rows());
  const question = bank.questions[0];
  for (const value of ['A bare reply.', 0, false, [], {answer: 42}, {hint: []}, {answer: {}, hint: 'A valid hint.'}]) {
    assert.throws(() => applyFriendReplies(bank, friendCatalogFor(question, value)), /Friend reply/);
  }
  for (const changed of [
    {...question, prompt: null},
    {...question, choices: ['One', 'Two', 'Three']},
    {...question, choices: ['One', 'Two', 'Three', '']},
    {...question, answer: '0'},
    {...question, answer: 4},
    {...question, answer: 0.5},
  ]) assert.throws(() => applyFriendReplies(bank, friendCatalogFor(changed)), /original prompt, four choices and correct-answer index/);
  for (const catalog of [null, {version: 2, questions: {}}, {version: 1, questions: []}]) {
    assert.throws(() => applyFriendReplies(bank, catalog), /version 1 and a questions object/);
  }
  assert.throws(() => applyFriendReplies(bank, {version: 1, questions: {[question.id]: null}}), /Invalid friend reply entry/);
});

const correctionCatalogFor = (question, correction = {answer: (question.answer + 1) % 4}) => ({
  version: 1,
  questions: {[question.id]: {prompt: question.prompt, choices: question.choices, answer: question.answer, correction}},
});

test('question corrections preserve IDs, choices, source fields and ordering without mutating the source', () => {
  const bank = convertCsv(rows());
  const before = structuredClone(bank);
  const original = bank.questions[0];
  const catalog = correctionCatalogFor(original, {answer: 1, prompt: 'A corrected historical question?'});
  const corrected = applyCorrections(bank, catalog);
  assert.deepEqual(bank, before);
  assert.deepEqual(corrected.questions.slice(1), bank.questions.slice(1));
  assert.deepEqual(corrected.source, bank.source);
  assert.deepEqual(corrected.questions[0], {
    ...original, answer: 1, prompt: 'A corrected historical question?',
    sourceCorrection: {
      original: {prompt: original.prompt, choices: original.choices, answer: original.answer},
      corrected: {prompt: 'A corrected historical question?', choices: original.choices, answer: 1},
    },
  });
  assert.notEqual(corrected.revision, bank.revision);
});

test('corrections reapply, change and remove cleanly from an already corrected offline pack', () => {
  const bank = convertCsv(rows());
  const catalog = correctionCatalogFor(bank.questions[0]);
  const corrected = applyCorrections(bank, catalog);
  assert.deepEqual(applyCorrections(corrected, catalog), corrected);
  const changed = correctionCatalogFor(bank.questions[0], {answer: 2});
  assert.deepEqual(applyCorrections(corrected, changed), applyCorrections(bank, changed));
  assert.deepEqual(applyCorrections(corrected, {version: 1, questions: {}}), bank);
});

test('corrections skip changed source guards and do not restore stale offline history over an edit', () => {
  const bank = convertCsv(rows());
  const original = bank.questions[0];
  const catalog = correctionCatalogFor(original);
  for (const change of [{prompt: 'Changed in the source?'}, {answer: 2}, {choices: ['Two', 'One', 'Three', 'Four']}, {choices: ['One', 'Two', 'Three']}]) {
    const changed = {...bank, questions: [{...original, ...change}, ...bank.questions.slice(1)]};
    const warnings = [];
    assert.deepEqual(applyCorrections(changed, catalog, {warn: (message) => warnings.push(message)}).questions, changed.questions);
    assert.match(warnings[0], /Skipping stale correction/);
  }
  const offline = applyCorrections(bank, catalog);
  const edited = {...offline, questions: [{...offline.questions[0], prompt: 'An offline edit?'}, ...offline.questions.slice(1)]};
  const warnings = [];
  const result = applyCorrections(edited, catalog, {warn: (message) => warnings.push(message)});
  assert.equal(result.questions[0].prompt, 'An offline edit?');
  assert.equal(result.questions[0].sourceCorrection, undefined);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Ignoring stale correction history/);
});

test('correction catalogs reject invalid fields and cannot change identity or choice order', () => {
  const bank = convertCsv(rows());
  const question = bank.questions[0];
  for (const correction of [null, {}, {id: 'another-id'}, {choices: ['Two', 'One', 'Three', 'Four']}, {answer: -1}, {answer: 4}, {answer: '1'}, {prompt: ''}]) {
    assert.throws(() => applyCorrections(bank, correctionCatalogFor(question, correction)), /Correction/);
  }
  for (const catalog of [null, {version: 2, questions: {}}, {version: 1, questions: []}]) {
    assert.throws(() => applyCorrections(bank, catalog), /correction catalog/);
  }
  assert.throws(() => applyCorrections(bank, correctionCatalogFor({...question, choices: ['One', 'One', 'Three', 'Four']})), /four distinct choices/);
  assert.deepEqual(applyCorrections(bank, correctionCatalogFor({...question, id: 'not-in-this-pack'})), bank);
});

const runNode = promisify(execFile);
async function fixtureDirectory(t) {
  const directory = await mkdtemp(resolve('.triviaire-check-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  await mkdir(resolve(directory, 'data/triviaire'), {recursive: true});
  return directory;
}

test('friend catalog reader treats a missing file as empty and reports invalid JSON', async (t) => {
  const directory = await fixtureDirectory(t);
  const path = resolve(directory, FRIEND_REPLIES);
  assert.deepEqual(await readFriendReplies(path), {version: 1, questions: {}});
  const catalog = friendCatalogFor(convertCsv(rows()).questions[0]);
  await writeFile(path, JSON.stringify(catalog));
  assert.deepEqual(await readFriendReplies(path), catalog);
  await writeFile(path, '{invalid JSON');
  await assert.rejects(readFriendReplies(path), /Could not read/);
});

test('correction reader treats a missing file as empty and reports invalid JSON', async (t) => {
  const directory = await fixtureDirectory(t);
  const path = resolve(directory, CORRECTIONS);
  assert.deepEqual(await readCorrections(path), {version: 1, questions: {}});
  const catalog = correctionCatalogFor(convertCsv(rows()).questions[0]);
  await writeFile(path, JSON.stringify(catalog));
  assert.deepEqual(await readCorrections(path), catalog);
  await writeFile(path, '{invalid JSON');
  await assert.rejects(readCorrections(path), /Could not read/);
});

test('explicit CSV import and offline preparation apply corrections before both metadata catalogs', async (t) => {
  const directory = await fixtureDirectory(t);
  const csvDirectory = resolve(directory, 'csv');
  await mkdir(csvDirectory);
  await Promise.all(LEVELS.map((level) => writeFile(resolve(csvDirectory, `Q${level}.csv`), rows(2))));
  const original = convertSheets(new Map(LEVELS.map((level) => [level, rows(2)])));
  const corrections = correctionCatalogFor(original.questions[0], {answer: 1, prompt: 'A corrected historical question?'});
  const corrected = applyCorrections(original, corrections);
  const explanations = catalogFor(corrected.questions[0]);
  const friendReplies = friendCatalogFor(corrected.questions[0]);
  await Promise.all([
    writeFile(resolve(directory, CORRECTIONS), JSON.stringify(corrections)),
    writeFile(resolve(directory, 'data/triviaire/explanations.json'), JSON.stringify(explanations)),
    writeFile(resolve(directory, FRIEND_REPLIES), JSON.stringify(friendReplies)),
  ]);
  const expected = applyFriendReplies(applyExplanations(corrected, explanations), friendReplies);
  const importer = fileURLToPath(new URL('./import-triviaire.mjs', import.meta.url));
  await runNode(process.execPath, [importer, '--input-dir', csvDirectory], {cwd: directory, timeout: 10_000});
  const output = resolve(directory, OUTPUT);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), expected);

  const ensure = fileURLToPath(new URL('./ensure-triviaire.mjs', import.meta.url));
  const noNetwork = 'data:text/javascript,globalThis.fetch=async()=>{throw new Error("Offline fixture")};';
  const prepare = () => runNode(process.execPath, ['--import', noNetwork, ensure], {
    cwd: directory, timeout: 10_000, env: {...process.env, CI: ''},
  });
  await prepare();
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), expected);
  await prepare();
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), expected);

  await rm(resolve(directory, FRIEND_REPLIES));
  await prepare();
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), applyExplanations(corrected, explanations));

  await rm(resolve(directory, CORRECTIONS));
  await prepare();
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), original);
});
