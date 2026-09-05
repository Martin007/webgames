#!/usr/bin/env node
// Import all 15 difficulty tabs from the supplied Google Sheet.
import {createHash} from 'node:crypto';
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const SHEET_ID = '1-SYaM0xz_f7YLtMnIk6WkyDa78JOsk-mJD37diF-Vuc';
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
export const LEGACY_SHEET_URL = `${SHEET_URL}?gid=599441168`;
export const LEVELS = Array.from({length: 15}, (_, i) => i + 1);
export const SNAPSHOT = 'data/triviaire/source.csv';
export const SNAPSHOT_DIR = 'data/triviaire';
export const OUTPUT = 'public/games/triviaire/questions.json';
export const snapshotPath = (level) => `${SNAPSHOT_DIR}/Q${level}.csv`;
export const sheetCsvUrl = (level) => `${SHEET_URL.replace('/edit', '')}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(`Q${level}`)}&headers=0`;

/** RFC 4180-style CSV, including BOM, CRLF, quoted commas/newlines and escaped quotes. */
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = []; let cell = ''; let quoted = false; let closed = false;
  const endCell = () => { row.push(cell); cell = ''; closed = false; };
  const endRow = () => { endCell(); if (row.some((v) => v.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else cell += ch;
    } else if (ch === '"') {
      if (cell || closed) throw new Error('Unexpected quote in CSV.');
      quoted = true;
    } else if (ch === ',') endCell();
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else if (closed) { if (!/\s/.test(ch)) throw new Error('Text after closing CSV quote.'); }
    else cell += ch;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (cell || row.length || closed) endRow();
  return rows;
}
const clean = (s) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
const norm = (s) => clean(s).toLowerCase();
const digest = (s) => createHash('sha256').update(s).digest('hex');
const validLevel = (level) => Number.isInteger(level) && level >= 1 && level <= 15;
const REQUIRED_FIELDS = ['question', 'a', 'b', 'c', 'd', 'correct'];

function parseQuestionRows(text, label, makeId, level) {
  if (/^\s*<!doctype|^\s*<html/i.test(text)) throw new Error(`Google returned an HTML page for ${label}, not a CSV. Check sheet sharing.`);
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error(`${label} is empty.`);

  const seen = new Map(); const questions = []; const duplicates = []; const excludedRows = [];
  const addQuestion = ({prompt, choices, correct, sourceRows, source, contributor, location}) => {
    prompt = clean(prompt); choices = choices.map(clean); correct = clean(correct).toUpperCase();
    const answer = 'ABCD'.indexOf(correct);
    if (!prompt || choices.some((c) => !c) || answer < 0 || correct.length !== 1 || new Set(choices.map(norm)).size !== 4) {
      throw new Error(`Invalid question/choices/correct answer at ${label} ${location}. No files were written.`);
    }
    if (prompt.length < 8) {
      excludedRows.push({row: sourceRows[0], reason: 'Incomplete prompt (fewer than 8 characters).'});
      return;
    }
    const previous = seen.get(norm(prompt));
    if (previous) {
      if (norm(previous.choices[previous.answer]) !== norm(choices[answer])) throw new Error(`Conflicting correct answers for "${prompt}" in ${label}.`);
      previous.sourceRows.push(...sourceRows.filter((n) => !previous.sourceRows.includes(n))); duplicates.push(sourceRows[0]); return;
    }
    const q = {id: makeId(prompt), ...(level ? {level} : {}), prompt, choices, answer, sourceRows};
    if (clean(source)) q.source = clean(source);
    if (clean(contributor)) q.contributor = clean(contributor);
    seen.set(norm(prompt), q); questions.push(q);
  };

  // Newer tabs/exports may use one question per row with a conventional header.
  const header = rows[0].map(norm);
  const columns = REQUIRED_FIELDS.map((h) => header.indexOf(h));
  if (columns.every((i) => i >= 0)) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      addQuestion({
        prompt: r[columns[0]], choices: columns.slice(1, 5).map((c) => r[c]), correct: r[columns[5]],
        sourceRows: [i + 1], source: r[6], contributor: r[7], location: `row ${i + 1}`,
      });
    }
    return {rows: rows.length - 1, duplicates, excludedRows, questions};
  }

  // The original workbook stores the main bank transposed: field names down column A,
  // with each question occupying a column. Newer questions are appended row-wise below it.
  const fieldRows = new Map();
  const fieldIndexes = new Set();
  for (let i = 0; i < rows.length; i++) {
    const key = norm(rows[i][0]);
    const canonical = key === 'question source' || key === 'source' ? 'source' : key;
    if ([...REQUIRED_FIELDS, 'source', 'contributor'].includes(canonical) && !fieldRows.has(canonical)) {
      fieldRows.set(canonical, rows[i]); fieldIndexes.add(i);
    }
  }
  if (REQUIRED_FIELDS.some((field) => !fieldRows.has(field))) {
    const preview = rows.slice(0, 3).map((row) => row.slice(0, 8).map(clean).join(' | ')).join(' / ');
    throw new Error(`Could not find the ${label} question fields. First rows: ${preview}`);
  }

  const maxColumns = Math.max(...REQUIRED_FIELDS.map((field) => fieldRows.get(field).length));
  for (let column = 1; column < maxColumns; column++) {
    const prompt = fieldRows.get('question')[column];
    const choices = ['a', 'b', 'c', 'd'].map((field) => fieldRows.get(field)[column]);
    const correct = fieldRows.get('correct')[column];
    const core = [prompt, ...choices, correct].map(clean);
    if (core.every((value) => !value)) continue;
    addQuestion({
      prompt, choices, correct, sourceRows: [column + 1],
      source: fieldRows.get('source')?.[column], contributor: fieldRows.get('contributor')?.[column],
      location: `column ${column + 1}`,
    });
  }

  // Also ingest any normal row-oriented records appended below the transposed block.
  for (let i = 0; i < rows.length; i++) {
    if (fieldIndexes.has(i)) continue;
    const r = rows[i];
    const firstSix = r.slice(0, 6).map(clean);
    if (firstSix.length < 6 || !firstSix[0] || !/^[ABCD]$/i.test(firstSix[5])) continue;
    addQuestion({
      prompt: r[0], choices: r.slice(1, 5), correct: r[5], sourceRows: [i + 1],
      source: r[6], contributor: r[7], location: `row ${i + 1}`,
    });
  }
  return {rows: rows.length, duplicates, excludedRows, questions};
}

