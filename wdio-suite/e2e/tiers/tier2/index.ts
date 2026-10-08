import { $, browser } from '@wdio/globals';
import type { LocatorEntry } from '../../helpers/locatorStore.js';
import { askGemini } from '../../helpers/gemini.js';
import { appendPending } from '../../helpers/pendingSelectors.js';
import { recordHeal } from '../../helpers/healReport.js';

const MIN_CONFIDENCE = 0.7;

const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        verdict: { type: 'STRING', enum: ['drift', 'defect'], description: 'drift = element still exists but changed; defect = element is missing (a real bug)' },
        selector: { type: 'STRING', description: 'A CSS selector for the element, or "" if not found' },
        confidence: { type: 'NUMBER', description: '0 to 1' },
        reasoning: { type: 'STRING' },
    },
    required: ['verdict', 'selector', 'confidence', 'reasoning'],
};

/** Tier 2 — ask Gemini to find the element in the current DOM from its intent. Never auto-commits.
 *  Gemini also judges drift vs defect: a missing element is a bug to report, not something to heal. */
export async function resolve(entry: LocatorEntry) {
    // Current page markup, minus <script> tags and the demo-only drift banner (it would hint the answer).
    const dom = await browser.execute(() => {
        const body = document.body.cloneNode(true) as HTMLElement;
        body.querySelectorAll('script, #drift-banner').forEach((s) => s.remove());
        return body.innerHTML;
    });

    const proposal = await askGemini<{ verdict: 'drift' | 'defect'; selector: string; confidence: number; reasoning: string }>([{
        text: `A UI test lost track of an element. Find it in the current page and return one CSS selector for it.

Then judge why it was lost:
- "drift": the element is still there, just renamed/restructured (or it lives inside a <canvas> or a custom element's shadow root you cannot see — return that container's selector).
- "defect": nothing on the page serves this intent any more. This is a real bug — do not pick a merely similar element.

Intent: ${entry.intent}
Old selector (no longer matches): ${entry.selector}
Old fallbacks (also no longer match): ${entry.fallbacks.join(', ')}

Current page HTML:
${dom}`,
    }], RESPONSE_SCHEMA);
    if (!proposal) return undefined;
    if (proposal.verdict === 'defect') flagDefect(entry, proposal);
    if (!proposal.selector) return undefined;

    const el = $(proposal.selector);
    if (!(await el.isExisting())) return undefined;

    // A <canvas> or shadow host is a container, not the element: clicking it would be a guess. Leave it to tier 3 (vision).
    if (await browser.execute((node) => node.tagName === 'CANVAS' || !!node.shadowRoot, await el)) return undefined;

    if (proposal.confidence < MIN_CONFIDENCE) flagDefect(entry, proposal);

    const screenshot = await recordHeal(el, {
        id: entry.id,
        tier: 2,
        from: entry.selector,
        to: proposal.selector,
        confidence: proposal.confidence,
        reasoning: proposal.reasoning,
    });

    appendPending({
        id: entry.id,
        tier: 2,
        oldSelector: entry.selector,
        proposed: proposal.selector,
        confidence: proposal.confidence,
        reasoning: proposal.reasoning,
        screenshot,
    });
    return el;
}

/** Refuse to heal: log a ⚠ entry and throw, which stops escalation so tier 3 can't paper over a real bug. */
function flagDefect(entry: LocatorEntry, proposal: { verdict: string; confidence: number; reasoning: string }): never {
    appendPending({
        id: entry.id,
        tier: 2,
        oldSelector: entry.selector,
        proposed: `none (verdict: ${proposal.verdict})`,
        confidence: proposal.confidence,
        reasoning: proposal.reasoning,
        defect: true,
    });
    throw new Error(`locator("${entry.id}"): suspected defect, not healed — ${proposal.reasoning}`);
}
