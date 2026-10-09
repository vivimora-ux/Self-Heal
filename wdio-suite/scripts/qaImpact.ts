// PR impact check: "Do these changes affect any of our existing tests?" If yes, open a QA ticket.
// Usage: npx tsx wdio-suite/scripts/qaImpact.ts <baseRef>   (e.g. main, origin/main)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { askGemini } from '../e2e/helpers/gemini.js';
import { readStore } from '../e2e/helpers/locatorStore.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const base = process.argv[2] ?? 'main';
const PO_DIR = 'wdio-suite/e2e/pageobjects';
const SPEC_DIR = 'wdio-suite/e2e/specs';
const REPORT = 'wdio-suite/reports/qa-impact.md';
const pr = process.env.PR_NUMBER;

// 1. What changed in the app code
const diff = execFileSync('git', ['diff', `${base}...HEAD`, '--', 'demo-app/'], { encoding: 'utf-8' });
if (!diff.trim()) { console.log('No app changes, no QA impact.'); process.exit(0); }

// 2. Test inventory: locator id -> page objects -> specs (no AI)
const read = (dir: string) => readdirSync(dir).map((f) => ({ f, src: readFileSync(`${dir}/${f}`, 'utf-8') }));
const pageObjects = read(PO_DIR);
const specs = read(SPEC_DIR);
const inventory = Object.values(readStore().locators).map(({ id, selector, intent }) => {
    const pos = pageObjects.filter((p) => p.src.includes(`locator('${id}')`)).map((p) => p.f);
    const usedBy = specs.filter((s) => pos.some((po) => s.src.includes(`/pageobjects/${po.replace('.ts', '.js')}`))).map((s) => s.f);
    return { id, selector, intent, specs: usedBy };
});

// 3. Cheap rule check: a stored selector's value appears on a removed line of the diff
const removed = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).join('\n');
const keyValue = (selector: string) => selector.match(/['"]([^'"]+)['"]/)?.[1] ?? selector.match(/#([\w-]+)/)?.[1];
const hints = inventory.filter((i) => { const v = keyValue(i.selector); return v && removed.includes(v); });

// 4. Ask the AI agent
interface Item { locator_id: string; what_changed: string; old_selector: string; suggested_selector: string; affected_specs: string[]; severity: string; confidence?: number; reasoning: string }
const SCHEMA = {
    type: 'OBJECT',
    properties: {
        impacted: { type: 'BOOLEAN' },
        summary: { type: 'STRING' },
        items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            locator_id: { type: 'STRING' }, what_changed: { type: 'STRING' }, old_selector: { type: 'STRING' },
            suggested_selector: { type: 'STRING', description: 'New selector, or "" if the element was removed' },
            affected_specs: { type: 'ARRAY', items: { type: 'STRING' } },
            severity: { type: 'STRING', enum: ['breaks', 'review'], description: 'breaks = selector no longer matches; review = still matches but label/behaviour changed' },
            confidence: { type: 'NUMBER', description: '0 to 1: how sure you are the suggested selector is the same element' },
            reasoning: { type: 'STRING' },
        }, required: ['locator_id', 'what_changed', 'old_selector', 'suggested_selector', 'affected_specs', 'severity', 'confidence', 'reasoning'] } },
    },
    required: ['impacted', 'summary', 'items'],
};
const ruleResult = { impacted: hints.length > 0, summary: 'Rule check only (Gemini not available).', items: hints.map((h): Item => ({
    locator_id: h.id, what_changed: 'Selector value removed in this PR', old_selector: h.selector,
    suggested_selector: '', affected_specs: h.specs, severity: 'breaks', reasoning: 'Text rule match' })) };
const result = !process.env.GEMINI_API_KEY ? ruleResult : await askGemini<typeof ruleResult>([{
        text: `You review pull requests for a QA team. Do these code changes affect any of our existing UI tests?
Only report a locator if the change makes its selector stop matching, or changes the element's label/behaviour a test may rely on.

Existing test locators (id, selector, intent, specs that use it):
${JSON.stringify(inventory, null, 2)}

A simple text rule flagged these as likely impacted: ${hints.map((h) => h.id).join(', ') || 'none'}

PR diff:
${diff.slice(0, 60_000)}`,
    }], SCHEMA).catch((e) => { console.warn(`Gemini failed, using rule check: ${e.message}`); return ruleResult; });

if (!result?.impacted || !result.items.length) {
    console.log(`No test impact found. ${result?.summary ?? ''}`);
    comment('✅ **QA impact check:** no test impact found.');
    process.exit(0);
}