/** Legacy single-tab conversion retained for old snapshots/tests and offline fallback. */
export function convertCsv(text) {
  const parsed = parseQuestionRows(text, 'sheet', (prompt) => `t-${digest(norm(prompt)).slice(0, 16)}`);
  if (parsed.questions.length < 15) throw new Error('At least 15 unique questions are required.');
  const revision = digest(JSON.stringify(parsed.questions)).slice(0, 16);
  return {version: 1, revision, source: {url: LEGACY_SHEET_URL, rows: parsed.rows,
    duplicatesRemoved: parsed.duplicates.length, duplicateRows: parsed.duplicates, excludedRows: parsed.excludedRows, difficulty: 'unrated'}, questions: parsed.questions};
}

/** Convert one Q1-Q15 tab while preserving its intended difficulty level. */
export function convertLevelCsv(text, level) {
  if (!validLevel(level)) throw new Error('Difficulty level must be Q1 through Q15.');
  const parsed = parseQuestionRows(text, `Q${level}`, (prompt) => `t-q${level}-${digest(norm(prompt)).slice(0, 16)}`, level);
  if (!parsed.questions.length) throw new Error(`Q${level} has no usable questions.`);
  return {level, name: `Q${level}`, rows: parsed.rows, duplicatesRemoved: parsed.duplicates.length,
    duplicateRows: parsed.duplicates, excludedRows: parsed.excludedRows, questions: parsed.questions};
}

/** Merge all 15 tabs into one level-aware pack. */
export function convertSheets(csvByLevel) {
  const sheets = LEVELS.map((level) => {
    const text = csvByLevel instanceof Map ? csvByLevel.get(level) : csvByLevel?.[level];
    if (typeof text !== 'string') throw new Error(`Missing Q${level} CSV.`);
    return convertLevelCsv(text, level);
  });
  const questions = sheets.flatMap((sheet) => sheet.questions);
  if (new Set(questions.map((q) => q.id)).size !== questions.length) throw new Error('Generated duplicate question IDs across difficulty tabs.');
  const revision = digest(JSON.stringify(questions)).slice(0, 16);
  return {version: 1, revision, source: {url: SHEET_URL,
    rows: sheets.reduce((sum, sheet) => sum + sheet.rows, 0),
    duplicatesRemoved: sheets.reduce((sum, sheet) => sum + sheet.duplicatesRemoved, 0),
    excludedRows: sheets.flatMap((sheet) => sheet.excludedRows.map((item) => ({level: sheet.level, ...item}))),
    difficulty: 'Q1-Q15',
    sheets: sheets.map(({level, name, rows, duplicatesRemoved, excludedRows, questions}) => ({level, name, rows, duplicatesRemoved, excludedRows: excludedRows.length, questions: questions.length}))},
    questions};
}

export async function fetchSheets() {
  const entries = await Promise.all(LEVELS.map(async (level) => {
    const response = await fetch(sheetCsvUrl(level), {signal: AbortSignal.timeout(30_000)});
    if (!response.ok) throw new Error(`Q${level} download failed (${response.status}).`);
    return [level, await response.text()];
  }));
  return new Map(entries);
}
export async function readSnapshots() {
  return new Map(await Promise.all(LEVELS.map(async (level) => [level, await readFile(resolve(snapshotPath(level)), 'utf8')])));
}
async function writeAtomic(path, content) {
  path = resolve(path); await mkdir(dirname(path), {recursive: true});
  const tmp = `${path}.${process.pid}.tmp`; await writeFile(tmp, content); await rename(tmp, path);
}
export async function main(args = process.argv.slice(2)) {
  let inputDir = null; let output = OUTPUT;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--input-dir' || args[i] === '--output') && args[i + 1]) {
      if (args[i] === '--input-dir') inputDir = args[++i]; else output = args[++i];
    } else throw new Error('Usage: node scripts/import-triviaire.mjs [--input-dir directory-with-Q1.csv..Q15.csv] [--output pack.json]');
  }
  const csvByLevel = inputDir
    ? new Map(await Promise.all(LEVELS.map(async (level) => [level, await readFile(resolve(inputDir, `Q${level}.csv`), 'utf8')])))
    : await fetchSheets();
  const bank = convertSheets(csvByLevel);
  await writeAtomic(output, JSON.stringify(bank, null, 2) + '\n');
  if (!inputDir && resolve(output) === resolve(OUTPUT)) await Promise.all(LEVELS.map((level) => writeAtomic(snapshotPath(level), csvByLevel.get(level))));
  console.log(`Imported ${bank.questions.length} questions across Q1-Q15 from ${bank.source.rows} rows; removed ${bank.source.duplicatesRemoved} within-tab duplicates; excluded ${bank.source.excludedRows.length} incomplete prompts. Revision: ${bank.revision}.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
