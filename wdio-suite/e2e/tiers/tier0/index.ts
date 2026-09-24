import { $ } from '@wdio/globals';
import { touchLocator, type LocatorEntry } from '../../helpers/locatorStore.js';

/** Tier 0 — try the selector already in locatorStore.json. */
export async function resolve(entry: LocatorEntry) {
    const el = $(entry.selector);
    if (await el.isExisting()) {
        touchLocator(entry.id);
        return el;
    }
    return undefined;
}