// 5. Screenshot the real failure: run the affected specs with healing off. The afterTest hook highlights
//    Gemini's suggested selector (old → new, confidence) on the failing page — one image per locator.
const SHOTS = 'wdio-suite/reports/qa-impact/';
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const marks = result.items.map((i) => ({ id: i.locator_id, from: i.old_selector, to: i.suggested_selector, confidence: i.confidence }));
writeFileSync(`${SHOTS}marks.json`, JSON.stringify(marks));

const specsToRun = [...new Set(result.items.flatMap((i) => i.affected_specs))].filter((s) => existsSync(`${SPEC_DIR}/${s}`));
spawnSync('npx', ['wdio', 'run', './wdio.conf.ts', ...specsToRun.flatMap((s) => ['--spec', `${SPEC_DIR}/${s}`])], {
    stdio: 'inherit',
    env: { ...process.env, HEALING: 'off', HEADLESS: '1', HEAL_VIEW: 'none', QA_IMPACT_MARKS: resolve(`${SHOTS}marks.json`) },
});
// One image per locator: prefer the clean page over a demo ?drift= page (<id>.drift.png).
const pngs = readdirSync(SHOTS).filter((f) => f.endsWith('.png'));
const screenshots = pngs.filter((f) => !f.endsWith('.drift.png') || !pngs.includes(f.replace('.drift.png', '.png'))).map((f) => SHOTS + f);

// 6. Write the ticket, create it in Jira if configured (with the screenshot), comment on the PR
const body = [
    `QA impact check${pr ? ` for PR #${pr}` : ''}: ${result.items.length} test selector(s) affected`, '',
    result.summary, '',
    ...result.items.map((i) => [
        `- ${i.severity === 'breaks' ? '❌ breaks' : '⚠ review'}: ${i.locator_id}`,
        `  - What changed: ${i.what_changed}`,
        `  - Old selector: ${i.old_selector}`,
        `  - Suggested selector: ${i.suggested_selector || 'none (element removed?)'}`,
        `  - Confidence: ${i.confidence !== undefined ? `${Math.round(i.confidence * 100)}%` : 'n/a (rule check)'}`,
        `  - Affected specs: ${i.affected_specs.join(', ') || 'unknown'}`,
        `  - Reasoning: ${i.reasoning}`,
    ].join('\n')),
    '', `Screenshots (${screenshots.length}): the real test failure with healing off, Gemini's suggested selector highlighted in purple.`,
].join('\n');

const ticket = await createJiraTicket(`QA: ${pr ? `PR #${pr}` : 'PR'} affects ${result.items.length} test selector(s)`, body, screenshots);
const full = `${body}\n\n${ticket ? `Jira: ${ticket}` : 'Dry run: Jira not configured, no ticket created.'}\n`;
mkdirSync('wdio-suite/reports', { recursive: true });
writeFileSync(REPORT, full);
console.log(full);
comment(full);

async function createJiraTicket(summary: string, description: string, files: string[]) {
    const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = process.env;
    const missing = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY'].filter((k) => !process.env[k]);
    if (missing.length) { console.warn(`Jira not configured, missing: ${missing.join(', ')}`); return undefined; }
    if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) return undefined;
    const site = JIRA_BASE_URL.replace(/\/+$/, '');
    const authorization = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`;
    const res = await fetch(`${site}/rest/api/2/issue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization },
        body: JSON.stringify({ fields: {
            project: { key: JIRA_PROJECT_KEY }, issuetype: { name: 'Task' }, labels: ['qa-impact'], summary, description,
        } }),
    });
    if (!res.ok) { console.warn(`Jira ${res.status}: ${await res.text()}`); return undefined; }
    const { key } = await res.json();

    // Attach screenshots (Jira needs the no-check header on uploads)
    if (files.length) {
        const form = new FormData();
        for (const f of files) form.append('file', new Blob([readFileSync(f)], { type: 'image/png' }), f.split('/').pop());
        const up = await fetch(`${site}/rest/api/2/issue/${key}/attachments`, {
            method: 'POST', headers: { authorization, 'X-Atlassian-Token': 'no-check' }, body: form,
        });
        if (!up.ok) console.warn(`Jira attachments ${up.status}: ${await up.text()}`);
    }
    return `${site}/browse/${key}`;
}

function comment(text: string) {
    if (process.env.GITHUB_ACTIONS && pr) execFileSync('gh', ['pr', 'comment', pr, '--body', text]);
}
