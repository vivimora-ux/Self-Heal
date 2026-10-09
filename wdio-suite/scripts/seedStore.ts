// Seeds locatorStore.json from raw $('...') calls in existing page objects.
// Usage: npx tsx wdio-suite/scripts/seedStore.ts [pageobjectsDir] [--dry-run]
import { readStore, writeStore } from '../e2e/helpers/locatorStore.js';
import { sameQuotes, scanPageObjects } from '../e2e/helpers/pageObjectScan.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dir = args.find((a) => !a.startsWith('--')) ?? 'wdio-suite/e2e/pageobjects';

const store = readStore();
const rows: string[][] = [];

for (const { file, line, page, member, id, selector, code } of scanPageObjects(dir)) {
    const where = `${file}:${line}`;
    if (!selector) { rows.push([where, code, 'skipped: dynamic']); continue; }

    const covered = Object.values(store.locators).find((e) =>
        [e.selector, ...e.fallbacks].map(sameQuotes).includes(sameQuotes(selector)));

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
}

console.table(rows.map(([file, selector, result]) => ({ file, selector, result })));
console.log("Next: replace these $() calls with locator('<id>') and write a real intent for each TODO.");
if (dryRun) console.log('Dry run: locatorStore.json not written.');
else writeStore(store);
