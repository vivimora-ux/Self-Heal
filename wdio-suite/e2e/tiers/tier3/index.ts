import { browser } from '@wdio/globals';
import type { LocatorEntry } from '../../helpers/locatorStore.js';
import { askGemini } from '../../helpers/gemini.js';
import { appendPending } from '../../helpers/pendingSelectors.js';
import { recordHeal } from '../../helpers/healReport.js';

const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        box_2d: { type: 'ARRAY', items: { type: 'INTEGER' }, description: '[ymin, xmin, ymax, xmax] normalized to 0-1000, or [] if not visible' },
        confidence: { type: 'NUMBER', description: '0 to 1' },
        reasoning: { type: 'STRING' },
    },
    required: ['box_2d', 'confidence', 'reasoning'],
};

/** Tier 3 — screenshot the page and ask Gemini where the element is. Never auto-commits. */
export async function resolve(entry: LocatorEntry) {
    const proposal = await askGemini<{ box_2d: number[]; confidence: number; reasoning: string }>([
        { text: `A UI test can't reach this element through the DOM. Find it in the screenshot and return its bounding box.\n\nIntent: ${entry.intent}` },
        { inlineData: { mimeType: 'image/png', data: await browser.takeScreenshot() } },
    ], RESPONSE_SCHEMA);
    if (proposal?.box_2d.length !== 4) return undefined;

    // Gemini boxes are [ymin, xmin, ymax, xmax] on a 0-1000 grid; scale to the viewport in CSS pixels.
    const [w, h] = await browser.execute(() => [innerWidth, innerHeight]);
    const [ymin, xmin, ymax, xmax] = proposal.box_2d;
    const box = { x: (xmin / 1000) * w, y: (ymin / 1000) * h, width: ((xmax - xmin) / 1000) * w, height: ((ymax - ymin) / 1000) * h };
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);

    const screenshot = await recordHeal(box, {
        id: entry.id,
        tier: 3,
        from: entry.selector,
        to: `click @ (${x}, ${y})`,
        confidence: proposal.confidence,
        reasoning: proposal.reasoning,
    });

    appendPending({
        id: entry.id,
        tier: 3,
        oldSelector: entry.selector,
        proposed: `click @ (${x}, ${y}), box [${proposal.box_2d.join(', ')}] /1000`,
        confidence: proposal.confidence,
        reasoning: proposal.reasoning,
        screenshot,
    });

    // There is no DOM node to return, so hand back the actions page objects use, done by coordinates.
    const click = () => browser.action('pointer').move({ x, y, origin: 'viewport' }).down().up().perform();
    return {
        click,
        setValue: async (value: string) => { await click(); await browser.keys(value); },
    };
}
