// Seeds locatorStore.json from raw $('...') calls in existing page objects.
// Usage: npx tsx wdio-suite/scripts/seedStore.ts [pageobjectsDir] [--dry-run]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStore, writeStore } from '../e2e/helpers/locatorStore.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dir = args.find((a) => !a.startsWith('--')) ?? 'wdio-suite/e2e/pageobjects';

const MEMBER = /^\s*public\s+(?:async\s+|get\s+)?(\w+)\s*\(/;
const SELECTOR = /(?<!\$)\$\(\s*(['"])(.+?)\1\s*\)/;
const ANY_DOLLAR = /(?<!\$)\$\(/;

const sameQuotes = (s: string) => s.replace(/"/g, "'");
const elementName = (member: string) =>
    member.replace(/^(set|click|get|fill|tap|press)(?=[A-Z])/, '')
        .replace(/^[A-Z]/, (c) => c.toLowerCase())
        .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const store = readStore();
const rows: string[][] = [];

for (const file of readdirSync(dir).filter((f) => f.endsWith('.page.ts'))) {
    const page = file.split('.')[0];
    let member = '';

    readFileSync(join(dir, file), 'utf-8').split('\n').forEach((line, i) => {
        member = line.match(MEMBER)?.[1] ?? member;
        if (!ANY_DOLLAR.test(line)) return;

        const where = `${file}:${i + 1}`;
        const selector = line.match(SELECTOR)?.[2];
        if (!selector) return rows.push([where, line.trim(), 'skipped: dynamic']);

        const covered = Object.values(store.locators).find((e) =>
            [e.selector, ...e.fallbacks].map(sameQuotes).includes(sameQuotes(selector)));
        const id = `${page}.${elementName(member)}`;

        if (covered) rows.push([where, selector, `covered by ${covered.id}`]);
        else if (store.locators[id]) rows.push([where, selector, `skipped: ${id} already exists`]);
        else {
            store.locators[id] = {
                id, selector, fallbacks: [],
                intent: `TODO: describe ${member} on ${page} page`,
                last_verified_at: '', history: [],
            };
            rows.push([where, selector, `added ${id}`]);
        }
    });
}

console.table(rows.map(([file, selector, result]) => ({ file, selector, result })));
console.log("Next: replace these $() calls with locator('<id>') and write a real intent for each TODO.");
if (dryRun) console.log('Dry run: locatorStore.json not written.');
else writeStore(store);
