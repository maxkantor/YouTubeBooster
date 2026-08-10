#!/usr/bin/env node
/** Append a markdown experiment stub to docs/growth/EXPERIMENT-LOG.md (stdin JSON or args). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.join(__dirname, '../../docs/growth/EXPERIMENT-LOG.md');

const id = process.argv[2] || `EXP-${Date.now()}`;
const title = process.argv[3] || 'Untitled experiment';
const date = new Date().toISOString().slice(0, 10);

const block = `
### ${date} — ${id} ${title}

| Field | Value |
|-------|--------|
| Status | draft |
| Evidence | |
| Hypothesis | |
| Exact change | |
| Primary metric | |
| Guardrail metric | |
| Baseline | |
| Target | |
| Evaluation date | |
| Stop rule | |
| Rollback procedure | |
| Commit | |
| Amplify | |

`;

fs.appendFileSync(logPath, block);
console.log(`Appended ${id} to ${logPath}`);
