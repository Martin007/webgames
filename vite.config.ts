import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';

const questionsAsset = (): Plugin => ({
  name: 'feudle-questions-asset',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'questions.json',
      source: readFileSync(resolve(process.cwd(), 'questions.json')),
    });
  },
});

export default defineConfig({
  base: './',
  plugins: [react(), questionsAsset()],
});
