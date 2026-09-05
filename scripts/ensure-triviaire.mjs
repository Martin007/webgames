// Prefer committed Q1-Q15 snapshots. Until they exist, refresh from the public sheet at build time.
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {convertSheets, fetchSheets, OUTPUT, readSnapshots} from './import-triviaire.mjs';

async function writePack(bank) {
  const content = JSON.stringify(bank, null, 2) + '\n';
  let existing;
  try { existing = await readFile(OUTPUT, 'utf8'); } catch { /* First build. */ }
  if (existing === content) return;
  await mkdir(dirname(OUTPUT), {recursive: true});
  const tmp = `${OUTPUT}.${process.pid}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, OUTPUT);
}

try {
  let bank;
  try {
    bank = convertSheets(await readSnapshots());
    console.log('Preparing Triviaire from committed Q1-Q15 snapshots.');
  } catch (snapshotError) {
    try {
      bank = convertSheets(await fetchSheets());
      console.log('Q1-Q15 snapshots are not committed yet; prepared Triviaire from the live supplied sheet. Run npm run import:triviaire to snapshot all tabs.');
    } catch (fetchError) {
      if (process.env.CI) throw new Error(`Could not fetch all Q1-Q15 tabs in CI: ${fetchError.message}`);
      // Keep local/offline development usable during the migration. The engine understands the legacy flat pack.
      const existing = await readFile(OUTPUT, 'utf8');
      JSON.parse(existing);
      console.warn(`Could not refresh Q1-Q15 (${fetchError.message}). Using the existing pack. Snapshot error: ${snapshotError.message}`);
      process.exit(0);
    }
  }
  await writePack(bank);
  console.log(`Prepared ${bank.questions.length} Triviaire questions across Q1-Q15.`);
} catch (error) {
  console.error('Could not prepare Triviaire questions:', error.message);
  process.exitCode = 1;
}
