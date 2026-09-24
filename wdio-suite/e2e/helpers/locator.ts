import { getLocator } from './locatorStore.js';
import * as tier0 from '../tiers/tier0/index.js';
import * as tier1 from '../tiers/tier1/index.js';
import * as tier2 from '../tiers/tier2/index.js';
import * as tier3 from '../tiers/tier3/index.js';

const TIERS = [tier0, tier1, tier2, tier3];

/** Resolves an element by locator id, escalating through tiers 0-3 until one finds it. */
export async function locator(id: string) {
    const entry = getLocator(id);

    for (const tier of TIERS) {
        const el = await tier.resolve(entry);
        if (el) return el;
    }

    throw new Error(`locator("${id}"): no tier resolved an element`);
}
