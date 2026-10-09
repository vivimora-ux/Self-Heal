import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $, browser } from '@wdio/globals';
import type { ChainablePromiseElement } from 'webdriverio';

const REPORTS_DIR = fileURLToPath(new URL('../../reports/', import.meta.url));
const EVENTS_PATH = `${REPORTS_DIR}heal-events.json`;
const SHOTS_DIR = `${REPORTS_DIR}heal-screenshots/`;

export interface HealEvent {
    id: string;
    tier: number;
    from: string;
    to: string;
    confidence?: number;
    reasoning?: string;
    screenshot?: string; // relative to wdio-suite/reports/
}

/** Which views the tester turned on: HEAL_VIEW=highlight,screenshot,summary,html | all | none */
const raw = process.env.HEAL_VIEW ?? 'highlight,summary';
export const VIEWS = new Set(raw === 'all' ? ['highlight', 'screenshot', 'summary', 'html'] : raw.split(',').map((v) => v.trim()));

const readEvents = (): HealEvent[] => (existsSync(EVENTS_PATH) ? JSON.parse(readFileSync(EVENTS_PATH, 'utf-8')) : []);

type Rect = { x: number; y: number; width: number; height: number };
const AMBER = '#f59e0b';
const PURPLE = '#a855f7';

/** Outline + badge (if a label is given) over an element or screen area; both click-through so they never block the test's next action. */
async function highlight(target: ChainablePromiseElement | Rect, color: string, label = '') {
    const rect = 'then' in target ? await browser.execute((node) => node.getBoundingClientRect().toJSON(), await target) : target;
    await browser.execute((r, color, label) => {
        const box = document.createElement('div');
        box.style.cssText = `position:absolute;left:${r.x + scrollX - 2}px;top:${r.y + scrollY - 2}px;width:${r.width + 4}px;height:${r.height + 4}px;outline:3px solid ${color};pointer-events:none;z-index:9999`;
        document.body.append(box);
        if (!label) return;
        const badge = document.createElement('div');
        badge.textContent = label;
        badge.style.cssText = `position:absolute;left:${r.x + scrollX}px;top:${r.y + scrollY - 28}px;background:${color};color:#fff;font:12px/1 sans-serif;padding:5px 8px;border-radius:4px;pointer-events:none;z-index:9999`;
        document.body.append(badge);
    }, rect, color, label);
}

/** PR impact check (QA_IMPACT_MARKS set): one screenshot per broken locator, showing the real failure
 *  with the old selector (red, crossed out) and Gemini's suggestion (purple outline + label with confidence). */
export async function recordImpactFailure(error: Error | undefined) {
    const marksPath = process.env.QA_IMPACT_MARKS!;
    const marks: Array<{ id: string; from: string; to: string; confidence?: number }> = JSON.parse(readFileSync(marksPath, 'utf-8'));
    const mark = marks.find((m) => String(error?.message).includes(`locator("${m.id}")`));
    if (!mark) return; // only failures caused by a flagged locator
    // Demo-only: a page opened with the ?drift= toggle shows simulated changes, so qaImpact uses it only as a last resort.
    const drifted = (await browser.getUrl()).includes('drift=');
    const shot = `${dirname(marksPath)}/${mark.id}${drifted ? '.drift' : ''}.png`;
    if (existsSync(shot)) return; // once per locator

    // Purple outline on the element Gemini found (if any).
    const el = mark.to ? $(mark.to) : undefined;
    const found = !!el && (await el.isExisting());
    if (found) await highlight(el, PURPLE);
    const at = found ? await browser.execute((node) => node.getBoundingClientRect().toJSON(), await el) : null;
    const conf = mark.confidence !== undefined ? ` · ${Math.round(mark.confidence * 100)}% confident` : '';

    // Labels, stacked to the right of the element so its own caption stays readable (above it if there's no room;
    // top-left of the page if nothing was found): old selector in red, crossed out; AI suggestion in purple.
    await browser.execute((old, suggested, at, purple) => {
        const tag = (bg: string, ...parts: Array<string | Node>) => {
            const t = document.createElement('div');
            t.append(...parts);
            t.style.cssText = `background:${bg};color:#fff;font:12px/1 sans-serif;padding:5px 8px;border-radius:4px;white-space:nowrap`;
            return t;
        };
        const struck = document.createElement('s');
        struck.textContent = old;
        const stack = document.createElement('div');
        stack.style.cssText = 'position:absolute;display:grid;gap:4px;justify-items:start;pointer-events:none;z-index:9999';
        stack.append(tag('#b3322b', '✗ Old (not found): ', struck));
        if (suggested) stack.append(tag(purple, `✓ AI suggests: ${suggested}`));
        document.body.append(stack);

        if (!at) { stack.style.left = `${16 + scrollX}px`; stack.style.top = `${16 + scrollY}px`; return; }
        const roomRight = innerWidth - (at.x + at.width) - 24 >= stack.offsetWidth;
        stack.style.left = `${(roomRight ? at.x + at.width + 12 : at.x) + scrollX}px`;
        stack.style.top = `${(roomRight ? at.y + at.height / 2 - stack.offsetHeight / 2 : at.y - stack.offsetHeight - 8) + scrollY}px`;
    }, mark.from, found ? `${mark.to}${conf}` : '', at, PURPLE);
    await browser.execute((message) => {
        const bar = document.createElement('div');
        bar.textContent = `❌ ${message}`;
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;padding:12px 16px;background:#b3322b;color:#fff;font:14px/1.4 monospace;z-index:2147483647';
        document.body.appendChild(bar);
    }, String(error?.message ?? 'Test failed').split('\n')[0]);
    await browser.saveScreenshot(shot);
}

