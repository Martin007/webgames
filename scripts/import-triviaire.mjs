#!/usr/bin/env node
// No spreadsheet SDK or API key required. Never silently replace a good pack with bad data.
import {createHash} from 'node:crypto';
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1-SYaM0xz_f7YLtMnIk6WkyDa78JOsk-mJD37diF-Vuc/edit?gid=599441168';
export const CSV_URL = 'https://docs.google.com/spreadsheets/d/1-SYaM0xz_f7YLtMnIk6WkyDa78JOsk-mJD37diF-Vuc/export?format=csv&gid=599441168';
export const SNAPSHOT = 'data/triviaire/source.csv';
export const OUTPUT = 'public/games/triviaire/questions.json';

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
export function convertCsv(text) {
  if (/^\s*<!doctype|^\s*<html/i.test(text)) throw new Error('Google returned an HTML page, not a CSV. Check sheet sharing.');
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The sheet is empty.');
  const header = rows[0].map(norm);
  const columns = ['question', 'a', 'b', 'c', 'd', 'correct'].map((h) => header.indexOf(h));
  if (columns.some((i) => i < 0)) throw new Error('Required columns: Question, A, B, C, D, Correct.');
  const seen = new Map(); const questions = []; const duplicates = []; const excludedRows = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; const values = columns.map((c) => clean(r[c]));
    const [prompt, ...rest] = values; const choices = rest.slice(0, 4); const answer = 'ABCD'.indexOf(values[5].toUpperCase());
    if (!prompt || choices.some((c) => !c) || answer < 0 || values[5].length !== 1 || new Set(choices.map(norm)).size !== 4) {
      throw new Error(`Invalid question/choices/correct answer on row ${i + 1}. No files were written.`);
    }
    // Quarantine truncated prompts while retaining the untouched source snapshot.
    if (prompt.length < 8) {
      excludedRows.push({row: i + 1, reason: 'Incomplete prompt (fewer than 8 characters).'});
      continue;
    }
    const previous = seen.get(norm(prompt));
    if (previous) {
      if (norm(previous.choices[previous.answer]) !== norm(choices[answer])) throw new Error(`Conflicting correct answers on rows ${previous.sourceRows[0]} and ${i + 1}.`);
      previous.sourceRows.push(i + 1); duplicates.push(i + 1); continue;
    }
    // IDs remain stable when rows or answer columns are reordered.
    const q = {id: `t-${digest(norm(prompt)).slice(0, 16)}`, prompt, choices, answer, sourceRows: [i + 1]};
    // The supplied sheet has two unnamed provenance columns. Preserve them.
    if (clean(r[6])) q.source = clean(r[6]);
    if (clean(r[7])) q.contributor = clean(r[7]);
    seen.set(norm(prompt), q); questions.push(q);
  }
  if (questions.length < 15) throw new Error('At least 15 unique questions are required.');
  const revision = digest(JSON.stringify(questions)).slice(0, 16);
  return {version: 1, revision, source: {url: SHEET_URL, gid: '599441168', rows: rows.length - 1,
    duplicatesRemoved: duplicates.length, duplicateRows: duplicates, excludedRows, difficulty: 'unrated'}, questions};
}
export async function main(args = process.argv.slice(2)) {
  let input = null; let output = OUTPUT;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--input' || args[i] === '--output') && args[i + 1]) {
      if (args[i] === '--input') input = args[++i]; else output = args[++i];
    } else throw new Error('Usage: node scripts/import-triviaire.mjs [--input sheet.csv] [--output pack.json]');
  }
  let csv;
  if (input) csv = await readFile(resolve(input), 'utf8');
  else {
    const response = await fetch(CSV_URL, {signal: AbortSignal.timeout(30_000)});
    if (!response.ok) throw new Error(`Sheet download failed (${response.status}). Export it as CSV and use --input.`);
    csv = await response.text();
  }
  const bank = convertCsv(csv);
  output = resolve(output);
  await mkdir(dirname(output), {recursive: true});
  const tmp = `${output}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(bank, null, 2) + '\n');
  await rename(tmp, output);
  // Keep a versioned source snapshot for reproducible, network-free builds.
  if (output === resolve(OUTPUT) && resolve(input ?? '') !== resolve(SNAPSHOT)) {
    await mkdir(dirname(SNAPSHOT), {recursive: true});
    const sourceTmp = `${SNAPSHOT}.${process.pid}.tmp`;
    await writeFile(sourceTmp, csv);
    await rename(sourceTmp, SNAPSHOT);
  }
  console.log(`Imported ${bank.questions.length} unique questions from ${bank.source.rows} rows; removed ${bank.source.duplicatesRemoved} duplicates; excluded ${bank.source.excludedRows.length} incomplete prompts. Revision: ${bank.revision}.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
