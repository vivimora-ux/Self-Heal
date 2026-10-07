import { $, browser } from '@wdio/globals';
import type { LocatorEntry } from '../../helpers/locatorStore.js';
import { askGemini } from '../../helpers/gemini.js';
import { appendPending } from '../../helpers/pendingSelectors.js';
import { recordHeal } from '../../helpers/healReport.js';

const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        selector: { type: 'STRING', description: 'A CSS selector for the element, or "" if not found' },
        confidence: { type: 'NUMBER', description: '0 to 1' },
        reasoning: { type: 'STRING' },
    },
    required: ['selector', 'confidence', 'reasoning'],
};

/** Tier 2 — ask Gemini to find the element in the current DOM from its intent. Never auto-commits. */
export async function resolve(entry: LocatorEntry) {
    // Current page markup, minus <script> tags and the demo-only drift banner (it would hint the answer).
    const dom = await browser.execute(() => {
        const body = document.body.cloneNode(true) as HTMLElement;
        body.querySelectorAll('script, #drift-banner').forEach((s) => s.remove());
        return body.innerHTML;
    });

    const proposal = await askGemini<{ selector: string; confidence: number; reasoning: string }>([{
        text: `A UI test lost track of an element. Find it in the current page and return one CSS selector for it.

Intent: ${entry.intent}
Old selector (no longer matches): ${entry.selector}
Old fallbacks (also no longer match): ${entry.fallbacks.join(', ')}

Current page HTML:
${dom}`,
    }], RESPONSE_SCHEMA);
    if (!proposal?.selector) return undefined;

    const el = $(proposal.selector);
    if (!(await el.isExisting())) return undefined;

    // A <canvas> or shadow host is a container, not the element: clicking it would be a guess. Leave it to tier 3 (vision).
    if (await browser.execute((node) => node.tagName === 'CANVAS' || !!node.shadowRoot, await el)) return undefined;

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