/** Called by a tier when it heals an element (tiers 1-2) or a screen area (tier 3): highlight it, screenshot it, log it. */
export async function recordHeal(target: ChainablePromiseElement | Rect, event: HealEvent) {
    if (VIEWS.has('highlight') || VIEWS.has('screenshot')) {
        const color = event.tier === 1 ? AMBER : PURPLE;
        const kind = ['', 'Fallback', 'AI', 'AI vision'][event.tier];
        await highlight(target, color, `${kind} · ${event.to}${event.confidence !== undefined ? ` · ${event.confidence}` : ''}`);
    }
    if (VIEWS.has('screenshot')) {
        mkdirSync(SHOTS_DIR, { recursive: true });
        await browser.saveScreenshot(`${SHOTS_DIR}${event.id}.png`);
        event.screenshot = `heal-screenshots/${event.id}.png`;
    }
    if (VIEWS.has('highlight')) await browser.pause(1000);

    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(EVENTS_PATH, JSON.stringify([...readEvents(), event], null, 2));
    return event.screenshot;
}

/** Start of run: forget the previous run's heals and screenshots. */
export function resetHealEvents() {
    rmSync(EVENTS_PATH, { force: true });
    rmSync(SHOTS_DIR, { recursive: true, force: true });
}

/** End of run: colored table in the terminal. */
export function printSummary() {
    const events = readEvents();
    if (!events.length) return;
    const color = (tier: number, s: string) => `\x1b[${tier === 1 ? 33 : 35}m${s}\x1b[0m`;
    console.log('\n\x1b[1mHealed selectors — review before updating page objects\x1b[0m');
    for (const e of events) {
        const conf = e.confidence !== undefined ? `  (${e.confidence})` : '';
        console.log(color(e.tier, `  [tier ${e.tier}] ${e.id.padEnd(24)} ${e.from}  →  ${e.to}${conf}`));
    }
    console.log('');
}

/** End of run: one card per healed element in reports/heal-report.html. */
export function writeHtmlReport() {
    const events = readEvents();
    if (!events.length) return;
    const esc = (s = '') => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const cards = events.map((e) => `
<section style="border-left:6px solid ${e.tier === 1 ? '#f59e0b' : '#a855f7'}">
  <h2>${esc(e.id)} <small>tier ${e.tier} · ${['', 'fallback', 'AI suggestion', 'AI vision'][e.tier]}</small></h2>
  <p><del>${esc(e.from)}</del> → <code>${esc(e.to)}</code></p>
  ${e.confidence !== undefined ? `<p>Confidence <meter value="${e.confidence}"></meter> ${e.confidence}</p>` : ''}
  ${e.reasoning ? `<p>${esc(e.reasoning)}</p>` : ''}
  ${e.screenshot ? `<img src="${e.screenshot}" alt="${esc(e.id)}">` : ''}
</section>`).join('');
    writeFileSync(`${REPORTS_DIR}heal-report.html`, `<!doctype html><title>Heal report</title>
<style>body{font:15px sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem}section{padding:.5rem 1rem;margin:1rem 0;background:#f6f6f8}img{max-width:100%;border:1px solid #ccc}small{color:#666;font-weight:normal}del{color:#b91c1c}</style>
<h1>Heal report</h1><p>${events.length} selector(s) healed — ${new Date().toLocaleString()}</p>${cards}`);
    console.log(`Heal report: ${REPORTS_DIR}heal-report.html`);
}
