import { $, browser } from '@wdio/globals';
import type { LocatorEntry } from '../../helpers/locatorStore.js';
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

    // Plain fetch to the Gemini REST API. Fail fast (30s) so a slow call does not stall the run.
    const model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
            generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
            contents: [{
                parts: [{
                    text: `A UI test lost track of an element. Find it in the current page and return one CSS selector for it.

Intent: ${entry.intent}
Old selector (no longer matches): ${entry.selector}
Old fallbacks (also no longer match): ${entry.fallbacks.join(', ')}

Current page HTML:
${dom}`,
                }],
            }],
        }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return undefined;

    const proposal = JSON.parse(text) as { selector: string; confidence: number; reasoning: string };
    if (!proposal.selector) return undefined;

    const el = $(proposal.selector);
    if (!(await el.isExisting())) return undefined;

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
