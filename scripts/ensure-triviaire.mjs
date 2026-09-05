// Build-time conversion of the committed snapshot. Gameplay and builds need no Sheets access.
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {convertCsv, OUTPUT, SNAPSHOT} from './import-triviaire.mjs';
try {
  const bank = convertCsv(await readFile(SNAPSHOT, 'utf8'));
  const content = JSON.stringify(bank, null, 2) + '\n';
  let existing;
  try { existing = await readFile(OUTPUT, 'utf8'); } catch { /* First build. */ }
  if (existing !== content) {
    await mkdir(dirname(OUTPUT), {recursive: true});
    const tmp = `${OUTPUT}.${process.pid}.tmp`;
    await writeFile(tmp, content);
    await rename(tmp, OUTPUT);
    console.log(`Prepared ${bank.questions.length} Triviaire questions from the committed snapshot.`);
  }
} catch (error) {
  console.error('Could not prepare Triviaire questions:', error.message);
  process.exitCode = 1;
}
