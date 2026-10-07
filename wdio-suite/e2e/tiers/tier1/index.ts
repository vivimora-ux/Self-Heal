import { $ } from '@wdio/globals';
import { healLocator, type LocatorEntry } from '../../helpers/locatorStore.js';
import { recordHeal } from '../../helpers/healReport.js';

/** Tier 1 — try each fallback selector in order; heal the store with the one that works. */
export async function resolve(entry: LocatorEntry) {
    for (const candidate of entry.fallbacks) {
        const el = $(candidate);
        if (await el.isExisting()) {
            healLocator(entry.id, candidate, 1);
            await recordHeal(el, { id: entry.id, tier: 1, from: entry.selector, to: candidate });
            return el;
        }
    }
    return undefined;
}
