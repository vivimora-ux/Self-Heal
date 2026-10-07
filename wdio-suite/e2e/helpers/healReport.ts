import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { browser } from '@wdio/globals';
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

/** Called by a tier when it heals an element: highlight it, screenshot it, and log the event. */
export async function recordHeal(el: ChainablePromiseElement, event: HealEvent) {
    if (VIEWS.has('highlight') || VIEWS.has('screenshot')) {
        const color = event.tier === 1 ? '#f59e0b' : '#a855f7';
        const label = `${event.tier === 1 ? 'Fallback' : 'AI'} · ${event.to}${event.confidence !== undefined ? ` · ${event.confidence}` : ''}`;
        await browser.execute((node, color, label) => {
            const r = node.getBoundingClientRect();
            node.style.outline = `3px solid ${color}`;
            node.style.outlineOffset = '2px';
            const badge = document.createElement('div');
            badge.textContent = label;
            badge.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.top + scrollY - 26}px;background:${color};color:#fff;font:12px/1 sans-serif;padding:5px 8px;border-radius:4px;z-index:9999`;
            document.body.appendChild(badge);
        }, await el, color, label);
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
  <h2>${esc(e.id)} <small>tier ${e.tier} · ${e.tier === 1 ? 'fallback' : 'AI suggestion'}</small></h2>
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
